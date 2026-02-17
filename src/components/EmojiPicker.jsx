import React, { useState, useEffect } from 'react'
import { Search, X, Loader } from 'lucide-react'
import '../assets/styles/EmojiPicker.css'

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
  'Gestures': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿', '🦵', '🦶'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['⚡', '🔥', '✨', '🎉', '🎊', '🎁', '🏆', '🥇', '🎯', '🎮', '🎲', '🎸', '🎺', '🎻', '🎹', '🥁', '💻', '📱', '⌨️', '🖥️', '💾', '📷', '📸', '🎬', '📺', '📻', '⏰', '💡', '🔋', '🔌'],
  'Nature': ['🌸', '🌺', '🌻', '🌼', '🌷', '🌹', '🥀', '🌲', '🌳', '🌴', '🌵', '🍀', '☘️', '🍃', '🍂', '🍁', '🌾', '🌱', '🌿', '☀️', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '🌈', '☁️', '❄️', '💧'],
  'Food': ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔', '🍕', '🌮', '🌯', '🍜', '🍝', '🍣', '🍱', '🍩', '🍪', '🎂', '🍰', '🧁', '☕', '🍵', '🍺', '🍷', '🥤']
}

const EmojiPicker = ({ onSelect, onClose, serverEmojis = [], showGifs = true }) => {
  const [activeTab, setActiveTab] = useState(serverEmojis.length > 0 ? 'server' : 'emoji')
  const [searchQuery, setSearchQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('voltchat_recent_emojis')) || []
    } catch {
      return []
    }
  })

  const filteredEmojis = searchQuery
    ? Object.values(EMOJI_CATEGORIES).flat().filter(emoji => emoji.includes(searchQuery))
    : EMOJI_CATEGORIES[activeCategory]

  const searchGifs = async (query) => {
    if (!query.trim()) {
      setGifs([])
      return
    }
    
    setLoading(true)
    try {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=24&media_type=gif`
      )
      const data = await response.json()
      setGifs(data.results || [])
    } catch (err) {
      console.error('GIF search error:', err)
      setGifs([])
    }
    setLoading(false)
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (activeTab === 'gif' && searchQuery) {
        searchGifs(searchQuery)
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, activeTab])

  const handleEmojiSelect = (emoji) => {
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 32)
    setRecentEmojis(updated)
    localStorage.setItem('voltchat_recent_emojis', JSON.stringify(updated))
    onSelect(emoji)
    if (onClose) onClose()
  }

  const handleServerEmojiSelect = (emoji) => {
    onSelect({
      type: 'custom',
      url: emoji.url,
      name: emoji.name
    })
    if (onClose) onClose()
  }

  const handleGifSelect = (gif) => {
    onSelect({
      type: 'gif',
      url: gif.media_formats.gif.url,
      preview: gif.media_formats.tinygif.url
    })
    if (onClose) onClose()
  }

  const hasEmojis = serverEmojis.length > 0

  return (
    <div className="emoji-picker">
      <div className="emoji-picker-header">
        <div className="emoji-tabs">
          <button 
            className={`emoji-tab ${activeTab === 'emoji' ? 'active' : ''}`}
            onClick={() => setActiveTab('emoji')}
          >
            😀
          </button>
          {hasEmojis && (
            <button 
              className={`emoji-tab ${activeTab === 'server' ? 'active' : ''}`}
              onClick={() => setActiveTab('server')}
            >
              🤖
            </button>
          )}
          {showGifs && (
            <button 
              className={`emoji-tab ${activeTab === 'gif' ? 'active' : ''}`}
              onClick={() => setActiveTab('gif')}
            >
              GIF
            </button>
          )}
        </div>
        <div className="emoji-search">
          <Search size={14} />
          <input
            type="text"
            placeholder={activeTab === 'gif' ? 'Search GIFs...' : 'Search emoji...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="emoji-picker-content">
        {activeTab === 'emoji' && (
          <>
            {!searchQuery && recentEmojis.length > 0 && (
              <div className="emoji-section">
                <h4>Recent</h4>
                <div className="emoji-grid">
                  {recentEmojis.map((emoji, i) => (
                    <button key={i} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>
                      {emoji}
                    </button>
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
              {filteredEmojis.map((emoji, i) => (
                <button
                  key={i}
                  className="emoji-btn"
                  onClick={() => handleEmojiSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
              {filteredEmojis.length === 0 && (
                <div className="no-emoji">No emoji found</div>
              )}
            </div>
          </>
        )}

        {activeTab === 'server' && (
          <div className="emoji-section">
            <h4>Server Emojis</h4>
            <div className="emoji-grid server-emojis">
              {serverEmojis.map((emoji, i) => (
                <button 
                  key={i} 
                  className="emoji-btn server-emoji-btn"
                  onClick={() => handleServerEmojiSelect(emoji)}
                  title={emoji.name}
                >
                  <img src={emoji.url} alt={emoji.name} />
                </button>
              ))}
              {serverEmojis.length === 0 && (
                <div className="no-emoji">No server emojis</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'gif' && (
          <div className="gif-grid">
            {loading ? (
              <div className="gif-loading">
                <Loader className="spin" size={24} />
              </div>
            ) : gifs.length > 0 ? (
              gifs.map((gif, i) => (
                <button 
                  key={i} 
                  className="gif-btn"
                  onClick={() => handleGifSelect(gif)}
                >
                  <img src={gif.media_formats.tinygif.url} alt={gif.content_description} />
                </button>
              ))
            ) : searchQuery ? (
              <div className="no-results">No GIFs found</div>
            ) : (
              <div className="gif-placeholder">Search for GIFs</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default EmojiPicker
