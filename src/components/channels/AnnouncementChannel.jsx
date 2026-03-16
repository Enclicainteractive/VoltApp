import React, { useState, useEffect } from 'react'
import { Megaphone, Pin, Bell, Clock, CheckCircle, Bookmark, Sparkles } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import Avatar from '../Avatar'
import './AnnouncementChannel.css'

const formatSafeDateTime = (value) => {
  if (!value) return 'Unknown date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const AnnouncementChannel = ({ channelId, serverId, channel, isAdmin }) => {
  const { t } = useTranslation()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImage, setNewImage] = useState('')
  const [notifyStatus, setNotifyStatus] = useState('')

  useEffect(() => {
    loadAnnouncements()
  }, [channelId])

  const loadAnnouncements = async () => {
    try {
      setLoading(true)
      const [messagesRes, pinnedRes] = await Promise.all([
        apiService.getMessages(channelId),
        apiService.getPinnedMessages(channelId).catch(() => ({ data: [] }))
      ])
      const messages = Array.isArray(messagesRes.data) ? [...messagesRes.data].reverse() : []
      setAnnouncements(messages)
      const pinnedItems = Array.isArray(pinnedRes.data) ? pinnedRes.data : []
      setPinnedAnnouncement(pinnedItems[0] || null)
    } catch (error) {
      console.error('Failed to load announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAnnouncement = async () => {
    if (!newTitle.trim() || !newContent.trim()) return

    try {
      await apiService.sendMessage(channelId, {
        content: newContent,
        metadata: {
          title: newTitle,
          isAnnouncement: true,
          image: newImage
        }
      })
      setShowCreate(false)
      setNewTitle('')
      setNewContent('')
      setNewImage(null)
      loadAnnouncements()
    } catch (error) {
      console.error('Failed to create announcement:', error)
    }
  }

  const handlePinAnnouncement = async (announcement) => {
    try {
      if (announcement.id === pinnedAnnouncement?.id) {
        await apiService.unpinMessage(channelId, announcement.id)
      } else {
        await apiService.pinMessage(channelId, announcement.id)
      }
      loadAnnouncements()
    } catch (error) {
      console.error('Failed to pin announcement:', error)
    }
  }

  const handleNotifyAnnouncement = async (announcement) => {
    try {
      await apiService.notifyChannelMessage(channelId, announcement.id)
      setNotifyStatus(announcement.id)
      window.setTimeout(() => setNotifyStatus(''), 2500)
    } catch (error) {
      console.error('Failed to notify announcement subscribers:', error)
    }
  }

  return (
    <div className="announcement-channel">
      <div className="announcement-header">
        <div className="announcement-header-content">
          <Megaphone size={24} />
          <div>
            <h2>{channel?.name || 'Announcements'}</h2>
            <p>{channel?.topic || 'Important updates and news'}</p>
          </div>
        </div>
        <div className="announcement-header-meta">
          <span className="announcement-count-pill">
            <Sparkles size={14} />
            {announcements.length} {t('announcements.posts', 'posts')}
          </span>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Megaphone size={16} />
            {t('announcements.new', 'New Announcement')}
          </button>
        )}
      </div>

      {pinnedAnnouncement && (
        <div className="pinned-announcement">
          <div className="pinned-badge">
            <Pin size={12} />
            {t('announcements.pinned', 'Pinned')}
          </div>
          <div className="pinned-content">
            <h3>{pinnedAnnouncement.metadata?.title || pinnedAnnouncement.content?.substring(0, 50)}</h3>
            <p>{pinnedAnnouncement.content}</p>
            <div className="pinned-meta">
              <Avatar src={pinnedAnnouncement.avatar} fallback={pinnedAnnouncement.username} size={20} />
              <span>{pinnedAnnouncement.username}</span>
              <span><Clock size={12} /> {formatSafeDateTime(pinnedAnnouncement.createdAt || pinnedAnnouncement.timestamp)}</span>
            </div>
          </div>
          {isAdmin && (
            <button 
              className="unpin-btn"
              onClick={() => handlePinAnnouncement(pinnedAnnouncement)}
              title={t('announcements.unpin', 'Unpin')}
            >
              <Pin size={14} />
            </button>
          )}
        </div>
      )}

      <div className="announcements-list">
        {loading ? (
          <div className="announcements-loading">
            <div className="spinner"></div>
            <p>{t('common.loading', 'Loading...')}</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="announcements-empty">
            <Megaphone size={48} />
            <h3>{t('announcements.noAnnouncements', 'No announcements yet')}</h3>
            <p>{t('announcements.beFirst', 'Be the first to share an important update!')}</p>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Megaphone size={16} />
                {t('announcements.createFirst', 'Create Announcement')}
              </button>
            )}
          </div>
        ) : (
          announcements
            .filter(a => a.id !== pinnedAnnouncement?.id)
            .map(announcement => (
              <div 
                key={announcement.id} 
                className={`announcement-card ${announcement.id === pinnedAnnouncement?.id ? 'pinned' : ''}`}
              >
                <div className="announcement-card-header">
                  <Avatar src={announcement.avatar} fallback={announcement.username} size={40} />
                  <div className="announcement-meta">
                    <div className="announcement-author">
                      <span className="username">{announcement.username}</span>
                      <span className="date"><Clock size={12} /> {formatSafeDateTime(announcement.createdAt || announcement.timestamp)}</span>
                    </div>
                    {announcement.metadata?.title && (
                      <h3>{announcement.metadata.title}</h3>
                    )}
                  </div>
                  <div className="announcement-actions">
                    <button 
                      className="action-btn"
                      onClick={() => handlePinAnnouncement(announcement)}
                      title={announcement.id === pinnedAnnouncement?.id ? t('announcements.unpin', 'Unpin') : t('announcements.pin', 'Pin')}
                    >
                      <Pin size={14} />
                    </button>
                  </div>
                </div>
                <div className="announcement-content">
                  {announcement.content}
                </div>
                {(announcement.attachments?.[0] || announcement.metadata?.image) && (
                  <div className="announcement-image">
                    <img src={announcement.attachments?.[0]?.url || announcement.metadata?.image} alt="Attachment" />
                  </div>
                )}
                <div className="announcement-footer">
                  <button className={`reaction-btn ${notifyStatus === announcement.id ? 'success' : ''}`} onClick={() => handleNotifyAnnouncement(announcement)}>
                    <Bell size={14} />
                    {notifyStatus === announcement.id ? t('announcements.notified', 'Notified') : t('announcements.notify', 'Notify')}
                  </button>
                  <button className="reaction-btn">
                    <Bookmark size={14} />
                    {t('announcements.save', 'Save')}
                  </button>
                </div>
              </div>
            ))
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content wide announcement-create-modal" onClick={e => e.stopPropagation()}>
            <h2>{t('announcements.create', 'Create Announcement')}</h2>
            <div className="form-group">
              <label>{t('announcements.title', 'Title')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('announcements.titlePlaceholder', 'Announcement title')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t('announcements.content', 'Content')}</label>
              <textarea
                className="input"
                placeholder={t('announcements.contentPlaceholder', 'What do you want to announce?')}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={6}
              />
            </div>
            <div className="form-group">
              <label>{t('announcements.image', 'Cover image URL')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('announcements.imagePlaceholder', 'https://example.com/announcement-cover.png')}
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCreateAnnouncement}>
                <Megaphone size={16} />
                {t('announcements.publish', 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnnouncementChannel
