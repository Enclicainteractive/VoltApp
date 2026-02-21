import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader, Heart, Star } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/EmojiPicker.css'

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'
const PAGE_SIZE = 24
const FAV_KEY = 'voltchat_fav_gifs'

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Objects': ['⚡','🔥','✨','🎉','🎊','🎁','🏆','🥇','🎯','🎮','🎲','🎸','🎺','🎻','🎹','🥁','💻','📱','⌨️','🖥️','💾','📷','📸','🎬','📺','📻','⏰','💡','🔋','🔌'],
  'Nature': ['🌸','🌺','🌻','🌼','🌷','🌹','🥀','🌲','🌳','🌴','🌵','🍀','☘️','🍃','🍂','🍁','🌾','🌱','🌿','☀️','🌙','⭐','🌟','✨','⚡','🔥','🌈','☁️','❄️','💧'],
  'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍔','🍕','🌮','🌯','🍜','🍝','🍣','🍱','🍩','🍪','🎂','🍰','🧁','☕','🍵','🍺','🍷','🥤'],
}

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || [] } catch { return [] }
}
function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)) } catch {}
}

const EmojiPicker = ({ onSelect, onClose, serverEmojis = [], showGifs = true }) => {
  const { t } = useTranslation()
  const globalEmojis = useAppStore(state => state.globalEmojis)
  // Combine server emojis with global emojis - server emojis shown first
  const allEmojis = serverEmojis?.length > 0 
    ? [...serverEmojis, ...globalEmojis.filter(g => !serverEmojis.some(s => s.name === g.name))]
    : globalEmojis
    
  const [activeTab, setActiveTab] = useState(allEmojis?.length > 0 ? 'server' : 'emoji')
  const [searchQuery, setSearchQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [gifNext, setGifNext] = useState(null)   // Tenor next pos token
  const [loadingGifs, setLoadingGifs] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const [favGifs, setFavGifs] = useState(loadFavs)
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem('voltchat_recent_emojis')) || [] } catch { return [] }
  })

  const bottomRef = useRef(null)
  const searchRef = useRef(searchQuery)
  searchRef.current = searchQuery

  // ── GIF fetching ──────────────────────────────────────────────────────────
  const fetchGifs = useCallback(async (query, pos = null, append = false) => {
    if (!query.trim()) { setGifs([]); setGifNext(null); return }
    append ? setLoadingMore(true) : setLoadingGifs(true)
    try {
      const url = new URL('https://tenor.googleapis.com/v2/search')
      url.searchParams.set('q', query)
      url.searchParams.set('key', TENOR_API_KEY)
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('media_filter', 'gif,tinygif')
      if (pos) url.searchParams.set('pos', pos)
      const res = await fetch(url.toString())
      const data = await res.json()
      setGifs(prev => append ? [...prev, ...(data.results || [])] : (data.results || []))
      setGifNext(data.next || null)
    } catch (err) {
      console.error('GIF search error:', err)
    }
    append ? setLoadingMore(false) : setLoadingGifs(false)
  }, [])

  // Debounced search
  useEffect(() => {
    if (activeTab !== 'gif') return
    const t = setTimeout(() => { if (searchRef.current) fetchGifs(searchRef.current) }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, activeTab, fetchGifs])

  // Infinite scroll sentinel
  useEffect(() => {
    if (!bottomRef.current || activeTab !== 'gif') return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && gifNext && !loadingMore && searchQuery) {
        fetchGifs(searchQuery, gifNext, true)
      }
    }, { threshold: 0.1 })
    obs.observe(bottomRef.current)
    return () => obs.disconnect()
  }, [gifNext, loadingMore, searchQuery, activeTab, fetchGifs])

  // ── Favourites ─────────────────────────────────────────────────────────────
  const toggleFav = (gif, e) => {
    e.stopPropagation()
    const url = gif.media_formats?.gif?.url || gif.url
    const preview = gif.media_formats?.tinygif?.url || gif.preview
    setFavGifs(prev => {
      const exists = prev.some(f => f.url === url)
      const next = exists ? prev.filter(f => f.url !== url) : [{ url, preview }, ...prev]
      saveFavs(next)
      return next
    })
  }

  const isFav = (gif) => {
    const url = gif.media_formats?.gif?.url || gif.url
    return favGifs.some(f => f.url === url)
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEmojiSelect = (emoji) => {
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 32)
    setRecentEmojis(updated)
    localStorage.setItem('voltchat_recent_emojis', JSON.stringify(updated))
    onSelect(emoji)
    onClose?.()
  }

  const handleServerEmojiSelect = (emoji) => {
    // Pass all emoji data including host, serverId, id for global format
    onSelect({ 
      type: 'custom', 
      url: emoji.url, 
      name: emoji.name,
      host: emoji.host,
      serverId: emoji.serverId,
      id: emoji.id
    })
    onClose?.()
  }

  const handleGifSelect = (gif) => {
    const url = gif.media_formats?.gif?.url || gif.url
    onSelect({ type: 'gif', url })
    onClose?.()
  }

  const handleFavSelect = (fav) => {
    onSelect({ type: 'gif', url: fav.url })
    onClose?.()
  }

  // ── GIF tile with fav button ───────────────────────────────────────────────
  const GifTile = ({ gif, onClick }) => {
    const preview = gif.media_formats?.tinygif?.url || gif.preview
    const faved = isFav(gif)
    return (
      <div className="gif-tile" onClick={onClick}>
        <img src={preview} alt={gif.content_description || 'GIF'} loading="lazy" />
        <button
          className={`gif-fav-btn${faved ? ' active' : ''}`}
          onClick={(e) => toggleFav(gif, e)}
          title={faved ? 'Remove favourite' : 'Add to favourites'}
        >
          <Heart size={12} fill={faved ? 'currentColor' : 'none'} />
        </button>
      </div>
    )
  }

  return (
    <div className="emoji-picker">
      <div className="emoji-picker-header">
        <div className="emoji-tabs">
          <button className={`emoji-tab ${activeTab === 'emoji' ? 'active' : ''}`} onClick={() => setActiveTab('emoji')}>😀</button>
          {allEmojis?.length > 0 && (
            <button className={`emoji-tab ${activeTab === 'server' ? 'active' : ''}`} onClick={() => setActiveTab('server')}>🤖</button>
          )}
          {showGifs && (
            <>
              <button className={`emoji-tab ${activeTab === 'gif' ? 'active' : ''}`} onClick={() => setActiveTab('gif')}>GIF</button>
              <button className={`emoji-tab ${activeTab === 'favgif' ? 'active' : ''}`} onClick={() => setActiveTab('favgif')} title={t('emoji.favouriteGifs', 'Favourite GIFs')}>
                <Heart size={14} fill={activeTab === 'favgif' ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </div>
        <div className="emoji-search">
          <Search size={14} />
          <input
            type="text"
            placeholder={activeTab === 'gif' ? t('emoji.searchGifs', 'Search GIFs…') : activeTab === 'favgif' ? t('emoji.searchFavourites', 'Search favourites…') : t('emoji.searchEmoji', 'Search emoji…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}><X size={12} /></button>
          )}
        </div>
      </div>

      <div className="emoji-picker-content">

        {/* ── Emoji tab ── */}
        {activeTab === 'emoji' && (
          <>
            {!searchQuery && recentEmojis.length > 0 && (
              <div className="emoji-section">
                <h4>{t('emoji.recent', 'Recent')}</h4>
                <div className="emoji-grid">
                  {recentEmojis.map((emoji, i) => (
                    <button key={i} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>{emoji}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="emoji-categories">
              {Object.keys(EMOJI_CATEGORIES).map(category => (
                <button
                  key={category}
                  className={`emoji-category-btn ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => { setActiveCategory(category); setSearchQuery('') }}
                  title={category}
                >
                  {EMOJI_CATEGORIES[category][0]}
                </button>
              ))}
            </div>
            <div className="emoji-grid">
              {(searchQuery
                ? Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(searchQuery))
                : EMOJI_CATEGORIES[activeCategory]
              ).map((emoji, i) => (
                <button key={i} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>{emoji}</button>
              ))}
            </div>
          </>
        )}

        {/* ── Server emoji tab ── */}
        {activeTab === 'server' && (
          <div className="emoji-section">
            <h4>{t('emoji.serverEmojis', 'Server Emojis')}</h4>
            <div className="emoji-grid server-emojis">
              {allEmojis?.map((emoji, i) => (
                <button key={i} className="emoji-btn server-emoji-btn" onClick={() => handleServerEmojiSelect(emoji)} title={emoji.serverName ? `${emoji.name} (${emoji.serverName})` : emoji.name}>
                  <img src={emoji.url} alt={emoji.name} />
                </button>
              ))}
              {(!allEmojis || allEmojis.length === 0) && <div className="no-emoji">{t('emoji.noServerEmojis', 'No server emojis')}</div>}
            </div>
          </div>
        )}

        {/* ── GIF search tab ── */}
        {activeTab === 'gif' && (
          <div className="gif-scroll-area">
            {loadingGifs ? (
              <div className="gif-loading"><Loader className="spin" size={24} /></div>
            ) : gifs.length > 0 ? (
              <>
                <div className="gif-grid">
                  {gifs.map((gif, i) => (
                    <GifTile key={gif.id || i} gif={gif} onClick={() => handleGifSelect(gif)} />
                  ))}
                </div>
                {/* Infinite scroll sentinel */}
                <div ref={bottomRef} style={{ height: 1 }} />
                {loadingMore && <div className="gif-loading-more"><Loader className="spin" size={18} /></div>}
                {!gifNext && gifs.length > 0 && (
                  <div className="gif-end">{t('emoji.noMoreResults', 'No more results')}</div>
                )}
              </>
            ) : searchQuery ? (
              <div className="gif-placeholder">{t('emoji.noGifsFound', 'No GIFs found for "{{query}}"', { query: searchQuery })}</div>
            ) : (
              <div className="gif-placeholder">{t('emoji.searchForGifs', 'Search for GIFs…')}</div>
            )}
          </div>
        )}

        {/* ── Favourite GIFs tab ── */}
        {activeTab === 'favgif' && (
          <div className="gif-scroll-area">
            {favGifs.length === 0 ? (
              <div className="gif-placeholder">
                <Heart size={24} style={{ opacity: 0.4 }} />
                <span>No favourites yet.<br/>Click ♥ on any GIF to save it.</span>
              </div>
            ) : (
              <div className="gif-grid">
                {favGifs
                  .filter(f => !searchQuery || f.url.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((fav, i) => (
                    <div key={i} className="gif-tile" onClick={() => handleFavSelect(fav)}>
                      <img src={fav.preview || fav.url} alt="Favourite GIF" loading="lazy" />
                      <button
                        className="gif-fav-btn active"
                        onClick={(e) => { e.stopPropagation(); toggleFav(fav, e) }}
                        title="Remove favourite"
                      >
                        <Heart size={12} fill="currentColor" />
                      </button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default EmojiPicker
