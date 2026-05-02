import { useState, useEffect, useRef, useCallback } from 'react';
import OptimisticUIService from '../services/optimisticUIService';

const useOptimisticUI = () => {
    const serviceRef = useRef(null);
    const [pendingActions, setPendingActions] = useState([]);
    const [metrics, setMetrics] = useState({
        totalActions: 0,
        successfulActions: 0,
        successRate: 0,
        averageCompletionTime: 0
    });

    useEffect(() => {
        if (!serviceRef.current) {
            serviceRef.current = new OptimisticUIService();
        }

        const service = serviceRef.current;

        const updatePendingActions = () => {
            setPendingActions(service.getPendingActions());
        };

        const updateMetrics = () => {
            setMetrics(service.getMetrics());
        };

        service.addEventListener('optimistic-applied', updatePendingActions);
        service.addEventListener('action-completed', () => {
            updatePendingActions();
            updateMetrics();
        });
        service.addEventListener('action-failed', () => {
            updatePendingActions();
            updateMetrics();
        });
        service.addEventListener('action-cancelled', updatePendingActions);

        const metricsInterval = setInterval(updateMetrics, 1000);

        return () => {
            clearInterval(metricsInterval);
            if (serviceRef.current) {
                serviceRef.current.destroy();
                serviceRef.current = null;
            }
        };
    }, []);

    const executeOptimisticAction = useCallback(async (actionType, optimisticUpdate, actualAction, rollbackAction, options) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.executeOptimisticAction(
            actionType,
            optimisticUpdate,
            actualAction,
            rollbackAction,
            options
        );
    }, []);

    const sendMessage = useCallback(async (content, channelId, tempMessageId) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.sendMessage(content, channelId, tempMessageId);
    }, []);

    const deleteMessage = useCallback(async (messageId, channelId) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.deleteMessage(messageId, channelId);
    }, []);

    const editMessage = useCallback(async (messageId, newContent, channelId) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.editMessage(messageId, newContent, channelId);
    }, []);

    const addReaction = useCallback(async (messageId, emoji, channelId) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.addReaction(messageId, emoji, channelId);
    }, []);

    const updateStatus = useCallback(async (status) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.updateStatus(status);
    }, []);

    const cancelAction = useCallback(async (actionId) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        return serviceRef.current.cancelAction(actionId);
    }, []);

    const addMiddleware = useCallback((middleware) => {
        if (!serviceRef.current) {
            throw new Error('OptimisticUI service not initialized');
        }
        
        serviceRef.current.addMiddleware(middleware);
    }, []);

    return {
        executeOptimisticAction,
        sendMessage,
        deleteMessage,
        editMessage,
        addReaction,
        updateStatus,
        cancelAction,
        addMiddleware,
        pendingActions,
        metrics,
        isProcessing: pendingActions.length > 0
    };
};

export default useOptimisticUI;