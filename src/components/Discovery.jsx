import React, { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, CalendarIcon, ShieldCheckIcon, UsersIcon } from '@heroicons/react/24/outline'
import { Beaker, Film, Globe, GraduationCap, Hash, Info, Music, Palette, Plus, Puzzle, Search, Trophy, Users, X, Briefcase } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useNavigate } from 'react-router-dom'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import lazyLoadingService from '../services/lazyLoadingService'
import { normalizeDiscoveryCategories } from '../utils/discoveryCategories'
import Avatar from './Avatar'
import { useResetScrollOnChange } from '../hooks/useResetScrollOnChange'
import '../assets/styles/Discovery.css'

const CATEGORY_ICONS = {
  general: Hash,
  gaming: Puzzle,
  music: Music,
  art: Palette,
  science: Beaker,
  education: GraduationCap,
  entertainment: Film,
  sports: Trophy,
  business: Briefcase,
  community: Users
}

const normalizeCategoryId = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const makeServerProfileFallback = (server) => ({
  ...server,
  id: server?.serverId || server?.id,
  serverId: server?.serverId || server?.id,
  description: server?.description || 'No description available.',
  memberCount: server?.memberCount || 0,
  onlineCount: server?.onlineCount || 0,
  channelCount: server?.channelCount || 0,
  roleCount: server?.roleCount || 0
})

const Discovery = ({ onJoinServer, onSubmitServer }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [servers, setServers] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [userServers, setUserServers] = useState([])
  const [loadingUserServers, setLoadingUserServers] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitCategory, setSubmitCategory] = useState('')
  const [selectedServerProfile, setSelectedServerProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [listError, setListError] = useState('')
  const [categoriesError, setCategoriesError] = useState('')
  const [userServersError, setUserServersError] = useState('')
  const [notice, setNotice] = useState('')
  const serversRequestRef = useRef(0)
  const discoveryContentRef = useResetScrollOnChange([selectedCategory, searchQuery, listError])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [searchInput])

  useEffect(() => {
    loadCategories()
    loadUserServers()
    lazyLoadingService.preloadRouteChunks(['route:chat', 'route:invite'], { idle: true })
  }, [])

  useEffect(() => {
    loadServers()
  }, [selectedCategory, searchQuery])

  const loadCategories = async () => {
    setLoadingCategories(true)
    setCategoriesError('')
    try {
      const response = await apiService.getDiscoveryCategories()
      setCategories(normalizeDiscoveryCategories(response.data))
    } catch (error) {
      console.error('Failed to load categories:', error)
      setCategories(normalizeDiscoveryCategories([]))
      setCategoriesError(t('discovery.categoriesLoadFailed', 'Failed to load categories.'))
    } finally {
      setLoadingCategories(false)
    }
  }

  const loadServers = async () => {
    const requestId = Date.now()
    serversRequestRef.current = requestId
    setLoading(true)
    setListError('')

    try {
      const params = {}
      if (selectedCategory !== 'all') {
        params.category = selectedCategory
      }
      if (searchQuery) {
        params.search = searchQuery
      }

      const response = await apiService.getDiscovery(params)
      if (serversRequestRef.current !== requestId) return

      setServers(Array.isArray(response.data?.servers) ? response.data.servers : [])
    } catch (error) {
      if (serversRequestRef.current !== requestId) return

      console.error('Failed to load discovery servers:', error)
      setServers([])
      setListError(t('discovery.loadFailed', 'Failed to load discovery servers.'))
    } finally {
      if (serversRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  const loadUserServers = async () => {
    setLoadingUserServers(true)
    setUserServersError('')
    try {
      const response = await apiService.getServers()
      setUserServers(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Failed to load user servers:', error)
      setUserServers([])
      setUserServersError(t('discovery.loadUserServersFailed', 'Failed to load your servers.'))
    } finally {
      setLoadingUserServers(false)
    }
  }

  const handleJoinServer = async (server) => {
    try {
      lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: false })
      lazyLoadingService.preloadComponents(['ServerSidebar', 'ChannelSidebar', 'ChatArea'], { idle: false })
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
      setSubmitError(t('discovery.selectServer', 'Please select a server'))
      return
    }

    setSubmitting(true)
    try {
      await apiService.submitToDiscovery(serverId, { description, category })
      const successMessage = t('discovery.submitSuccess', 'Server submitted for review!')
      setSubmitSuccess(successMessage)
      setNotice(successMessage)
      setShowSubmitModal(false)
      setSubmitCategory('')
      onSubmitServer?.(serverId)
      loadUserServers()
    } catch (error) {
      setSubmitError(error.response?.data?.error || t('discovery.submitFailed', 'Failed to submit server'))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredServers = servers.filter((server) => {
    const serverCategory = normalizeCategoryId(server.category)
    if (selectedCategory !== 'all' && serverCategory !== selectedCategory) {
      return false
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return server.name.toLowerCase().includes(query) || server.description?.toLowerCase().includes(query)
    }
    return true
  })

  const categoriesById = categories.reduce((acc, cat) => {
    acc[cat.id] = cat
    return acc
  }, {})

  const handleOpenServerProfile = async (server) => {
    setProfileLoading(true)
    setProfileError('')
    setSelectedServerProfile(makeServerProfileFallback(server))

    try {
      const response = await apiService.getDiscoveryServer(server.serverId)
      setSelectedServerProfile({ ...makeServerProfileFallback(server), ...response.data })
    } catch (error) {
      console.error('Failed to load server profile:', error)
      setProfileError(t('discovery.profileLoadFailed', 'Failed to load server details'))
      setSelectedServerProfile(makeServerProfileFallback(server))
    } finally {
      setProfileLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return t('common.unknown', 'Unknown')
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const clearFilters = () => {
    setSelectedCategory('all')
    setSearchInput('')
    setSearchQuery('')
  }

  const hasActiveFilters = selectedCategory !== 'all' || Boolean(searchQuery)

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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input"
            aria-label={t('discovery.search', 'Search discovery')}
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearFilters}
          >
            {t('common.clear', 'Clear')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setSubmitCategory('')
            setSubmitError('')
            setSubmitSuccess('')
            setShowSubmitModal(true)
          }}
        >
          <Plus size={18} />
          {t('discovery.submitServer')}
        </button>
      </div>

      <div className="discovery-categories">
        <button
          type="button"
          className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
          aria-pressed={selectedCategory === 'all'}
        >
          <Globe size={16} />
          {t('discovery.all', 'All')}
        </button>
        {categories.map((cat) => {
          const IconComponent = CATEGORY_ICONS[cat.id] || Globe
          return (
            <button
              type="button"
              key={cat.id}
              className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
              aria-pressed={selectedCategory === cat.id}
            >
              <IconComponent size={16} />
              {cat.name}
            </button>
          )
        })}
        {loadingCategories && (
          <span className="category-btn" aria-live="polite">{t('common.loading', 'Loading...')}</span>
        )}
      </div>

      <div ref={discoveryContentRef} className="discovery-content">
        {categoriesError && (
          <div className="alert alert-warning" role="status">
            {categoriesError}
          </div>
        )}

        {notice && (
          <div className="alert alert-success" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="discovery-loading" role="status" aria-live="polite">
            <div className="loading-spinner"></div>
            <p>{t('discovery.loadingServers', 'Loading servers...')}</p>
          </div>
        ) : listError ? (
          <div className="discovery-empty">
            <Globe size={48} />
            <h3>{t('common.somethingWentWrong', 'Something went wrong')}</h3>
            <p>{listError}</p>
            <button type="button" className="btn btn-secondary" onClick={loadServers}>
              {t('common.retry', 'Retry')}
            </button>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="discovery-empty">
            <Globe size={48} />
            <h3>{t('discovery.noResults')}</h3>
            <p>
              {hasActiveFilters
                ? t('discovery.tryDifferentFilters', 'Try a different search or category')
                : t('discovery.noServersYet', 'No servers are discoverable right now.')}
            </p>
            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                {t('discovery.clearFilters', 'Clear filters')}
              </button>
            )}
          </div>
        ) : (
          <div className="discovery-grid">
            {filteredServers.map((server) => {
              const serverCategory = normalizeCategoryId(server.category)
              return (
                <div key={server.id || server.serverId} className="discovery-card">
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
                        <UsersIcon size={14} />
                        {server.memberCount || 0} {t('discovery.members', 'members')}
                      </span>
                      {serverCategory && (
                        <span className="discovery-card-category">
                          {categoriesById[serverCategory]?.name || serverCategory}
                        </span>
                      )}
                    </div>
                    <div className="discovery-card-actions">
                      <button
                        type="button"
                        className="btn btn-secondary discovery-card-info"
                        onMouseEnter={() => lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })}
                        onFocus={() => lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })}
                        onClick={() => handleOpenServerProfile(server)}
                        title={t('discovery.viewDetails', 'View Details')}
                      >
                        <Info size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary discovery-card-join"
                        onMouseEnter={() => lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })}
                        onFocus={() => lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })}
                        onClick={() => handleJoinServer(server)}
                      >
                        {t('discovery.joinServer', 'Join Server')}
                        <ArrowRightIcon size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedServerProfile && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedServerProfile(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelectedServerProfile(null) }}
          role="dialog"
          aria-modal="true"
          aria-label={selectedServerProfile.name}
        >
          <div className="modal-content server-profile-modal" onClick={(e) => e.stopPropagation()}>
            {profileLoading ? (
              <div className="server-profile-loading" role="status" aria-live="polite">
                <div className="loading-spinner"></div>
                <p>{t('discovery.loadingServerDetails', 'Loading server details...')}</p>
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
                  <button type="button" className="modal-close" aria-label={t('common.close', 'Close')} onClick={() => setSelectedServerProfile(null)}>
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
                          const categoryId = normalizeCategoryId(selectedServerProfile.category)
                          const IconComponent = CATEGORY_ICONS[categoryId] || Globe
                          return <IconComponent size={14} />
                        })()}
                        {categoriesById[normalizeCategoryId(selectedServerProfile.category)]?.name || normalizeCategoryId(selectedServerProfile.category)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="server-profile-content">
                  {profileError && (
                    <div className="alert alert-warning">{profileError}</div>
                  )}

                  <div className="server-profile-description">
                    <h3>{t('discovery.about', 'About')}</h3>
                    <p>{selectedServerProfile.description || t('discovery.noDescription', 'No description available.')}</p>
                  </div>

                  <div className="server-profile-stats">
                    <div className="server-profile-stat">
                      <UsersIcon size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.memberCount || 0}</span>
                        <span className="stat-label">{t('discovery.members', 'Members')}</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <div className="stat-online-dot"></div>
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.onlineCount || 0}</span>
                        <span className="stat-label">{t('discovery.online', 'Online')}</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <Hash size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.channelCount || 0}</span>
                        <span className="stat-label">{t('discovery.channels', 'Channels')}</span>
                      </div>
                    </div>
                    <div className="server-profile-stat">
                      <ShieldCheckIcon size={20} />
                      <div className="stat-info">
                        <span className="stat-value">{selectedServerProfile.roleCount || 0}</span>
                        <span className="stat-label">{t('discovery.roles', 'Roles')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="server-profile-details">
                    <div className="server-profile-detail">
                      <CalendarIcon size={16} />
                      <span>{t('discovery.createdOn', 'Created {{date}}', { date: formatDate(selectedServerProfile.createdAt) })}</span>
                    </div>
                    {selectedServerProfile.verificationRequired && (
                      <div className="server-profile-detail verification">
                        <ShieldCheckIcon size={16} />
                        <span>{t('discovery.verificationRequired', 'Verification required to join')}</span>
                      </div>
                    )}
                  </div>

                  <div className="server-profile-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        handleJoinServer(selectedServerProfile)
                        setSelectedServerProfile(null)
                      }}
                    >
                      {t('discovery.joinServer', 'Join Server')}
                      <ArrowRightIcon size={16} />
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
              <h2>{t('discovery.submitServer', 'Submit Server to Discovery')}</h2>
              <button type="button" className="modal-close" aria-label={t('common.close', 'Close')} onClick={() => setShowSubmitModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitServer} className="discovery-submit-form">
              {submitSuccess && (
                <div className="alert alert-success" role="status">{submitSuccess}</div>
              )}
              {submitError && (
                <div className="alert alert-error" role="alert">{submitError}</div>
              )}
              {userServersError && (
                <div className="alert alert-warning" role="alert">
                  {userServersError}
                  <button type="button" className="btn btn-secondary" onClick={loadUserServers}>
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              )}

              <div className="form-group">
                <label>{t('discovery.selectServer', 'Select Server')}</label>
                <select name="serverId" className="input" required disabled={loadingUserServers || userServers.length === 0}>
                  <option value="">{loadingUserServers ? t('common.loading', 'Loading...') : t('discovery.chooseServer', 'Choose a server...')}</option>
                  {userServers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{t('discovery.category', 'Category')}</label>
                <select
                  name="category"
                  className="input"
                  required
                  value={submitCategory}
                  onChange={(e) => setSubmitCategory(e.target.value)}
                >
                  <option value="">{t('discovery.selectCategory', 'Select category...')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{t('discovery.descriptionOptional', 'Description (optional)')}</label>
                <textarea
                  name="description"
                  className="input"
                  placeholder={t('discovery.descriptionPlaceholder', 'Tell people what your server is about...')}
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
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || loadingUserServers || userServers.length === 0}
                >
                  {submitting ? t('common.submitting', 'Submitting...') : t('discovery.submitForReview', 'Submit for Review')}
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
