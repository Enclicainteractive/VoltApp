import React, { useState, useEffect } from 'react';
import useOptimisticUI from '../hooks/useOptimisticUI';

const OptimisticLoadingIndicator = ({ 
    className = '',
    showMetrics = false,
    position = 'top-right',
    theme = 'dark'
}) => {
    const { pendingActions, metrics, isProcessing } = useOptimisticUI();
    const [isVisible, setIsVisible] = useState(false);
    const [animationPhase, setAnimationPhase] = useState('idle');

    useEffect(() => {
        if (isProcessing) {
            setIsVisible(true);
            setAnimationPhase('active');
        } else {
            setAnimationPhase('completing');
            setTimeout(() => {
                setIsVisible(false);
                setAnimationPhase('idle');
            }, 300);
        }
    }, [isProcessing]);

    const getPositionClasses = () => {
        const positions = {
            'top-right': 'top-4 right-4',
            'top-left': 'top-4 left-4',
            'bottom-right': 'bottom-4 right-4',
            'bottom-left': 'bottom-4 left-4',
            'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
            'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2'
        };
        return positions[position] || positions['top-right'];
    };

    const getThemeClasses = () => {
        const themes = {
            dark: 'bg-gray-800 text-white border-gray-600',
            light: 'bg-white text-gray-800 border-gray-300',
            primary: 'bg-blue-600 text-white border-blue-500',
            accent: 'bg-purple-600 text-white border-purple-500'
        };
        return themes[theme] || themes.dark;
    };

    const getActionIcon = (actionType) => {
        const icons = {
            send_message: '📤',
            delete_message: '🗑️',
            edit_message: '✏️',
            add_reaction: '😊',
            join_channel: '👋',
            update_status: '🟢',
            default: '⚡'
        };
        return icons[actionType] || icons.default;
    };

    const getActionLabel = (actionType) => {
        const labels = {
            send_message: 'Sending message',
            delete_message: 'Deleting message',
            edit_message: 'Editing message',
            add_reaction: 'Adding reaction',
            join_channel: 'Joining channel',
            update_status: 'Updating status',
            default: 'Processing'
        };
        return labels[actionType] || labels.default;
    };

    if (!isVisible && pendingActions.length === 0) {
        return null;
    }

    return (
        <div 
            className={`
                fixed z-50 ${getPositionClasses()}
                transition-all duration-300 ease-in-out
                ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${className}
            `}
        >
            <div 
                className={`
                    rounded-lg shadow-lg border backdrop-blur-sm
                    ${getThemeClasses()}
                    ${animationPhase === 'active' ? 'animate-pulse' : ''}
                    min-w-64 max-w-80
                `}
            >
                <div className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div 
                                className={`
                                    w-3 h-3 rounded-full
                                    ${animationPhase === 'active' 
                                        ? 'bg-blue-400 animate-ping' 
                                        : animationPhase === 'completing'
                                        ? 'bg-green-400'
                                        : 'bg-gray-400'
                                    }
                                `}
                            />
                            {animationPhase === 'active' && (
                                <div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-600" />
                            )}
                        </div>
                        
                        <div className="flex-1">
                            {pendingActions.length === 1 ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">
                                        {getActionIcon(pendingActions[0].type)}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {getActionLabel(pendingActions[0].type)}
                                    </span>
                                </div>
                            ) : pendingActions.length > 1 ? (
                                <div>
                                    <div className="text-sm font-medium">
                                        Processing {pendingActions.length} actions
                                    </div>
                                    <div className="text-xs opacity-75 mt-1">
                                        {pendingActions.slice(0, 2).map(action => 
                                            getActionLabel(action.type)
                                        ).join(', ')}
                                        {pendingActions.length > 2 && ` +${pendingActions.length - 2} more`}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm font-medium">
                                    {animationPhase === 'completing' ? 'Completed' : 'Processing'}
                                </div>
                            )}
                        </div>

                        {animationPhase === 'completing' && (
                            <div className="text-green-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path 
                                        fillRule="evenodd" 
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                                        clipRule="evenodd" 
                                    />
                                </svg>
                            </div>
                        )}
                    </div>

                    {showMetrics && metrics.totalActions > 0 && (
                        <div className="mt-3 pt-2 border-t border-opacity-20 border-current">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="text-center">
                                    <div className="font-medium">{metrics.totalActions}</div>
                                    <div className="opacity-75">Total</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-medium">{metrics.successRate}%</div>
                                    <div className="opacity-75">Success</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-medium">{metrics.averageCompletionTime}ms</div>
                                    <div className="opacity-75">Avg Time</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {pendingActions.length > 0 && (
                        <div className="mt-2">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                <div 
                                    className="bg-blue-500 h-1 rounded-full transition-all duration-500 ease-out animate-pulse"
                                    style={{ 
                                        width: pendingActions.length > 0 ? '100%' : '0%'
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OptimisticLoadingIndicator;