import React, { useEffect, useState } from 'react'
import { Download, Eye, Grid, Heart, Image, Link2, List, MessageCircle, Sparkles, Trash2, Type, Upload, Video, X } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import Avatar from '../Avatar'
import ContextMenu from '../ContextMenu'
import '../../assets/styles/ContextMenu.css'
import './MediaChannel.css'

const formatSafeDate = (value) => {
  if (!value) return 'Unknown date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return parsed.toLocaleDateString()
}

const MediaChannel = ({ channelId, serverId, channel }) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { socket } = useSocket()
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const [contextMenu, setContextMenu] = useState(null)

  const loadMedia = async () => {
    try {
      setLoading(true)
      const response = await apiService.getMessages(channelId)
      if (response.data) {
        const mediaItems = response.data.filter((msg) =>
          !msg.deleted && (msg.attachments?.length > 0 || msg.type === 'image' || msg.type === 'video')
        )
        setMedia(mediaItems)
      }
    } catch (error) {
      console.error('Failed to load media:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMedia()
  }, [channelId])

  useEffect(() => {
    if (!socket || !channelId) return undefined

    const handleMessageDeleted = ({ messageId }) => {
      setMedia((prev) => prev.filter((item) => item.id !== messageId))
      setSelectedMedia((current) => current?.id === messageId ? null : current)
    }

    socket.on('message:deleted', handleMessageDeleted)
    return () => {
      socket.off('message:deleted', handleMessageDeleted)
    }
  }, [socket, channelId])

  const getMediaUrl = (attachment) => {
    if (attachment?.url) return attachment.url
    if (attachment?.path) return `/uploads/${attachment.path}`
    return attachment
  }

  const isImage = (item) => (
    item?.type === 'image' ||
    item?.attachments?.[0]?.contentType?.startsWith('image/') ||
    item?.attachments?.[0]?.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
  )

  const isVideo = (item) => (
    item?.type === 'video' ||
    item?.attachments?.[0]?.contentType?.startsWith('video/') ||
    item?.attachments?.[0]?.url?.match(/\.(mp4|webm|mov)/i)
  )

  const filteredMedia = media.filter((item) => {
    const title = item.metadata?.title || item.content || ''
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase())
    if (filter === 'all') return matchesSearch
    if (filter === 'images') return matchesSearch && isImage(item)
    if (filter === 'videos') return matchesSearch && isVideo(item)
    return matchesSearch
  })

  const handleDeleteMedia = async (item, e) => {
    if (!item?.id) return
    // Skip confirmation if shift key is held down
    const skipConfirm = e?.shiftKey
    if (!skipConfirm && !window.confirm(t('chat.deleteConfirm', 'Delete this message?'))) return
    try {
      if (socket) {
        socket.emit('message:delete', { messageId: item.id, channelId })
      } else {
        await apiService.deleteMessage(item.id)
      }
      setMedia((prev) => prev.filter((entry) => entry.id !== item.id))
      setSelectedMedia((current) => current?.id === item.id ? null : current)
      setContextMenu(null)
    } catch (error) {
      console.error('Failed to delete media item:', error)
    }
  }

  const openMediaContextMenu = (event, item) => {
    event.preventDefault()
    event.stopPropagation()
    const attachment = item.attachments?.[0]
    const mediaUrl = attachment ? getMediaUrl(attachment) : ''
    const isOwn = item.userId === user?.id
    const items = [
      {
        label: t('common.open', 'Open'),
        icon: <Eye size={14} />,
        onClick: () => setSelectedMedia(item)
      },
      {
        label: t('common.copyLink', 'Copy Link'),
        icon: <Link2 size={14} />,
        onClick: () => mediaUrl && navigator.clipboard.writeText(mediaUrl)
      },
      {
        label: t('common.download', 'Download'),
        icon: <Download size={14} />,
        onClick: () => mediaUrl && window.open(mediaUrl, '_blank', 'noopener,noreferrer')
      },
      ...(isOwn ? [{
        label: t('common.delete', 'Delete'),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: (e) => handleDeleteMedia(item, e)
      }] : [])
    ]

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items
    })
  }

  const handleUpload = async (files) => {
    if (files.length === 0) return

    setUploading(true)
    try {
      const sharedTitle = uploadTitle.trim()
      const sharedCaption = uploadCaption.trim()
      for (const file of files) {
        const formData = new FormData()
        formData.append('files', file)

        const uploadResult = await apiService.uploadFile(serverId, formData, {
          channelId,
          type: file.type.startsWith('video/') ? 'video' : 'image'
        })
        const attachments = uploadResult?.data?.attachments || uploadResult?.attachments || []
        if (attachments.length > 0) {
          await apiService.sendMessage(channelId, {
            content: sharedCaption || sharedTitle || file.name || '',
            metadata: {
              title: sharedTitle || file.name || t('media.untitled', 'Untitled media')
            },
            attachments
          })
        }
      }
      setUploadTitle('')
      setUploadCaption('')
      setShowUpload(false)
      loadMedia()
    } catch (error) {
      console.error('Failed to upload media:', error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="media-channel">
      <div className="media-header">
        <div className="media-header-content">
          <Image size={24} />
          <div>
            <h2>{channel?.name || 'Media'}</h2>
            <p>{channel?.topic || 'Share photos and videos'}</p>
          </div>
        </div>
        <div className="media-header-stat">
          <Sparkles size={14} />
          <span>{filteredMedia.length} {t('media.items', 'items')}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Upload size={16} />
          {t('media.upload', 'Upload')}
        </button>
      </div>

      <div className="media-toolbar">
        <div className="media-search">
          <Image size={16} />
          <input
            type="text"
            placeholder={t('media.search', 'Search media...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="media-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            {t('media.all', 'All')}
          </button>
          <button className={filter === 'images' ? 'active' : ''} onClick={() => setFilter('images')}>
            <Image size={14} />
            {t('media.images', 'Images')}
          </button>
          <button className={filter === 'videos' ? 'active' : ''} onClick={() => setFilter('videos')}>
            <Video size={14} />
            {t('media.videos', 'Videos')}
          </button>
        </div>
        <div className="media-view-toggle">
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
            <Grid size={16} />
          </button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
            <List size={16} />
          </button>
        </div>
      </div>

      <div className="media-content">
        {loading ? (
          <div className="media-loading">
            <div className="spinner"></div>
            <p>{t('common.loading', 'Loading...')}</p>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="media-empty">
            <Image size={48} />
            <h3>{t('media.noMedia', 'No media yet')}</h3>
            <p>{t('media.beFirst', 'Be the first to share photos and videos!')}</p>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              <Upload size={16} />
              {t('media.uploadFirst', 'Upload Media')}
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="media-grid">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                className="media-item"
                onClick={() => setSelectedMedia(item)}
                onContextMenu={(event) => openMediaContextMenu(event, item)}
              >
                {isImage(item) && item.attachments?.[0] && (
                  <img
                    src={getMediaUrl(item.attachments[0])}
                    alt={item.content || 'Media'}
                    loading="lazy"
                  />
                )}
                {isVideo(item) && item.attachments?.[0] && (
                  <video src={getMediaUrl(item.attachments[0])} />
                )}
                <div className="media-overlay">
                  <strong>{item.metadata?.title || item.content || t('media.untitled', 'Untitled media')}</strong>
                  <span><Eye size={12} /> {item.views || 0}</span>
                  <span><Heart size={12} /> {item.reactions?.length || 0}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="media-list">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                className="media-list-item"
                onClick={() => setSelectedMedia(item)}
                onContextMenu={(event) => openMediaContextMenu(event, item)}
              >
                <div className="media-list-thumb">
                  {isImage(item) && item.attachments?.[0] && (
                    <img src={getMediaUrl(item.attachments[0])} alt="Thumbnail" />
                  )}
                  {isVideo(item) && item.attachments?.[0] && (
                    <video src={getMediaUrl(item.attachments[0])} />
                  )}
                </div>
                <div className="media-list-info">
                  <p className="media-list-name">{item.metadata?.title || item.content || t('media.untitled', 'Untitled media')}</p>
                  <p className="media-list-meta">
                    <span>{item.username}</span>
                    <span>{formatSafeDate(item.createdAt || item.timestamp)}</span>
                  </p>
                </div>
                <div className="media-list-actions">
                  <button type="button"><Heart size={14} /></button>
                  <button type="button"><MessageCircle size={14} /></button>
                  <button type="button"><Download size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal-content wide media-upload-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('media.uploadMedia', 'Upload Media')}</h2>
            <div className="media-upload-fields">
              <label className="media-upload-field">
                <span><Type size={14} /> {t('media.title', 'Title')}</span>
                <input
                  className="input"
                  type="text"
                  placeholder={t('media.titlePlaceholder', 'Give this upload a title')}
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </label>
              <label className="media-upload-field">
                <span>{t('media.caption', 'Caption')}</span>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={t('media.captionPlaceholder', 'Add context, credits, or a short description')}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                />
              </label>
            </div>
            <div className="upload-zone" onClick={() => document.getElementById('media-upload-input')?.click()}>
              <input
                id="media-upload-input"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => handleUpload(Array.from(e.target.files || []))}
                style={{ display: 'none' }}
              />
              <Upload size={48} />
              <p>{t('media.dropFiles', 'Drop files here or click to upload')}</p>
              <span>{t('media.supported', 'Supports: JPG, PNG, GIF, MP4, WebM')}</span>
            </div>
            {uploading && (
              <div className="upload-progress">
                <div className="spinner"></div>
                <p>{t('media.uploading', 'Uploading...')}</p>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMedia && (
        <div className="modal-overlay" onClick={() => setSelectedMedia(null)}>
          <div className="modal-content media-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <button className="viewer-close" onClick={() => setSelectedMedia(null)}>
              <X size={24} />
            </button>
            {isImage(selectedMedia) && selectedMedia.attachments?.[0] && (
              <img src={getMediaUrl(selectedMedia.attachments[0])} alt="Full view" />
            )}
            {isVideo(selectedMedia) && selectedMedia.attachments?.[0] && (
              <video controls src={getMediaUrl(selectedMedia.attachments[0])} />
            )}
            <div className="viewer-info">
              <Avatar src={selectedMedia.avatar} fallback={selectedMedia.username} size={32} />
              <div>
                <p className="viewer-title">{selectedMedia.metadata?.title || selectedMedia.content || t('media.untitled', 'Untitled media')}</p>
                <p className="viewer-username">{selectedMedia.username}</p>
                <p className="viewer-date">{formatSafeDate(selectedMedia.createdAt || selectedMedia.timestamp)}</p>
              </div>
              {selectedMedia.userId === user?.id ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={(e) => handleDeleteMedia(selectedMedia, e)}>
                  <Trash2 size={14} />
                  {t('common.delete', 'Delete')}
                </button>
              ) : null}
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

export default MediaChannel
