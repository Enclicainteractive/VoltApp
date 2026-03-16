import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function ScreenSharePicker({ isOpen, onClose, onSelect }) {
  const { t } = useTranslation()
  const [sources, setSources] = useState([])
  const [selectedSource, setSelectedSource] = useState(null)
  const [selectedType, setSelectedType] = useState('all')
  const [includeAudio, setIncludeAudio] = useState(true)
  const [loading, setLoading] = useState(true)
  const [useNativePicker, setUseNativePicker] = useState(false)
  const [platform, setPlatform] = useState('linux')
  const [sessionType, setSessionType] = useState('unknown')
  const [error, setError] = useState(null)
  const [appName, setAppName] = useState('')

  useEffect(() => {
    if (isOpen) {
      const plat = window.electron?.platform || 'linux'
      const wayland = window.electron?.isWayland
      const x11 = window.electron?.isX11
      
      setPlatform(plat)
      setSessionType(wayland ? 'wayland' : x11 ? 'x11' : 'unknown')
      setError(null)
      
      // Get app name to filter out from sources
      window.electron?.getAppName?.().then(info => {
        if (info?.name) {
          setAppName(info.name.toLowerCase())
        }
      }).catch(() => {})
      
      // Always try Electron's getSources first - works on X11 and sometimes Wayland with PipeWire
      if (window.electron?.getSources) {
        setLoading(true)
        window.electron.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 320, height: 180 }
        }).then(sourceList => {
          if (sourceList && sourceList.length > 0) {
            // Filter out the current app to prevent loopback
            const filteredSources = sourceList.filter(source => {
              const sourceName = source.name.toLowerCase()
              // Filter out VoltChat/EIVoltChat itself
              if (sourceName.includes('volt') || sourceName.includes('eivolt')) {
                return false
              }
              return true
            })
            setSources(filteredSources)
            const screen = filteredSources.find(s => s.source === 'screen')
            if (screen) {
              setSelectedSource(screen)
            } else if (filteredSources.length > 0) {
              setSelectedSource(filteredSources[0])
            }
            setUseNativePicker(false)
          } else {
            // No sources - try native picker
            console.log('[ScreenShare] No sources from Electron, using native')
            setSources([])
            setUseNativePicker(true)
          }
          setLoading(false)
        }).catch(err => {
          console.error('[ScreenShare] getSources error:', err)
          setSources([])
          setUseNativePicker(true)
          setLoading(false)
        })
      } else {
        setUseNativePicker(true)
        setLoading(false)
      }
    }
  }, [isOpen])

  const handleNativeShare = () => {
    navigator.mediaDevices.getDisplayMedia({ 
      audio: includeAudio,
      video: true
    }).then(stream => {
      console.log('[ScreenShare] got stream')
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      
      onSelect({
        sourceId: videoTrack?.label || 'native',
        sourceType: selectedType,
        includeAudio: !!audioTrack,
        isNative: true,
        stream
      })
      onClose()
    }).catch(err => {
      console.log('[ScreenShare] error:', err.name, err.message)
      if (err.name === 'NotAllowedError') {
        onClose()
      } else if (err.name === 'NotSupportedError') {
        setError('Screen capture not supported. On Wayland, try running with X11 or using native PipeWire.')
      } else {
        setError(err.message || 'Failed to share screen')
      }
    })
  }

  const handleElectronShare = () => {
    if (!selectedSource) return
    
    onSelect({
      sourceId: selectedSource.id,
      sourceType: selectedSource.source,
      includeAudio
    })
    onClose()
  }

  if (!isOpen) return null

  const filteredSources = selectedType === 'all' 
    ? sources 
    : sources.filter(s => s.source === selectedType)

  const isLinux = platform === 'linux'
  const isWayland = sessionType === 'wayland'
  const isX11 = sessionType === 'x11'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="screen-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="screen-picker-header">
          <h2>{t('voice.selectScreen', 'Share Your Screen')}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div className="screen-picker-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="screen-picker-loading">
            <div className="spinner" />
            <p>{t('voice.loadingSources', 'Loading available sources...')}</p>
          </div>
        ) : useNativePicker ? (
          <div className="screen-picker-native">
            <div className="native-picker-info">
              <p>
                {isWayland 
                  ? 'Select what you want to share using the system picker'
                  : isX11 
                    ? 'Using X11 screen sharing'
                    : 'Using system screen picker'
                }
              </p>
              
              <div className="screen-type-selector">
                <label>
                  <input
                    type="radio"
                    name="screenType"
                    value="all"
                    checked={selectedType === 'all'}
                    onChange={() => setSelectedType('all')}
                  />
                  <span>Everything</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="screenType"
                    value="screen"
                    checked={selectedType === 'screen'}
                    onChange={() => setSelectedType('screen')}
                  />
                  <span>Entire Screen</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="screenType"
                    value="window"
                    checked={selectedType === 'window'}
                    onChange={() => setSelectedType('window')}
                  />
                  <span>App Window</span>
                </label>
              </div>
              
              <label className="screen-picker-audio-toggle">
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={e => setIncludeAudio(e.target.checked)}
                />
                <span>{t('voice.includeSystemAudio', 'Include system audio')}</span>
              </label>
            </div>
            
            <button className="btn-primary share-btn" onClick={handleNativeShare}>
              {t('voice.chooseToShare', 'Choose What to Share')}
            </button>
          </div>
        ) : (
          <>
            <div className="screen-picker-type-tabs">
              <button 
                className={selectedType === 'all' ? 'active' : ''}
                onClick={() => setSelectedType('all')}
              >
                All
              </button>
              <button 
                className={selectedType === 'screen' ? 'active' : ''}
                onClick={() => setSelectedType('screen')}
              >
                Screens
              </button>
              <button 
                className={selectedType === 'window' ? 'active' : ''}
                onClick={() => setSelectedType('window')}
              >
                Windows
              </button>
            </div>

            {filteredSources.length > 0 ? (
              <div className="screen-picker-grid">
                {filteredSources.map(source => (
                  <div
                    key={source.id}
                    className={`screen-picker-item ${selectedSource?.id === source.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSource(source)}
                  >
                    <img src={source.thumbnail} alt={source.name} />
                    <div className="screen-picker-item-name">{source.name}</div>
                    <div className="screen-picker-item-type">{source.source}</div>
                    {selectedSource?.id === source.id && <div className="screen-picker-check">✓</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="screen-picker-empty">
                <p>No sources available</p>
                <button 
                  className="btn-secondary" 
                  onClick={() => setUseNativePicker(true)}
                >
                  Use System Picker
                </button>
              </div>
            )}

            <div className="screen-picker-footer">
              <label className="screen-picker-audio-toggle">
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={e => setIncludeAudio(e.target.checked)}
                />
                <span>Include system audio</span>
              </label>
              <div className="screen-picker-actions">
                <button className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn-primary share-btn"
                  onClick={handleElectronShare}
                  disabled={!selectedSource}
                >
                  Share
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ScreenSharePicker
