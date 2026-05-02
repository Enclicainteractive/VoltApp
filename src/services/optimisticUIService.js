class OptimisticUIService {
    constructor() {
        this.pendingActions = new Map();
        this.actionCounter = 0;
        this.rollbackQueue = [];
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.optimisticTimeout = 30000;
        
        this.eventListeners = new Map();
        this.middlewares = [];
        
        this.metrics = {
            totalActions: 0,
            successfulActions: 0,
            rolledBackActions: 0,
            averageCompletionTime: 0
        };
    }

    generateActionId() {
        return `optimistic_${++this.actionCounter}_${Date.now()}`;
    }

    addMiddleware(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        this.middlewares.push(middleware);
    }

    async executeOptimisticAction(actionType, optimisticUpdate, actualAction, rollbackAction, options = {}) {
        const actionId = this.generateActionId();
        const startTime = Date.now();
        
        this.metrics.totalActions++;

        try {
            for (const middleware of this.middlewares) {
                await middleware({
                    actionId,
                    actionType,
                    phase: 'before',
                    timestamp: startTime
                });
            }

            const pendingAction = {
                id: actionId,
                type: actionType,
                startTime,
                rollbackAction,
                retries: 0,
                options: {
                    timeout: options.timeout || this.optimisticTimeout,
                    skipRollback: options.skipRollback || false,
                    priority: options.priority || 'normal',
                    ...options
                }
            };

            this.pendingActions.set(actionId, pendingAction);

            const optimisticResult = await optimisticUpdate();
            this.emitEvent('optimistic-applied', { actionId, actionType, result: optimisticResult });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Optimistic action timeout')), pendingAction.options.timeout);
            });

            try {
                const actualResult = await Promise.race([actualAction(), timeoutPromise]);
                
                const completionTime = Date.now() - startTime;
                this.updateMetrics(true, completionTime);

                this.pendingActions.delete(actionId);
                
                for (const middleware of this.middlewares) {
                    await middleware({
                        actionId,
                        actionType,
                        phase: 'success',
                        result: actualResult,
                        completionTime,
                        timestamp: Date.now()
                    });
                }

                this.emitEvent('action-completed', { 
                    actionId, 
                    actionType, 
                    result: actualResult,
                    completionTime 
                });

                return { success: true, result: actualResult, actionId };

            } catch (error) {
                return await this.handleActionFailure(pendingAction, error);
            }

        } catch (error) {
            console.error('Failed to execute optimistic update:', error);
            this.updateMetrics(false, Date.now() - startTime);
            return { success: false, error: error.message, actionId };
        }
    }

    async handleActionFailure(pendingAction, error) {
        const { id: actionId, type: actionType, rollbackAction, options } = pendingAction;

        try {
            if (pendingAction.retries < this.maxRetries && !options.skipRetry) {
                pendingAction.retries++;
                
                this.emitEvent('action-retry', { 
                    actionId, 
                    actionType, 
                    attempt: pendingAction.retries,
                    error: error.message 
                });

                await new Promise(resolve => setTimeout(resolve, this.retryDelay * pendingAction.retries));
                
                return { success: false, retrying: true, actionId, attempt: pendingAction.retries };
            }

            if (!options.skipRollback && rollbackAction) {
                await this.performRollback(actionId, rollbackAction);
            }

            this.pendingActions.delete(actionId);
            this.updateMetrics(false, Date.now() - pendingAction.startTime);

            for (const middleware of this.middlewares) {
                await middleware({
                    actionId,
                    actionType,
                    phase: 'failure',
                    error: error.message,
                    retries: pendingAction.retries,
                    timestamp: Date.now()
                });
            }

            this.emitEvent('action-failed', { 
                actionId, 
                actionType, 
                error: error.message,
                retries: pendingAction.retries 
            });

            return { success: false, error: error.message, actionId };

        } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
            this.emitEvent('rollback-failed', { 
                actionId, 
                actionType, 
                originalError: error.message,
                rollbackError: rollbackError.message 
            });

            return { 
                success: false, 
                error: error.message, 
                rollbackError: rollbackError.message, 
                actionId 
            };
        }
    }

    async performRollback(actionId, rollbackAction) {
        try {
            this.rollbackQueue.push({ actionId, timestamp: Date.now() });
            
            await rollbackAction();
            this.metrics.rolledBackActions++;
            
            this.emitEvent('rollback-completed', { actionId });
            
        } catch (error) {
            console.error('Rollback execution failed:', error);
            throw error;
        }
    }

    async sendMessage(content, channelId, tempMessageId = null) {
        const messageId = tempMessageId || `temp_${Date.now()}`;
        const timestamp = new Date().toISOString();
        
        return this.executeOptimisticAction(
            'send_message',
            async () => {
                const optimisticMessage = {
                    id: messageId,
                    content,
                    channelId,
                    author: this.getCurrentUser(),
                    timestamp,
                    status: 'sending',
                    optimistic: true
                };

                this.addMessageToUI(optimisticMessage);
                return optimisticMessage;
            },
            async () => {
                const response = await fetch(`/api/channels/${channelId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                
                if (!response.ok) throw new Error('Failed to send message');
                return response.json();
            },
            async () => {
                this.removeMessageFromUI(messageId);
            },
            { timeout: 10000 }
        );
    }

    async deleteMessage(messageId, channelId) {
        let originalMessage = null;
        
        return this.executeOptimisticAction(
            'delete_message',
            async () => {
                originalMessage = this.getMessageFromUI(messageId);
                this.hideMessageInUI(messageId);
                return { messageId, hidden: true };
            },
            async () => {
                const response = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('Failed to delete message');
                return { messageId, deleted: true };
            },
            async () => {
                if (originalMessage) {
                    this.restoreMessageInUI(originalMessage);
                }
            }
        );
    }

    async editMessage(messageId, newContent, channelId) {
        let originalContent = null;
        
        return this.executeOptimisticAction(
            'edit_message',
            async () => {
                originalContent = this.getMessageContent(messageId);
                this.updateMessageInUI(messageId, {
                    content: newContent,
                    edited: true,
                    editedAt: new Date().toISOString(),
                    status: 'editing'
                });
                return { messageId, content: newContent };
            },
            async () => {
                const response = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent })
                });
                
                if (!response.ok) throw new Error('Failed to edit message');
                return response.json();
            },
            async () => {
                if (originalContent !== null) {
                    this.updateMessageInUI(messageId, {
                        content: originalContent,
                        edited: false,
                        status: 'sent'
                    });
                }
            }
        );
    }

    async addReaction(messageId, emoji, channelId) {
        return this.executeOptimisticAction(
            'add_reaction',
            async () => {
                this.addReactionToUI(messageId, emoji, this.getCurrentUser());
                return { messageId, emoji, added: true };
            },
            async () => {
                const response = await fetch(`/api/channels/${channelId}/messages/${messageId}/reactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emoji })
                });
                
                if (!response.ok) throw new Error('Failed to add reaction');
                return response.json();
            },
            async () => {
                this.removeReactionFromUI(messageId, emoji, this.getCurrentUser());
            }
        );
    }

    async joinChannel(channelId) {
        return this.executeOptimisticAction(
            'join_channel',
            async () => {
                this.addUserToChannelUI(channelId, this.getCurrentUser());
                return { channelId, joined: true };
            },
            async () => {
                const response = await fetch(`/api/channels/${channelId}/join`, {
                    method: 'POST'
                });
                
                if (!response.ok) throw new Error('Failed to join channel');
                return response.json();
            },
            async () => {
                this.removeUserFromChannelUI(channelId, this.getCurrentUser());
            }
        );
    }

    async updateStatus(status) {
        let originalStatus = null;
        
        return this.executeOptimisticAction(
            'update_status',
            async () => {
                originalStatus = this.getCurrentUserStatus();
                this.updateUserStatusUI(this.getCurrentUser().id, status);
                return { status, updated: true };
            },
            async () => {
                const response = await fetch('/api/users/me/status', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                
                if (!response.ok) throw new Error('Failed to update status');
                return response.json();
            },
            async () => {
                if (originalStatus !== null) {
                    this.updateUserStatusUI(this.getCurrentUser().id, originalStatus);
                }
            }
        );
    }

    addMessageToUI(message) {
        window.dispatchEvent(new CustomEvent('optimistic:message:add', { 
            detail: { message } 
        }));
    }

    removeMessageFromUI(messageId) {
        window.dispatchEvent(new CustomEvent('optimistic:message:remove', { 
            detail: { messageId } 
        }));
    }

    hideMessageInUI(messageId) {
        window.dispatchEvent(new CustomEvent('optimistic:message:hide', { 
            detail: { messageId } 
        }));
    }

    restoreMessageInUI(message) {
        window.dispatchEvent(new CustomEvent('optimistic:message:restore', { 
            detail: { message } 
        }));
    }

    updateMessageInUI(messageId, updates) {
        window.dispatchEvent(new CustomEvent('optimistic:message:update', { 
            detail: { messageId, updates } 
        }));
    }

    addReactionToUI(messageId, emoji, user) {
        window.dispatchEvent(new CustomEvent('optimistic:reaction:add', { 
            detail: { messageId, emoji, user } 
        }));
    }

    removeReactionFromUI(messageId, emoji, user) {
        window.dispatchEvent(new CustomEvent('optimistic:reaction:remove', { 
            detail: { messageId, emoji, user } 
        }));
    }

    addUserToChannelUI(channelId, user) {
        window.dispatchEvent(new CustomEvent('optimistic:channel:user:add', { 
            detail: { channelId, user } 
        }));
    }

    removeUserFromChannelUI(channelId, user) {
        window.dispatchEvent(new CustomEvent('optimistic:channel:user:remove', { 
            detail: { channelId, user } 
        }));
    }

    updateUserStatusUI(userId, status) {
        window.dispatchEvent(new CustomEvent('optimistic:user:status:update', { 
            detail: { userId, status } 
        }));
    }

    getMessageFromUI(messageId) {
        const event = new CustomEvent('optimistic:message:get', { 
            detail: { messageId, response: null } 
        });
        window.dispatchEvent(event);
        return event.detail.response;
    }

    getMessageContent(messageId) {
        const message = this.getMessageFromUI(messageId);
        return message ? message.content : null;
    }

    getCurrentUser() {
        const event = new CustomEvent('optimistic:user:current', { 
            detail: { response: null } 
        });
        window.dispatchEvent(event);
        return event.detail.response || { id: 'unknown', username: 'Unknown' };
    }

    getCurrentUserStatus() {
        const user = this.getCurrentUser();
        return user.status || 'online';
    }

    addEventListener(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(callback);
    }

    removeEventListener(eventType, callback) {
        if (this.eventListeners.has(eventType)) {
            const listeners = this.eventListeners.get(eventType);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emitEvent(eventType, data) {
        if (this.eventListeners.has(eventType)) {
            this.eventListeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    updateMetrics(success, completionTime) {
        if (success) {
            this.metrics.successfulActions++;
        }
        
        const totalCompleted = this.metrics.successfulActions + this.metrics.rolledBackActions;
        this.metrics.averageCompletionTime = (
            (this.metrics.averageCompletionTime * (totalCompleted - 1) + completionTime) / totalCompleted
        );
    }

    getMetrics() {
        const successRate = this.metrics.totalActions > 0 
            ? (this.metrics.successfulActions / this.metrics.totalActions) * 100 
            : 0;

        return {
            ...this.metrics,
            successRate: Math.round(successRate * 100) / 100,
            pendingActions: this.pendingActions.size,
            rollbackQueueSize: this.rollbackQueue.length
        };
    }

    getPendingActions() {
        return Array.from(this.pendingActions.entries()).map(([id, action]) => ({
            id,
            type: action.type,
            startTime: action.startTime,
            duration: Date.now() - action.startTime,
            retries: action.retries,
            priority: action.options.priority
        }));
    }

    async cancelAction(actionId) {
        const pendingAction = this.pendingActions.get(actionId);
        if (!pendingAction) {
            return { success: false, error: 'Action not found' };
        }

        try {
            if (pendingAction.rollbackAction && !pendingAction.options.skipRollback) {
                await this.performRollback(actionId, pendingAction.rollbackAction);
            }

            this.pendingActions.delete(actionId);
            this.emitEvent('action-cancelled', { actionId, actionType: pendingAction.type });

            return { success: true, actionId };

        } catch (error) {
            console.error('Failed to cancel action:', error);
            return { success: false, error: error.message, actionId };
        }
    }

    async cancelAllActions() {
        const actionIds = Array.from(this.pendingActions.keys());
        const results = await Promise.allSettled(
            actionIds.map(id => this.cancelAction(id))
        );

        return {
            cancelled: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
            failed: results.filter(r => r.status === 'rejected' || !r.value.success).length,
            total: actionIds.length
        };
    }

    createOptimisticHook() {
        const service = this;
        
        return {
            useOptimisticAction: (actionType, optimisticUpdate, actualAction, rollbackAction, options) => {
                return async () => {
                    return service.executeOptimisticAction(
                        actionType,
                        optimisticUpdate,
                        actualAction,
                        rollbackAction,
                        options
                    );
                };
            },
            
            useOptimisticState: (initialState) => {
                let state = initialState;
                const subscribers = new Set();
                
                return {
                    getState: () => state,
                    setState: (newState) => {
                        state = newState;
                        subscribers.forEach(callback => callback(state));
                    },
                    subscribe: (callback) => {
                        subscribers.add(callback);
                        return () => subscribers.delete(callback);
                    }
                };
            },
            
            getPendingActions: () => service.getPendingActions(),
            getMetrics: () => service.getMetrics(),
            addEventListener: (type, callback) => service.addEventListener(type, callback),
            removeEventListener: (type, callback) => service.removeEventListener(type, callback)
        };
    }

    destroy() {
        this.eventListeners.clear();
        this.pendingActions.clear();
        this.rollbackQueue.length = 0;
        this.middlewares.length = 0;
    }
}

export default OptimisticUIService;