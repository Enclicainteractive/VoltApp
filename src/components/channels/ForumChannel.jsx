import React, { useEffect, useState } from 'react'
import { Clock, Image as ImageIcon, Link2, MessageCircle, MessageSquare, Paperclip, Plus, Search, Send, ThumbsUp, Trash2, User } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import { useAuth } from '../../contexts/AuthContext'
import Avatar from '../Avatar'
import ContextMenu from '../ContextMenu'
import '../../assets/styles/ContextMenu.css'
import './ForumChannel.css'

const formatSafeRelativeDate = (value) => {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const ForumChannel = ({ channelId, serverId, channel }) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedThread, setSelectedThread] = useState(null)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [newThreadContent, setNewThreadContent] = useState('')
  const [threadReply, setThreadReply] = useState('')
  const [newThreadFiles, setNewThreadFiles] = useState([])
  const [replyFiles, setReplyFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)

  const loadThreads = async () => {
    try {
      setLoading(true)
      const response = await apiService.getMessages(channelId)
      if (response.data) {
        setMessages(response.data)
      }
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [channelId])

  const uploadFiles = async (files) => {
    if (!Array.isArray(files) || files.length === 0) return []

    const uploaded = []
    for (const file of files) {
      const formData = new FormData()
      formData.append('files', file)
      const result = await apiService.uploadFile(serverId, formData, {
        channelId,
        type: file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'file'
      })
      const attachments = result?.data?.attachments || result?.attachments || []
      uploaded.push(...attachments)
    }
    return uploaded
  }

  const handleCreateThread = async () => {
    if (!newThreadTitle.trim() || !newThreadContent.trim()) return

    try {
      setSubmitting(true)
      const attachments = await uploadFiles(newThreadFiles)
      await apiService.sendMessage(channelId, {
        content: newThreadContent,
        attachments,
        metadata: {
          title: newThreadTitle,
          isForumThread: true
        }
      })
      setShowCreateThread(false)
      setNewThreadTitle('')
      setNewThreadContent('')
      setNewThreadFiles([])
      loadThreads()
    } catch (error) {
      console.error('Failed to create thread:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteForumMessage = async (message, e) => {
    if (!message?.id) return
    // Skip confirmation if shift key is held down
    const skipConfirm = e?.shiftKey
    if (!skipConfirm && !window.confirm(t('chat.deleteConfirm', 'Delete this message?'))) return
    try {
      await apiService.deleteMessage(message.id)
      setMessages((prev) => prev.filter((entry) => entry.id !== message.id))
      if (selectedThread?.id === message.id) {
        setSelectedThread(null)
      }
      setContextMenu(null)
    } catch (error) {
      console.error('Failed to delete forum message:', error)
    }
  }

  const openForumContextMenu = (event, message) => {
    event.preventDefault()
    event.stopPropagation()
    const isOwn = message.userId === user?.id
    const isThreadRoot = Boolean(message?.metadata?.isForumThread)
    const items = [
      {
        label: t('common.copyLink', 'Copy Link'),
        icon: <Link2 size={14} />,
        onClick: () => navigator.clipboard.writeText(`${window.location.origin}/chat/${channelId}?message=${message.id}`)
      },
      ...(isOwn ? [{
        label: isThreadRoot ? t('forum.deleteThread', 'Delete Thread') : t('common.delete', 'Delete'),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: (e) => handleDeleteForumMessage(message, e)
      }] : [])
    ]
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items
    })
  }

  const threadRoots = messages.filter((message) => message?.metadata?.isForumThread)

  const filteredThreads = threadRoots.filter((thread) =>
    thread.metadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.content?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedThreadReplies = messages
    .filter((message) => message?.metadata?.threadId === selectedThread?.id)
    .sort((a, b) => new Date(a.createdAt || a.timestamp || 0) - new Date(b.createdAt || b.timestamp || 0))

  const getThreadReplyCount = (threadId) => messages.filter((message) => message?.metadata?.threadId === threadId).length

  const handleReplySubmit = async () => {
    if (!selectedThread?.id || !threadReply.trim()) return
    try {
      setSubmitting(true)
      const attachments = await uploadFiles(replyFiles)
      await apiService.sendMessage(channelId, {
        content: threadReply,
        attachments,
        metadata: {
          threadId: selectedThread.id,
          isForumReply: true
        }
      })
      setThreadReply('')
      setReplyFiles([])
      loadThreads()
    } catch (error) {
      console.error('Failed to reply to thread:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const renderAttachments = (message) => {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : []
    if (attachments.length === 0) return null

    return (
      <div className="forum-attachments">
        {attachments.map((attachment, index) => {
          const url = attachment?.url || (attachment?.path ? `/uploads/${attachment.path}` : attachment)
          const contentType = attachment?.contentType || ''
          const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(url)
          if (isImage) {
            return (
              <a key={`${message.id}_${index}`} href={url} target="_blank" rel="noreferrer" className="forum-attachment-image">
                <img src={url} alt={attachment?.filename || 'Attachment'} />
              </a>
            )
          }
          return (
            <a key={`${message.id}_${index}`} href={url} target="_blank" rel="noreferrer" className="forum-attachment-file">
              <Paperclip size={14} />
              <span>{attachment?.filename || t('forum.attachment', 'Attachment')}</span>
            </a>
          )
        })}
      </div>
    )
  }

  return (
    <div className="forum-channel">
      <div className="forum-header">
        <div className="forum-header-content">
          <MessageSquare size={24} />
          <div>
            <h2>{channel?.name || 'Forum'}</h2>
            <p>{channel?.topic || 'Start a discussion'}</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateThread(true)}>
          <Plus size={16} />
          {t('forum.newThread', 'New Thread')}
        </button>
      </div>

      <div className="forum-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={t('forum.searchThreads', 'Search threads...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={`forum-content ${selectedThread ? 'thread-open' : ''}`}>
        {loading ? (
          <div className="forum-loading">
            <div className="spinner"></div>
            <p>{t('common.loading', 'Loading...')}</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="forum-empty">
            <MessageSquare size={48} />
            <h3>{t('forum.noThreads', 'No threads yet')}</h3>
            <p>{t('forum.beFirst', 'Be the first to start a discussion!')}</p>
            <button className="btn btn-primary" onClick={() => setShowCreateThread(true)}>
              <Plus size={16} />
              {t('forum.createFirst', 'Create Thread')}
            </button>
          </div>
        ) : (
          <div className="forum-layout">
            <div className="forum-threads">
              {filteredThreads.map((thread) => (
                <div
                  key={thread.id}
                  className={`forum-thread ${selectedThread?.id === thread.id ? 'active' : ''}`}
                  onClick={() => setSelectedThread(thread)}
                  onContextMenu={(event) => openForumContextMenu(event, thread)}
                >
                  <div className="thread-avatar">
                    <Avatar src={thread.avatar} fallback={thread.username} size={40} />
                  </div>
                  <div className="thread-content">
                    <div className="thread-header">
                      <h3>{thread.metadata?.title || thread.content?.substring(0, 50)}</h3>
                      <span className="thread-tag">{t('forum.thread', 'Thread')}</span>
                    </div>
                    <p className="thread-preview">{thread.content?.substring(0, 100)}</p>
                    <div className="thread-meta">
                      <span><User size={12} /> {thread.username}</span>
                      <span><Clock size={12} /> {formatSafeRelativeDate(thread.createdAt || thread.timestamp)}</span>
                    </div>
                  </div>
                  <div className="thread-stats">
                    <span><ThumbsUp size={12} /> {thread.reactions?.length || 0}</span>
                    <span><MessageCircle size={12} /> {getThreadReplyCount(thread.id)}</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedThread && (
              <aside className="forum-thread-panel">
                <div className="forum-thread-panel-header">
                  <div>
                    <span className="thread-panel-kicker">{t('forum.thread', 'Thread')}</span>
                    <h3>{selectedThread.metadata?.title || selectedThread.content?.substring(0, 50)}</h3>
                  </div>
                  <button type="button" className="thread-panel-close" onClick={() => setSelectedThread(null)}>
                    {t('common.close', 'Close')}
                  </button>
                </div>

                <div className="forum-thread-root" onContextMenu={(event) => openForumContextMenu(event, selectedThread)}>
                  <Avatar src={selectedThread.avatar} fallback={selectedThread.username} size={36} />
                  <div className="forum-thread-root-copy">
                    <div className="thread-meta">
                      <span><User size={12} /> {selectedThread.username}</span>
                      <span><Clock size={12} /> {formatSafeRelativeDate(selectedThread.createdAt || selectedThread.timestamp)}</span>
                    </div>
                    <p>{selectedThread.content}</p>
                    {renderAttachments(selectedThread)}
                    {selectedThread.userId === user?.id ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={(e) => handleDeleteForumMessage(selectedThread, e)}>
                        <Trash2 size={14} />
                        {t('forum.deleteThread', 'Delete Thread')}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="forum-thread-replies">
                  {selectedThreadReplies.length === 0 ? (
                    <div className="forum-thread-empty">
                      <MessageCircle size={20} />
                      <span>{t('forum.noReplies', 'No replies yet')}</span>
                    </div>
                  ) : selectedThreadReplies.map((reply) => (
                    <div key={reply.id} className="forum-thread-reply" onContextMenu={(event) => openForumContextMenu(event, reply)}>
                      <Avatar src={reply.avatar} fallback={reply.username} size={30} />
                      <div className="forum-thread-reply-copy">
                        <div className="thread-meta">
                          <span><User size={12} /> {reply.username}</span>
                          <span><Clock size={12} /> {formatSafeRelativeDate(reply.createdAt || reply.timestamp)}</span>
                        </div>
                        <p>{reply.content}</p>
                        {renderAttachments(reply)}
                        {reply.userId === user?.id ? (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => handleDeleteForumMessage(reply, e)}>
                            <Trash2 size={14} />
                            {t('common.delete', 'Delete')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="forum-thread-compose">
                  <textarea
                    className="input"
                    rows={4}
                    placeholder={t('forum.replyPlaceholder', 'Reply to this thread')}
                    value={threadReply}
                    onChange={(event) => setThreadReply(event.target.value)}
                  />
                  <div className="forum-compose-actions">
                    <label className="forum-upload-pill">
                      <Paperclip size={14} />
                      <span>{replyFiles.length > 0 ? t('forum.filesSelected', '{{count}} selected').replace('{{count}}', replyFiles.length) : t('forum.attach', 'Attach')}</span>
                      <input type="file" multiple onChange={(event) => setReplyFiles(Array.from(event.target.files || []))} />
                    </label>
                    <button className="btn btn-primary" onClick={handleReplySubmit} disabled={submitting}>
                      <Send size={16} />
                      {submitting ? t('common.saving', 'Saving...') : t('forum.reply', 'Reply')}
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>

      {showCreateThread && (
        <div className="modal-overlay" onClick={() => setShowCreateThread(false)}>
          <div className="modal-content wide forum-create-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('forum.createThread', 'Create New Thread')}</h2>
            <div className="form-group">
              <label>{t('forum.title', 'Title')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('forum.titlePlaceholder', 'Thread title')}
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t('forum.content', 'Content')}</label>
              <textarea
                className="input"
                placeholder={t('forum.contentPlaceholder', 'What\'s on your mind?')}
                value={newThreadContent}
                onChange={(e) => setNewThreadContent(e.target.value)}
                rows={6}
              />
            </div>
            <div className="form-group">
              <label>{t('forum.media', 'Attachments')}</label>
              <label className="forum-upload-field">
                <ImageIcon size={16} />
                <span>{newThreadFiles.length > 0 ? t('forum.filesSelected', '{{count}} selected').replace('{{count}}', newThreadFiles.length) : t('forum.addMedia', 'Add images or files')}</span>
                <input type="file" multiple onChange={(event) => setNewThreadFiles(Array.from(event.target.files || []))} />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateThread(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCreateThread} disabled={submitting}>
                {t('forum.create', 'Create Thread')}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  )
}

export default ForumChannel
