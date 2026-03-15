import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  searchGifs, getTrendingGifs, getGifCategories,
  searchStickers, getTrendingStickers, getStickerCategories,
  searchClips, getTrendingClips, getClipCategories,
  searchMemes, getTrendingMemes, getMemeCategories,
  isTrackingEnabled, setTrackingEnabled,
  isAdsEnabled, setAdsEnabled,
  isAnonymousTracking, setAnonymousTracking
} from '../services/klipyService'
import '../assets/styles/KlipyPicker.css'

const CONTENT_TABS = [
  { id: 'gifs', label: 'GIFs', icon: '🎞️', search: searchGifs, trending: getTrendingGifs, categories: getGifCategories },
  { id: 'stickers', label: 'Stickers', icon: '🏷️', search: searchStickers, trending: getTrendingStickers, categories: getStickerCategories },
  { id: 'clips', label: 'Clips', icon: '🎬', search: searchClips, trending: getTrendingClips, categories: getClipCategories },
  { id: 'memes', label: 'Memes', icon: '😂', search: searchMemes, trending: getTrendingMemes, categories: getMemeCategories }
]

const KlipyPicker = ({ onSelect, onClose, initialTab = 'gifs' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [trackingEnabled, setTrackingState] = useState(false)
  const [adsEnabled, setAdsState] = useState(true)
  const [anonymousTracking, setAnonymousTrackingState] = useState(true)
  const [showPrivacySettings, setShowPrivacySettings] = useState(false)
  const searchInputRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const isLoadingRef = useRef(false)

  const currentTab = CONTENT_TABS.find(t => t.id === activeTab) || CONTENT_TABS[0]

  useEffect(() => {
    setTrackingState(isTrackingEnabled())
    setAdsState(isAdsEnabled())
    setAnonymousTrackingState(isAnonymousTracking())
  }, [])

  const loadTrending = useCallback(async (pageNum = 1, append = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    
    if (!append) setLoading(true)
    else setLoadingMore(true)
    
    try {
      const data = await currentTab.trending(pageNum, 24)
      if (pageNum === 1) {
        setItems(data.results || [])
      } else {
        setItems(prev => [...prev, ...(data.results || [])])
      }
      setHasMore(!!data.next)
    } catch (error) {
      console.error(`Error loading ${activeTab} trending:`, error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [activeTab, currentTab])

  const loadSearch = useCallback(async (searchQuery, pageNum = 1, append = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    
    if (!append) setLoading(true)
    else setLoadingMore(true)
    
    try {
      const data = await currentTab.search(searchQuery, pageNum, 24)
      if (pageNum === 1) {
        setItems(data.results || [])
      } else {
        setItems(prev => [...prev, ...(data.results || [])])
      }
      setHasMore(!!data.next)
    } catch (error) {
      console.error(`Error searching ${activeTab}:`, error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [activeTab, currentTab])

  const loadCategories = useCallback(async () => {
    try {
      const data = await currentTab.categories()
      setCategories(data.results || [])
    } catch (error) {
      console.error(`Error loading ${activeTab} categories:`, error)
      setCategories([])
    }
  }, [activeTab, currentTab])

  useEffect(() => {
    setPage(1)
    setQuery('')
    setSelectedCategory(null)
    setItems([])
    setHasMore(true)
    loadCategories()
    loadTrending(1, false)
  }, [activeTab, loadTrending, loadCategories])

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    if (query.trim()) {
      setSelectedCategory(null)
      loadSearch(query, 1, false)
    } else {
      loadTrending(1, false)
    }
  }

  const handleCategoryClick = (category) => {
    setSelectedCategory(category)
    setQuery(category.query)
    setPage(1)
    loadSearch(category.query, 1, false)
  }

  const handleItemClick = async (item) => {
    if (item.type === 'ad') {
      return
    }
    
    let url = item.url || item.preview
    let itemType = item.type || activeTab.slice(0, -1)
    if (itemType === 'gifs') itemType = 'gif'
    if (itemType === 'static-memes') itemType = 'meme'
    if (itemType === 'stickers') itemType = 'sticker'
    if (itemType === 'clips') itemType = 'clip'
    
    onSelect({
      type: itemType,
      url,
      slug: item.slug,
      title: item.title,
      mediaFormats: item.media_formats
    })
  }

  const toggleTracking = () => {
    const newValue = !trackingEnabled
    setTrackingEnabled(newValue)
    setTrackingState(newValue)
  }

  const toggleAds = () => {
    const newValue = !adsEnabled
    setAdsEnabled(newValue)
    setAdsState(newValue)
  }

  const toggleAnonymousTracking = () => {
    const newValue = !anonymousTracking
    setAnonymousTracking(newValue)
    setAnonymousTrackingState(newValue)
  }

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || isLoadingRef.current) return
    
    const nextPage = page + 1
    setPage(nextPage)
    
    if (query.trim()) {
      loadSearch(query, nextPage, true)
    } else {
      loadTrending(nextPage, true)
    }
  }, [page, query, hasMore, loadingMore, loadSearch, loadTrending])

  const handleScroll = (e) => {
    if (scrollTimeoutRef.current) {
      cancelAnimationFrame(scrollTimeoutRef.current)
    }
    
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      const { scrollTop, clientHeight, scrollHeight } = e.target
      
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore()
      }
    })
  }

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current)
      }
    }
  }, [])

  const renderItem = (item) => {
    if (item.type === 'ad') {
      return (
        <div 
          key={item.id || item._adIndex || 'ad'} 
          className="klipy-ad"
        >
          <div 
            className="klipy-ad-content"
            dangerouslySetInnerHTML={{ __html: item.content }}
          />
        </div>
      )
    }
    
    const url = item.url || item.preview
    if (!url) return null

    return (
      <div 
        key={item.id || item.slug} 
        className="klipy-item"
        onClick={() => handleItemClick(item)}
      >
        <img 
          src={url} 
          alt={item.title || 'KLIPY content'} 
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content klipy-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>KLIPY</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="klipy-tabs">
          {CONTENT_TABS.map(tab => (
            <button
              key={tab.id}
              className={`klipy-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <span className="klipy-tab-icon">{tab.icon}</span>
              <span className="klipy-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <form className="klipy-search" onSubmit={handleSearch}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${currentTab.label}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </form>

        {categories.length > 0 && (
          <div className="klipy-categories">
            <button 
              className={`klipy-category ${!selectedCategory ? 'active' : ''}`}
              onClick={() => { setSelectedCategory(null); setQuery(''); setPage(1); loadTrending(1, false); }}
            >
              All
            </button>
            {categories.slice(0, 8).map((cat, idx) => (
              <button
                key={idx}
                className={`klipy-category ${selectedCategory?.category === cat.category ? 'active' : ''}`}
                onClick={() => handleCategoryClick(cat)}
              >
                {cat.category}
              </button>
            ))}
          </div>
        )}

        <div className="klipy-content" ref={scrollContainerRef} onScroll={handleScroll}>
          {loading ? (
            <div className="klipy-loading">
              <div className="klipy-spinner"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="klipy-empty">
              No {currentTab.label} found
            </div>
          ) : (
            <div className="klipy-grid">
              {items.map(renderItem)}
            </div>
          )}
          {!loading && loadingMore && (
            <div className="klipy-loading-more">
              <div className="klipy-spinner"></div>
            </div>
          )}
        </div>

        <div className="klipy-footer">
          <button 
            className="klipy-privacy-toggle"
            onClick={() => setShowPrivacySettings(!showPrivacySettings)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Settings
          </button>
          
          {showPrivacySettings && (
            <div className="klipy-privacy-panel">
              <div className="klipy-privacy-option">
                <div className="klipy-privacy-info">
                  <span className="klipy-privacy-label">Show Ads</span>
                  <span className="klipy-privacy-desc">Support KLIPY content creators</span>
                </div>
                <label className="klipy-toggle">
                  <input 
                    type="checkbox" 
                    checked={adsEnabled}
                    onChange={toggleAds}
                  />
                  <span className="klipy-toggle-slider"></span>
                </label>
              </div>
              
              <div className="klipy-privacy-option">
                <div className="klipy-privacy-info">
                  <span className="klipy-privacy-label">Enable Tracking</span>
                  <span className="klipy-privacy-desc">Personalize content recommendations</span>
                </div>
                <label className="klipy-toggle">
                  <input 
                    type="checkbox" 
                    checked={trackingEnabled}
                    onChange={toggleTracking}
                  />
                  <span className="klipy-toggle-slider"></span>
                </label>
              </div>
              
              {trackingEnabled && (
                <div className="klipy-privacy-option">
                  <div className="klipy-privacy-info">
                    <span className="klipy-privacy-label">Anonymous Tracking</span>
                    <span className="klipy-privacy-desc">Keep your identity private</span>
                  </div>
                  <label className="klipy-toggle">
                    <input 
                      type="checkbox" 
                      checked={anonymousTracking}
                      onChange={toggleAnonymousTracking}
                    />
                    <span className="klipy-toggle-slider"></span>
                  </label>
                </div>
              )}
              
              <p className="klipy-privacy-footer">
                Ads help support Voltage and keep content free. Your privacy is important - tracking can be disabled anytime and by default it is.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default KlipyPicker
