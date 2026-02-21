import React, { useState, useEffect } from 'react'
import { Search, Plus, Globe, Users, ArrowRight, Filter, Star, X, Hash, Gamepad2, Music, Palette, FlaskConical, GraduationCap, Film, Trophy, Briefcase, Calendar, Shield, Info, ChevronRight } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useNavigate } from 'react-router-dom'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import '../assets/styles/Discovery.css'

const CATEGORY_ICONS = {
  'general': Hash,
  'gaming': Gamepad2,
  'music': Music,
  'art': Palette,
  'science': FlaskConical,
  'education': GraduationCap,
  'entertainment': Film,
  'sports': Trophy,
  'business': Briefcase,
  'community': Users
}

const Discovery = ({ onJoinServer, onSubmitServer }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [servers, setServers] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [userServers, setUserServers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitCategory, setSubmitCategory] = useState('')
  const [selectedServerProfile, setSelectedServerProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    loadUserServers()
  }, [])

  useEffect(() => {
    loadServers()
  }, [selectedCategory, searchQuery])

  const loadCategories = async () => {
    try {
      const response = await apiService.getDiscoveryCategories()
      setCategories(response.data)
    } catch (error) {
      console.error('Failed to load categories:', error)
    }
  }

  const loadServers = async () => {
    setLoading(true)
    try {
      const params = {}
      if (selectedCategory !== 'all') {
        params.category = selectedCategory
      }
      if (searchQuery) {
        params.search = searchQuery
      }
      const response = await apiService.getDiscovery(params)
      setServers(response.data.servers || [])
    } catch (error) {
      console.error('Failed to load discovery servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUserServers = async () => {
    try {
      const response = await apiService.getServers()
      setUserServers(response.data || [])
    } catch (error) {
      console.error('Failed to load user servers:', error)
    }
  }

  const handleJoinServer = async (server) => {
    try {
      await apiService.joinServerById(server.serverId)
      soundService.serverJoined()
      onJoinServer?.(server.serverId)
      navigate(`/chat/${server.serverId}`)
    } catch (error) {
      if (error.response?.data?.error === 'Already a member') {
        navigate(`/chat/${server.serverId}`)
      } else {
        console.error('Failed to join server:', error)
      }
    }
  }

  const handleSubmitServer = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess('')
    
    const formData = new FormData(e.target)
    const serverId = formData.get('serverId')
    const description = formData.get('description')
    const category = formData.get('category')

    if (!serverId) {
      setSubmitError('Please select a server')
      return
    }

    setSubmitting(true)
    try {
      await apiService.submitToDiscovery(serverId, { description, category })
      setSubmitSuccess('Server submitted for review!')
      setShowSubmitModal(false)
      loadUserServers()
    } catch (error) {
      setSubmitError(error.response?.data?.error || 'Failed to submit server')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredServers = servers.filter(server => {
    if (selectedCategory !== 'all' && server.category !== selectedCategory) {
      return false
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return server.name.toLowerCase().includes(query) || 
             server.description?.toLowerCase().includes(query)
    }
    return true
  })

  const handleOpenServerProfile = async (server) => {
    setProfileLoading(true)
    setProfileError('')
    setSelectedServerProfile(null)
    
    try {
      const response = await apiService.getDiscoveryServer(server.serverId)
      setSelectedServerProfile(response.data)
    } catch (error) {
      console.error('Failed to load server profile:', error)
      setProfileError('Failed to load server details')
      // Show basic info from the card as fallback
      setSelectedServerProfile({
        ...server,
        id: server.serverId,
        description: server.description || 'No description available.',
        memberCount: server.memberCount || 0,
        onlineCount: 0,
        channelCount: 0,
        roleCount: 0
      })
    } finally {
      setProfileLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="discovery-page">
      <div className="discovery-header">
        <div className="discovery-title">
          <Globe size={28} />
          <h1>{t('discovery.title')}</h1>
        </div>
        <p>{t('discovery.description')}</p>
      </div>

      <div className="discovery-controls">
        <div className="discovery-search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder={t('discovery.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
          />
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => { setSubmitCategory(''); setShowSubmitModal(true) }}
        >
          <Plus size={18} />
          {t('discovery.submitServer')}
        </button>
      </div>

      <div className="discovery-categories">
        <button
          className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          <Globe size={16} />
          All
        </button>
        {categories.map(cat => {
          const IconComponent = CATEGORY_ICONS[cat.id] || Globe
          return (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            <IconComponent size={16} />
            {cat.name}
          </button>
        )})}
      </div>

      <div className="discovery-content">
        {loading ? (
          <div className="discovery-loading">
            <div className="loading-spinner"></div>
            <p>Loading servers...</p>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="discovery-empty">
            <Globe size={48} />
            <h3>{t('discovery.noResults')}</h3>
            <p>Try a different search or category</p>
          </div>
        ) : (
          <div className="discovery-grid">
            {filteredServers.map(server => (
              <div key={server.id} className="discovery-card">
                <div className="discovery-card-banner">
                  {server.bannerUrl ? (
                    <img src={server.bannerUrl} alt="" />
                  ) : (
                    <div className="discovery-card-banner-placeholder"></div>
                  )}
                </div>
                <div className="discovery-card-content">
                  <div className="discovery-card-icon">
                    <Avatar src={server.icon} fallback={server.name} size={48} />
                  </div>
                  <h3 className="discovery-card-name">{server.name}</h3>
                  {server.description && (
                    <p className="discovery-card-description">{server.description}</p>
                  )}
                  <div className="discovery-card-meta">
                    <span className="discovery-card-members">
                      <Users size={14} />
                      {server.memberCount || 0} members
                    </span>
                    {server.category && (
                      <span className="discovery-card-category">
                        {categories.find(c => c.id === server.category)?.icon} {categories.find(c => c.id === server.category)?.name}
                      </span>
                    )}
                  </div>
                  <div className="discovery-card-actions">
                    <button 
                      className="btn btn-secondary discovery-card-info"
                      onClick={() => handleOpenServerProfile(server)}
                      title="View Details"
                    >
                      <Info size={16} />
                    </button>
                    <button 
                      className="btn btn-primary discovery-card-join"
                      onClick={() => handleJoinServer(server)}
                    >
                      Join Server
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Server Profile Modal */}
      {selectedServerProfile && (
        <div className="modal-overlay" onClick={() => setSelectedServerProfile(null)}>
          <div className="modal-content server-profile-modal" onClick={(e) => e.stopPropagation()}>
            {profileLoading ? (
              <div className="server-profile-loading">
                <div className="loading-spinner"></div>
                <p>Loading server details...</p>
              </div>
            ) : (
              <>
                <div className="server-profile-banner">
                  {selectedServerProfile.bannerUrl ? (
                    <img src={selectedServerProfile.bannerUrl} alt="" />
                  ) : (
                    <div className="server-profile-banner-placeholder" style={{ 
                      background: selectedServerProfile.themeColor 
                        ? `linear-gradient(135deg, ${selectedServerProfile.themeColor}, ${selectedServerProfile.themeColor}88)`
                        : 'var(--volt-bg-tertiary)'
                    }}></div>
                  )}
                  <button className="modal-close" onClick={() => setSelectedServerProfile(null)}>
                    <X size={20} />
                  </button>
                </div>
                
                <div className="server-profile-header">
                  <div className="server-profile-icon">
                    <Avatar 
                      src={selectedServerProfile.icon} 
                      fallback={selectedServerProfile.name} 
                      size={80} 
                    />
                  </div>
                  <div className="server-profile-title">
                    <h2>{selectedServerProfile.name}</h2>
                    {selectedServerProfile.category && (
                      <span className="server-profile-category">
                        {(() => {
                          const IconComponent = CATEGORY_ICONS[selectedServerProfile.category] || Globe
                          return <IconComponent size={14} />
                        })()}
                        {categories.find(c => c.id === selectedServerProfile.category)?.name || selectedServerProfile.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="server-profile-content">
                  {profileError && (
                    <div className="alert alert-warning">{profileError}</div>
                  )}
                  
                  <div className="server-profile-description">
                    <h3>About</h3>
                    <p>{selectedServerProfile.description || 'No description available.'}</p>
                  </div>

                  <div className="server-profile-stats">
                    <div className="server-profile-stat">
                      <Users size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.memberCount || 0}</span>
                        <span className="stat-label">Members</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <div className="stat-online-dot"></div>
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.onlineCount || 0}</span>
                        <span className="stat-label">Online</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <Hash size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.channelCount || 0}</span>
                        <span className="stat-label">Channels</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <Shield size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.roleCount || 0}</span>
                        <span className="stat-label">Roles</span>
                      </div>
                    </div>
                  </div>

                  <div className="server-profile-details">
                    <div className="server-profile-detail">
                      <Calendar size={16} />
                      <span>Created {formatDate(selectedServerProfile.createdAt)}</span>
                    </div>
                    {selectedServerProfile.verificationRequired && (
                      <div className="server-profile-detail verification">
                        <Shield size={16} />
                        <span>Verification required to join</span>
                      </div>
                    )}
                  </div>

                  <div className="server-profile-actions">
                    <button 
                      className="btn btn-primary"
                      onClick={() => {
                        handleJoinServer(selectedServerProfile)
                        setSelectedServerProfile(null)
                      }}
                    >
                      Join Server
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal-content discovery-submit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Submit Server to Discovery</h2>
              <button className="modal-close" onClick={() => setShowSubmitModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitServer} className="discovery-submit-form">
              {submitSuccess && (
                <div className="alert alert-success">{submitSuccess}</div>
              )}
              {submitError && (
                <div className="alert alert-error">{submitError}</div>
              )}
              
              <div className="form-group">
                <label>Select Server</label>
                <select name="serverId" className="input" required>
                  <option value="">Choose a server...</option>
                  {userServers.map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Category</label>
                <select 
                  name="category" 
                  className="input" 
                  required 
                  value={submitCategory}
                  onChange={(e) => setSubmitCategory(e.target.value)}
                >
                  <option value="">Select category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea 
                  name="description" 
                  className="input"
                  placeholder="Tell people what your server is about..."
                  rows={4}
                  maxLength={500}
                />
              </div>
              
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowSubmitModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Discovery
