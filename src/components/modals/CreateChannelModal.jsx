import React, { useState } from 'react'
import { X, Hash, Volume2, Folder } from 'lucide-react'
import { apiService } from '../../services/apiService'
import './Modal.css'

const CreateChannelModal = ({ serverId, categories = [], onClose, onSuccess }) => {
  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState('text')
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!channelName.trim()) {
      setError('Channel name is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createChannel(serverId, {
        name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
        type: channelType,
        categoryId: categoryId || null
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create channel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Channel</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Channel Type</label>
              <div className="channel-type-options">
                <button
                  type="button"
                  className={`channel-type-btn ${channelType === 'text' ? 'active' : ''}`}
                  onClick={() => setChannelType('text')}
                >
                  <Hash size={20} />
                  <div>
                    <div className="type-label">Text</div>
                    <div className="type-description">Send messages, images, and files</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`channel-type-btn ${channelType === 'voice' ? 'active' : ''}`}
                  onClick={() => setChannelType('voice')}
                >
                  <Volume2 size={20} />
                  <div>
                    <div className="type-label">Voice</div>
                    <div className="type-description">Talk with voice and video</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Category</label>
              <select
                className="input"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
              >
                <option value="">No Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Channel Name</label>
              <input
                type="text"
                className="input"
                placeholder={channelType === 'text' ? 'new-channel' : 'Voice Channel'}
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                autoFocus
                maxLength={100}
              />
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !channelName.trim()}>
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateChannelModal
