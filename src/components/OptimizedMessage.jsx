import React, { memo, useMemo, useCallback } from 'react'
import { formatDistance } from 'date-fns'
import Avatar from './Avatar'
import MarkdownMessage from './MarkdownMessage'
import FileAttachment from './FileAttachment'

// Memoized reaction component for better performance
const ReactionButton = memo(({ reaction, onReactionClick, currentUserId }) => {
  const isReacted = useMemo(() => 
    reaction.users?.some(user => user.id === currentUserId), 
    [reaction.users, currentUserId]
  )
  
  const handleClick = useCallback(() => {
    onReactionClick(reaction.emoji, isReacted)
  }, [onReactionClick, reaction.emoji, isReacted])
  
  return (
    <button
      className={`reaction-button ${isReacted ? 'reacted' : ''}`}
      onClick={handleClick}
      title={reaction.users?.map(u => u.username).join(', ') || ''}
    >
      <span className="reaction-emoji">{reaction.emoji}</span>
      <span className="reaction-count">{reaction.count || reaction.users?.length || 0}</span>
    </button>
  )
})

ReactionButton.displayName = 'ReactionButton'

// Memoized message component to prevent unnecessary re-renders
const OptimizedMessage = memo(({ 
  message, 
  currentUserId, 
  onReactionClick, 
  onReply, 
  onEdit, 
  onDelete, 
  showAvatar = true,
  isHighlighted = false,
  members = [],
  serverEmojis = []
}) => {
  // Memoize expensive computations
  const messageTime = useMemo(() => 
    formatDistance(new Date(message.timestamp), new Date(), { addSuffix: true }),
    [message.timestamp]
  )
  
  const author = useMemo(() => 
    members.find(m => m.id === message.userId) || { 
      id: message.userId, 
      username: message.username || 'Unknown User',
      avatar: message.avatar
    },
    [members, message.userId, message.username, message.avatar]
  )
  
  const isOwnMessage = useMemo(() => 
    message.userId === currentUserId,
    [message.userId, currentUserId]
  )
  
  const hasReactions = useMemo(() => 
    message.reactions && message.reactions.length > 0,
    [message.reactions]
  )
  
  const hasAttachments = useMemo(() => 
    message.attachments && message.attachments.length > 0,
    [message.attachments]
  )
  
  // Callbacks with memoization
  const handleReply = useCallback(() => {
    onReply?.(message)
  }, [onReply, message])
  
  const handleEdit = useCallback(() => {
    onEdit?.(message)
  }, [onEdit, message])
  
  const handleDelete = useCallback(() => {
    onDelete?.(message)
  }, [onDelete, message])
  
  const handleReactionClick = useCallback((emoji, isReacted) => {
    onReactionClick?.(message.id, emoji, isReacted)
  }, [onReactionClick, message.id])
  
  // Early return for deleted messages
  if (message.deleted) {
    return (
      <div className="message deleted">
        <span className="deleted-message-text">Message deleted</span>
      </div>
    )
  }
  
  return (
    <div className={`message ${isHighlighted ? 'highlighted' : ''} ${isOwnMessage ? 'own-message' : ''}`}>
      {showAvatar && (
        <div className="message-avatar">
          <Avatar 
            user={author} 
            size={40} 
            showStatus={false}
          />
        </div>
      )}
      
      <div className="message-content">
        <div className="message-header">
          <span className="message-author">{author.username}</span>
          <span className="message-timestamp" title={new Date(message.timestamp).toLocaleString()}>
            {messageTime}
          </span>
        </div>
        
        {message.replyTo && (
          <div className="message-reply-preview">
            <span>Replying to {message.replyTo.username}</span>
          </div>
        )}
        
        <div className="message-body">
          <MarkdownMessage 
            content={message.content} 
            serverEmojis={serverEmojis}
          />
        </div>
        
        {hasAttachments && (
          <div className="message-attachments">
            {message.attachments.map((attachment, index) => (
              <FileAttachment 
                key={`${message.id}-${index}`} 
                attachment={attachment} 
              />
            ))}
          </div>
        )}
        
        {hasReactions && (
          <div className="message-reactions">
            {message.reactions.map((reaction, index) => (
              <ReactionButton
                key={`${message.id}-${reaction.emoji}-${index}`}
                reaction={reaction}
                onReactionClick={handleReactionClick}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
        
        <div className="message-actions">
          <button onClick={handleReply} className="message-action-btn" title="Reply">
            ↵
          </button>
          {isOwnMessage && (
            <>
              <button onClick={handleEdit} className="message-action-btn" title="Edit">
                ✏️
              </button>
              <button onClick={handleDelete} className="message-action-btn" title="Delete">
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
})

OptimizedMessage.displayName = 'OptimizedMessage'

export default OptimizedMessage