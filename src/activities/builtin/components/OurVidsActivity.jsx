import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import YouTube from 'react-youtube'
import { PlayIcon, PauseIcon, ForwardIcon, TrashIcon, PlusIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, QueueListIcon, XMarkIcon, ArrowPathIcon, SpeakerWaveIcon, SpeakerXMarkIcon, BackwardIcon, PhotoIcon, XCircleIcon } from '@heroicons/react/24/outline'

const SYNC_SUPPRESS_MS = 900
const SEEK_DELTA_THRESHOLD = 1.25

const parseYouTubeUrl = (url) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id && id.length === 11 ? id : null
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v')
        return id && id.length === 11 ? id : null
      }
      const segments = parsed.pathname.split('/').filter(Boolean)
      const embedIndex = ['embed', 'v', 'shorts'].includes(segments[0]) ? 1 : -1
      if (embedIndex > 0) {
        const id = segments[embedIndex]
        return id && id.length === 11 ? id : null
      }
    }
  } catch {
    return null
  }
  return null
}

const isVideoFile = (url) => {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.toLowerCase()
    return ['.mp4', '.webm', '.ogg', '.mov', '.m4v'].some((ext) => path.endsWith(ext))
  } catch {
    return false
  }
}
const getVideoType = (url) => parseYouTubeUrl(url) ? 'youtube' : isVideoFile(url) ? 'file' : null
const generateId = () => `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const getPlayableMediaUrl = (url) => {
  if (!url) return ''

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const parsed = new URL(url, baseOrigin)
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return parsed.toString()
    }

    return `/api/media/proxy?url=${encodeURIComponent(parsed.toString())}`
  } catch {
    return url
  }
}

const OurVidsActivity = ({ sdk, session, currentUser }) => {
  const playerRef = useRef(null)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const hideControlsTimeoutRef = useRef(null)
  const lastActionRef = useRef(0)
  const suppressEventsUntilRef = useRef(0)
  const syncRequestedSessionRef = useRef(null)
  const pendingSyncRef = useRef(null)
  const lastObservedTimeRef = useRef(0)

  const [urlInput, setUrlInput] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [showQueue, setShowQueue] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const [serverState, setServerState] = useState({ queue: [], currentVideo: null, hostUserId: null })
  const [localState, setLocalState] = useState({ position: 0, duration: 0, playing: false })
  const [seekValue, setSeekValue] = useState(0)
  const [isDraggingSeek, setIsDraggingSeek] = useState(false)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('ourvids_volume')
    return saved ? Number(saved) : 1
  })
  const [isMuted, setIsMuted] = useState(false)

  const hostUserId = serverState.hostUserId || session?.hostId || session?.ownerId || session?.createdBy || null
  const isHost = hostUserId === currentUser?.id

  const persistServerState = useCallback((nextState) => {
    if (!sdk) return
    sdk.updateState({
      ourvids: {
        queue: nextState.queue || [],
        currentVideo: nextState.currentVideo || null,
        hostUserId: nextState.hostUserId || null
      }
    }, { serverRelay: true })
  }, [sdk])

  const isSuppressed = useCallback(() => Date.now() < suppressEventsUntilRef.current, [])
  const suppressSync = useCallback((ms = SYNC_SUPPRESS_MS) => {
    suppressEventsUntilRef.current = Date.now() + ms
  }, [])

  const clearHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }, [])

  const scheduleControlsHide = useCallback((delay = 3000) => {
    clearHideControlsTimeout()
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, delay)
  }, [clearHideControlsTimeout])

  const revealControls = useCallback((delay = 3000) => {
    setShowControls(true)
    if (localState.playing) {
      scheduleControlsHide(delay)
    } else {
      clearHideControlsTimeout()
    }
  }, [localState.playing, scheduleControlsHide, clearHideControlsTimeout])

  const getPlaybackSnapshot = useCallback(() => {
    if (serverState.currentVideo?.type === 'youtube' && playerRef.current) {
      const position = Number(playerRef.current.getCurrentTime?.() || 0)
      const duration = Number(playerRef.current.getDuration?.() || 0)
      const playing = playerRef.current.getPlayerState?.() === 1
      return { position, duration, playing }
    }

    if (serverState.currentVideo?.type === 'file' && videoRef.current) {
      return {
        position: Number(videoRef.current.currentTime || 0),
        duration: Number(videoRef.current.duration || 0),
        playing: !videoRef.current.paused
      }
    }

    return {
      position: Number(localState.position || 0),
      duration: Number(localState.duration || 0),
      playing: !!localState.playing
    }
  }, [serverState.currentVideo?.type, localState.position, localState.duration, localState.playing])

  const emitHostEvent = useCallback((eventType, payload = {}) => {
    if (!isHost || isSuppressed()) return
    sdk.emitEvent(eventType, { ...payload, actorId: currentUser?.id || null }, { serverRelay: true })
  }, [isHost, isSuppressed, sdk, currentUser?.id])

  const applyPlaybackFromPayload = useCallback((payload = {}, { applyPlayState = false } = {}) => {
    const targetPosition = Number(payload.position)
    const hasPosition = Number.isFinite(targetPosition)
    const shouldPlay = payload.playing === true
    const shouldPause = payload.playing === false

    if (hasPosition) {
      setLocalState(prev => ({ ...prev, position: targetPosition }))
      setSeekValue(targetPosition)
      lastObservedTimeRef.current = targetPosition
      if (playerRef.current?.seekTo) playerRef.current.seekTo(targetPosition, true)
      if (videoRef.current) videoRef.current.currentTime = targetPosition
    }

    if (applyPlayState) {
      if (shouldPlay) {
        setLocalState(prev => ({ ...prev, playing: true }))
        playerRef.current?.playVideo?.()
        videoRef.current?.play?.().catch(() => {})
      } else if (shouldPause) {
        setLocalState(prev => ({ ...prev, playing: false }))
        playerRef.current?.pauseVideo?.()
        videoRef.current?.pause?.()
      }
    }
  }, [])

  const emitHostSeek = useCallback((position) => {
    if (!isHost || isSuppressed()) return
    const safePos = Number(position)
    if (!Number.isFinite(safePos)) return
    emitHostEvent('ourvids:seek', { position: safePos })
  }, [emitHostEvent, isHost, isSuppressed])

  const syncAll = useCallback(() => {
    if (!isHost) return
    const snapshot = getPlaybackSnapshot()
    suppressSync()
    setLocalState(prev => ({ ...prev, ...snapshot }))
    setSeekValue(snapshot.position)
    emitHostEvent('ourvids:seek', { position: snapshot.position })
    emitHostEvent(snapshot.playing ? 'ourvids:play' : 'ourvids:pause', {})
  }, [isHost, getPlaybackSnapshot, emitHostEvent, suppressSync])

  // Subscribe to server state
  useEffect(() => {
    if (!sdk) return
    const offState = sdk.subscribeServerState((state) => {
      if (!state?.ourvids) return
      const { queue, currentVideo, hostUserId: sharedHostUserId } = state.ourvids
      setServerState(prev => {
        const newVideo = currentVideo !== undefined ? currentVideo : prev.currentVideo
        if (newVideo?.id !== prev.currentVideo?.id) {
          setIsLoading(true)
          setErrorMessage(null)
          setLocalState({ position: 0, duration: 0, playing: false })
          setSeekValue(0)
          lastObservedTimeRef.current = 0
        }
        return {
          queue: queue || prev.queue,
          currentVideo: newVideo,
          hostUserId: sharedHostUserId || prev.hostUserId || null
        }
      })
    })
    return () => offState?.()
  }, [sdk])

  // Session-scoped one-time sync request for non-host joiners
  useEffect(() => {
    const sessionId = session?.id || null
    if (!sessionId) return
    if (syncRequestedSessionRef.current !== sessionId) {
      syncRequestedSessionRef.current = null
    }
    if (!sdk || !currentUser?.id || isHost || syncRequestedSessionRef.current === sessionId) return
    sdk.emitEvent('ourvids:sync-request', { userId: currentUser.id, sessionId }, { serverRelay: true })
    syncRequestedSessionRef.current = sessionId
  }, [sdk, currentUser?.id, isHost, session?.id])

  // Listen to activity events
  useEffect(() => {
    if (!sdk) return
    const offEvent = sdk.on('event', (evt) => {
      const { eventType, payload = {} } = evt || {}

      switch (eventType) {
        case 'ourvids:queue_update': {
          setServerState(prev => JSON.stringify(prev.queue) === JSON.stringify(payload.queue)
            ? prev
            : {
              ...prev,
              queue: payload.queue || prev.queue,
              hostUserId: payload.hostUserId || prev.hostUserId || null
            }
          )
          break
        }

        case 'ourvids:current_video': {
          suppressSync()
          setIsLoading(true)
          setErrorMessage(null)
          setServerState(prev => ({
            ...prev,
            currentVideo: payload.video || null,
            hostUserId: payload.hostUserId || prev.hostUserId || null
          }))
          setLocalState({ position: 0, duration: 0, playing: false })
          setSeekValue(0)
          lastObservedTimeRef.current = 0
          break
        }

        case 'ourvids:seek': {
          suppressSync(1200)
          applyPlaybackFromPayload(payload, { applyPlayState: false })
          break
        }

        case 'ourvids:play': {
          suppressSync(900)
          setLocalState(prev => ({ ...prev, playing: true }))
          playerRef.current?.playVideo?.()
          videoRef.current?.play?.().catch(() => {})
          break
        }

        case 'ourvids:pause': {
          suppressSync(900)
          setLocalState(prev => ({ ...prev, playing: false }))
          playerRef.current?.pauseVideo?.()
          videoRef.current?.pause?.()
          break
        }

        case 'ourvids:next': {
          suppressSync(1200)
          const next = payload.video || null
          if (next) {
            setServerState(prev => ({ ...prev, currentVideo: next }))
            setLocalState({ position: 0, duration: 0, playing: true })
            setSeekValue(0)
            lastObservedTimeRef.current = 0
          }
          break
        }

        case 'ourvids:sync-request': {
          if (!isHost || !payload.userId || payload.userId === currentUser?.id) break
          const snapshot = getPlaybackSnapshot()
          sdk.emitEvent('ourvids:sync-response', {
            targetUserId: payload.userId,
            currentVideo: serverState.currentVideo,
            queue: serverState.queue,
            position: snapshot.position,
            duration: snapshot.duration,
            playing: snapshot.playing,
            hostId: currentUser?.id,
            hostUserId: hostUserId
          }, { serverRelay: true })
          break
        }

        case 'ourvids:sync-response': {
          if (!payload.targetUserId || payload.targetUserId !== currentUser?.id) break
          suppressSync(1500)

          if (payload.currentVideo !== undefined || payload.queue !== undefined) {
            setServerState(prev => ({
              queue: payload.queue || prev.queue,
              currentVideo: payload.currentVideo !== undefined ? payload.currentVideo : prev.currentVideo,
              hostUserId: payload.hostUserId || payload.hostId || prev.hostUserId || null
            }))
          }

          const nextLocal = {
            position: Number(payload.position || 0),
            duration: Number(payload.duration || 0),
            playing: !!payload.playing
          }
          setLocalState(prev => ({ ...prev, ...nextLocal }))
          setSeekValue(nextLocal.position)

          pendingSyncRef.current = { ...payload }
          applyPlaybackFromPayload(payload, { applyPlayState: true })
          break
        }

        default:
          break
      }
    })

    return () => offEvent?.()
  }, [sdk, isHost, currentUser?.id, serverState.currentVideo, serverState.queue, getPlaybackSnapshot, applyPlaybackFromPayload, suppressSync, hostUserId])

  const flushPendingSync = useCallback(() => {
    if (!pendingSyncRef.current) return
    const pending = pendingSyncRef.current
    pendingSyncRef.current = null
    applyPlaybackFromPayload(pending, { applyPlayState: true })
  }, [applyPlaybackFromPayload])

  const handleYouTubeReady = useCallback((event) => {
    playerRef.current = event.target
    const duration = Number(event.target.getDuration?.() || 0)
    if (duration > 0) {
      setLocalState(prev => ({ ...prev, duration }))
    }
    setIsLoading(false)
    setErrorMessage(null)

    if (localState.position > 0) event.target.seekTo(localState.position, true)
    if (localState.playing) event.target.playVideo()
    if (event.target.setVolume && volume != null) {
      event.target.setVolume(volume * 100)
    }
    flushPendingSync()
  }, [localState.position, localState.playing, volume, flushPendingSync])

  const handleYouTubeError = useCallback(() => {
    setIsLoading(false)
    setErrorMessage('Failed to load video. Please try another URL.')
  }, [])

  const handleVideoError = useCallback(() => {
    setIsLoading(false)
    setErrorMessage('Failed to load video file. Please check the URL.')
  }, [])

  const handleYouTubeStateChange = useCallback((event) => {
    if (!playerRef.current) return

    const playerState = event.data
    if (playerState === -1) return

    const player = playerRef.current
    const duration = Number(player.getDuration?.() || 0)
    const currentTime = Number(player.getCurrentTime?.() || 0)
    const playing = playerState === 1

    if (duration > 0 && !isDraggingSeek) {
      setLocalState(prev => ({ ...prev, position: currentTime, duration, playing }))
      setSeekValue(currentTime)
      lastObservedTimeRef.current = currentTime
    }

    if (!isHost || isSuppressed()) return

    if (playerState === 1) {
      emitHostEvent('ourvids:play', {})
      return
    }

    if (playerState === 2) {
      emitHostEvent('ourvids:pause', {})
      return
    }

    if (playerState === 3) {
      emitHostSeek(currentTime)
    }
  }, [isDraggingSeek, isHost, isSuppressed, emitHostEvent, emitHostSeek])

  const handleYouTubeEnd = useCallback(() => {
    if (!isHost) return
    // Always try to skip to next video in queue if available
    const next = serverState.queue[0]
    if (!next) return

    const nextState = { ...serverState, currentVideo: next, queue: serverState.queue.slice(1) }
    setServerState(nextState)
    setLocalState({ position: 0, duration: 0, playing: true })
    setSeekValue(0)
    lastObservedTimeRef.current = 0
    persistServerState(nextState)
    emitHostEvent('ourvids:next', { video: next, hostUserId })
  }, [isHost, serverState, emitHostEvent, persistServerState, hostUserId])

  const handleVideoLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return
    const duration = Number(videoRef.current.duration || 0)
    setLocalState(prev => ({ ...prev, duration }))
    if (volume != null) {
      videoRef.current.volume = volume
    }
    flushPendingSync()
  }, [flushPendingSync, volume])

  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current || isDraggingSeek) return

    const currentTime = Number(videoRef.current.currentTime || 0)
    const duration = Number(videoRef.current.duration || 0)
    const playing = !videoRef.current.paused

    setLocalState(prev => ({ ...prev, position: currentTime, duration, playing }))
    setSeekValue(currentTime)

    if (isHost && !isSuppressed()) {
      const delta = Math.abs(currentTime - lastObservedTimeRef.current)
      if (delta > SEEK_DELTA_THRESHOLD) {
        emitHostSeek(currentTime)
      }
    }

    lastObservedTimeRef.current = currentTime
  }, [isDraggingSeek, isHost, isSuppressed, emitHostSeek])

  const handleVideoEnded = useCallback(() => {
    if (!isHost) return
    // Always try to skip to next video in queue if available
    const next = serverState.queue[0]
    if (!next) return

    const nextState = { ...serverState, currentVideo: next, queue: serverState.queue.slice(1) }
    setServerState(nextState)
    setLocalState({ position: 0, duration: 0, playing: true })
    setSeekValue(0)
    lastObservedTimeRef.current = 0
    persistServerState(nextState)
    emitHostEvent('ourvids:next', { video: next, hostUserId })
  }, [isHost, serverState, emitHostEvent, persistServerState, hostUserId])

  // Polling keeps the custom slider in sync with YouTube/player state.
  useEffect(() => {
    if (!serverState.currentVideo) return

    const interval = setInterval(() => {
      if (serverState.currentVideo?.type === 'youtube' && playerRef.current) {
        const currentTime = Number(playerRef.current.getCurrentTime?.() || 0)
        const duration = Number(playerRef.current.getDuration?.() || 0)
        const playing = playerRef.current.getPlayerState?.() === 1

        if (duration > 0 && !isDraggingSeek) {
          setLocalState(prev => ({ ...prev, position: currentTime, duration, playing }))
          setSeekValue(currentTime)
        }

        if (isHost && !isSuppressed()) {
          const delta = Math.abs(currentTime - lastObservedTimeRef.current)
          if (delta > SEEK_DELTA_THRESHOLD) {
            emitHostSeek(currentTime)
          }
        }

        lastObservedTimeRef.current = currentTime
      }

      if (serverState.currentVideo?.type === 'file' && videoRef.current) {
        const currentTime = Number(videoRef.current.currentTime || 0)
        const duration = Number(videoRef.current.duration || 0)
        const playing = !videoRef.current.paused

        if (duration > 0 && !isDraggingSeek) {
          setLocalState(prev => ({ ...prev, position: currentTime, duration, playing }))
          setSeekValue(currentTime)
        }
      }
    }, 250)

    return () => clearInterval(interval)
  }, [serverState.currentVideo, isDraggingSeek, isHost, isSuppressed, emitHostSeek])

  useEffect(() => {
    if (!localState.playing) {
      setShowControls(true)
      clearHideControlsTimeout()
    } else if (serverState.currentVideo) {
      scheduleControlsHide()
    }

    return () => {
      clearHideControlsTimeout()
    }
  }, [localState.playing, serverState.currentVideo, scheduleControlsHide, clearHideControlsTimeout])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isHost) return
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT') return
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (playerRef.current) {
            const newPlaying = !localState.playing
            setLocalState(prev => ({ ...prev, playing: newPlaying }))
            newPlaying ? playerRef.current.playVideo() : playerRef.current.pauseVideo()
            if (videoRef.current) newPlaying ? videoRef.current.play().catch(() => {}) : videoRef.current.pause()
            emitHostEvent(newPlaying ? 'ourvids:play' : 'ourvids:pause', {})
          }
          break
        case 'ArrowRight':
          if (e.shiftKey) {
            // Next video - don't loop, just go to next if available
            const idx = serverState.queue.findIndex(v => v.id === serverState.currentVideo?.id)
            const next = idx >= 0 ? serverState.queue[idx + 1] : null
            if (next) {
              const nextState = { ...serverState, currentVideo: next }
              setServerState(nextState)
              setLocalState({ position: 0, duration: 0, playing: true })
              setSeekValue(0)
              lastObservedTimeRef.current = 0
              persistServerState(nextState)
              emitHostEvent('ourvids:next', { video: next, hostUserId })
            }
          } else {
            // Seek forward 10 seconds
            const target = Math.min(localState.position + 10, localState.duration)
            setLocalState(prev => ({ ...prev, position: target }))
            setSeekValue(target)
            if (playerRef.current?.seekTo) playerRef.current.seekTo(target, true)
            if (videoRef.current) videoRef.current.currentTime = target
            emitHostSeek(target)
          }
          break
        case 'ArrowLeft':
          // Seek backward 10 seconds
          const targetBack = Math.max(0, localState.position - 10)
          setLocalState(prev => ({ ...prev, position: targetBack }))
          setSeekValue(targetBack)
          if (playerRef.current?.seekTo) playerRef.current.seekTo(targetBack, true)
          if (videoRef.current) videoRef.current.currentTime = targetBack
          emitHostSeek(targetBack)
          break
        case 'ArrowUp':
          // Volume up
          const volUp = Math.min(1, volume + 0.1)
          setVolume(volUp)
          setIsMuted(volUp === 0)
          localStorage.setItem('ourvids_volume', volUp.toString())
          if (playerRef.current?.setVolume) playerRef.current.setVolume(volUp * 100)
          if (videoRef.current) videoRef.current.volume = volUp
          break
        case 'ArrowDown':
          // Volume down
          const volDown = Math.max(0, volume - 0.1)
          setVolume(volDown)
          setIsMuted(volDown === 0)
          localStorage.setItem('ourvids_volume', volDown.toString())
          if (playerRef.current?.setVolume) playerRef.current.setVolume(volDown * 100)
          if (videoRef.current) videoRef.current.volume = volDown
          break
        case 'm':
          // Mute toggle
          if (isMuted) {
            const vol = volume || 0.5
            setVolume(vol)
            setIsMuted(false)
            if (playerRef.current?.setVolume) playerRef.current.setVolume(vol * 100)
            if (videoRef.current) videoRef.current.volume = vol
          } else {
            setVolume(0)
            setIsMuted(true)
            if (playerRef.current?.setVolume) playerRef.current.setVolume(0)
            if (videoRef.current) videoRef.current.volume = 0
          }
          break
        case 'f':
          // Fullscreen toggle
          if (!containerRef.current) return
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          else containerRef.current.requestFullscreen().catch(() => {})
          break
        case 'n':
          // Next video - don't loop, just go to next if available
          const nextIdx = serverState.queue.findIndex(v => v.id === serverState.currentVideo?.id)
          const nextVid = nextIdx >= 0 ? serverState.queue[nextIdx + 1] : null
          if (nextVid) {
            const nextState = { ...serverState, currentVideo: nextVid }
            setServerState(nextState)
            setLocalState({ position: 0, duration: 0, playing: true })
            setSeekValue(0)
            lastObservedTimeRef.current = 0
            persistServerState(nextState)
            emitHostEvent('ourvids:next', { video: nextVid, hostUserId })
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isHost, localState.playing, localState.position, localState.duration, volume, isMuted, serverState.queue, serverState.currentVideo])

  const queueItemKeyCounter = useRef(0)

  const addVideo = useCallback(() => {
    const now = Date.now()
    if (now - lastActionRef.current < 1000) return
    if (!urlInput.trim()) return

    const type = getVideoType(urlInput)
    if (!type) {
      alert('Invalid URL')
      return
    }

    // Generate a unique queue item ID to avoid duplicate key issues
    const queueItemId = `queue_${++queueItemKeyCounter.current}_${Date.now()}`
    const videoId = type === 'youtube' ? parseYouTubeUrl(urlInput) : generateId()
    const video = { id: videoId, url: urlInput, type, title: type === 'youtube' ? 'YouTube Video' : 'Video File', queueItemId }
    const nextHostUserId = hostUserId || currentUser?.id || null
    lastActionRef.current = now

    if (!serverState.currentVideo) {
      const nextState = { queue: [], currentVideo: video, hostUserId: nextHostUserId }
      setServerState(nextState)
      setLocalState({ position: 0, duration: 0, playing: true })
      setSeekValue(0)
      persistServerState(nextState)
      sdk.emitEvent('ourvids:current_video', { video, hostUserId: nextHostUserId }, { serverRelay: true })
      if (nextHostUserId === currentUser?.id) {
        suppressSync(600)
        playerRef.current?.playVideo?.()
        videoRef.current?.play?.().catch(() => {})
      }
    } else {
      const nextQueue = [...serverState.queue, video]
      const nextState = { ...serverState, queue: nextQueue, hostUserId: nextHostUserId }
      setServerState(nextState)
      persistServerState(nextState)
      sdk.emitEvent('ourvids:queue_update', { queue: nextQueue, hostUserId: nextHostUserId }, { serverRelay: true })
      setShowQueue(true)
    }

    setUrlInput('')
  }, [urlInput, serverState, hostUserId, currentUser?.id, sdk, persistServerState, suppressSync])

  const removeVideo = useCallback((videoId) => {
    if (!isHost) return
    const now = Date.now()
    if (now - lastActionRef.current < 500) return
    const newQueue = serverState.queue.filter(v => v.id !== videoId)
    lastActionRef.current = now
    const nextState = { ...serverState, queue: newQueue }
    setServerState(nextState)
    persistServerState(nextState)
    emitHostEvent('ourvids:queue_update', { queue: newQueue, hostUserId })
  }, [isHost, serverState, emitHostEvent, persistServerState, hostUserId])

  const playVideoFromQueue = useCallback((video) => {
    if (!isHost) return
    const now = Date.now()
    if (now - lastActionRef.current < 1000) return

    const newQueue = serverState.queue.filter(v => v.id !== video.id)
    const nextState = { ...serverState, queue: newQueue, currentVideo: video }
    setServerState(nextState)
    setLocalState({ position: 0, duration: 0, playing: true })
    setSeekValue(0)
    lastObservedTimeRef.current = 0
    persistServerState(nextState)
    emitHostEvent('ourvids:current_video', { video, hostUserId })
    emitHostEvent('ourvids:queue_update', { queue: newQueue, hostUserId })
    lastActionRef.current = now
  }, [isHost, serverState, emitHostEvent, persistServerState, hostUserId])

  const clearQueue = useCallback(() => {
    if (!isHost) return
    const now = Date.now()
    if (now - lastActionRef.current < 500) return
    const nextState = { ...serverState, queue: [] }
    setServerState(nextState)
    persistServerState(nextState)
    emitHostEvent('ourvids:queue_update', { queue: [], hostUserId })
    lastActionRef.current = now
  }, [isHost, emitHostEvent, persistServerState, serverState, hostUserId])

  const togglePlay = useCallback(() => {
    if (!isHost) return
    const newPlaying = !localState.playing
    setLocalState(prev => ({ ...prev, playing: newPlaying }))
    if (playerRef.current) newPlaying ? playerRef.current.playVideo() : playerRef.current.pauseVideo()
    if (videoRef.current) newPlaying ? videoRef.current.play().catch(() => {}) : videoRef.current.pause()
    emitHostEvent(newPlaying ? 'ourvids:play' : 'ourvids:pause', {})
  }, [isHost, localState.playing, emitHostEvent])

  const handleSeek = useCallback((position) => {
    if (!isHost) return
    const target = Number(position)
    if (!Number.isFinite(target)) return

    suppressSync(300)
    setLocalState(prev => ({ ...prev, position: target }))
    setSeekValue(target)
    lastObservedTimeRef.current = target

    if (playerRef.current?.seekTo) playerRef.current.seekTo(target, true)
    if (videoRef.current) videoRef.current.currentTime = target

    emitHostSeek(target)
  }, [isHost, suppressSync, emitHostSeek])

  const handleNext = useCallback(() => {
    if (!isHost) return
    const idx = serverState.queue.findIndex(v => v.id === serverState.currentVideo?.id)
    const next = idx >= 0 ? serverState.queue[idx + 1] : null
    if (!next) return

    const nextState = { ...serverState, currentVideo: next }
    setServerState(nextState)
    setLocalState({ position: 0, duration: 0, playing: true })
    setSeekValue(0)
    lastObservedTimeRef.current = 0
    persistServerState(nextState)
    emitHostEvent('ourvids:next', { video: next, hostUserId })
  }, [isHost, serverState, emitHostEvent, persistServerState, hostUserId])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else containerRef.current.requestFullscreen().catch(() => {})
  }, [])

  const handleVolumeChange = useCallback((newVolume) => {
    const vol = Number(newVolume)
    if (!Number.isFinite(vol)) return
    const clampedVol = Math.max(0, Math.min(1, vol))
    setVolume(clampedVol)
    setIsMuted(clampedVol === 0)
    localStorage.setItem('ourvids_volume', clampedVol.toString())

    if (playerRef.current?.setVolume) {
      playerRef.current.setVolume(clampedVol * 100)
    }
    if (videoRef.current) {
      videoRef.current.volume = clampedVol
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (isMuted) {
      handleVolumeChange(volume || 0.5)
      setIsMuted(false)
    } else {
      handleVolumeChange(0)
      setIsMuted(true)
    }
  }, [isMuted, volume, handleVolumeChange])

  const formatTime = (seconds) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const hostLockedStyle = !isHost
    ? { opacity: 0.65, cursor: 'not-allowed' }
    : undefined

  const youtubeOpts = useMemo(() => ({
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      disablekb: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1,
      enablejsapi: 1
    }
  }), [])

  if (!sdk) return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading OurVids...</p></div>

  return (
    <div className="ourvids-activity">
      <div className="ourvids-header" style={{ flexWrap: 'wrap' }}>
        <h3 style={{ color: 'white', margin: 0 }}>OurVids</h3>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
          {isHost ? 'You control playback' : 'Anyone can queue, host controls playback'}
        </span>

        <div className="ourvids-input-group" style={{ maxWidth: 'none', minWidth: 0 }}>
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste YouTube URL..."
            onKeyDown={e => e.key === 'Enter' && addVideo()}
            style={{ opacity: 1 }}
          />
          <button
            className="ourvids-add-btn"
            onClick={addVideo}
            style={{ opacity: 1, cursor: 'pointer' }}
          >
            <PlusIcon width={20} height={20} />
          </button>
        </div>

        <button className={`ourvids-queue-toggle ${showQueue ? 'active' : ''}`} onClick={() => setShowQueue(!showQueue)}>
          <QueueListIcon width={20} height={20} /><span>Queue</span>
        </button>
      </div>

      <div className="ourvids-content">
        <div
          ref={containerRef}
          className="ourvids-player"
          onMouseMove={() => revealControls()}
          onTouchStart={() => revealControls(4000)}
          onClick={() => revealControls()}
        >
          {serverState.currentVideo ? (
            <>
              {serverState.currentVideo.type === 'youtube' ? (
                <>
                  {isLoading && (
                    <div className="ourvids-loading">
                      <div className="loading-spinner" />
                      <p>Loading video...</p>
                    </div>
                  )}
                  {errorMessage && (
                    <div className="ourvids-error">
                      <XCircleIcon width={48} height={48} />
                      <p>{errorMessage}</p>
                      {isHost && (
                        <button onClick={() => { setErrorMessage(null); removeVideo(serverState.currentVideo.id) }}>
                          Remove Video
                        </button>
                      )}
                    </div>
                  )}
                  <YouTube
                    videoId={serverState.currentVideo.id}
                    opts={youtubeOpts}
                    onReady={handleYouTubeReady}
                    onStateChange={handleYouTubeStateChange}
                    onError={handleYouTubeError}
                    onEnd={handleYouTubeEnd}
                    className="ourvids-youtube"
                    style={{ flex: 1, width: '100%', height: '100%' }}
                  />
                </>
              ) : (
                <>
                  {isLoading && (
                    <div className="ourvids-loading">
                      <div className="loading-spinner" />
                      <p>Loading video...</p>
                    </div>
                  )}
                  {errorMessage && (
                    <div className="ourvids-error">
                      <XCircleIcon width={48} height={48} />
                      <p>{errorMessage}</p>
                      {isHost && (
                        <button onClick={() => { setErrorMessage(null); removeVideo(serverState.currentVideo.id) }}>
                          Remove Video
                        </button>
                      )}
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    src={getPlayableMediaUrl(serverState.currentVideo.url)}
                    autoPlay={localState.playing}
                    className="ourvids-video"
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={handleVideoEnded}
                    onError={handleVideoError}
                    onCanPlay={() => setIsLoading(false)}
                  />
                </>
              )}

              {!showControls && (
                <div
                  className="ourvids-hover-sensor"
                  onMouseMove={() => revealControls()}
                  onMouseEnter={() => revealControls()}
                  onTouchStart={() => revealControls(4000)}
                  onClick={() => revealControls()}
                  aria-hidden="true"
                />
              )}

              <div className={`ourvids-controls ${showControls ? 'visible' : 'hidden'}`}>
                <div className="ourvids-buttons" style={{ width: '100%' }}>
                  <button
                    className={localState.playing ? 'pause-btn' : 'play-btn'}
                    onClick={togglePlay}
                    disabled={!isHost}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', ...hostLockedStyle }}
                  >
                    {localState.playing ? <PauseIcon width={24} height={24} /> : <PlayIcon width={24} height={24} />}
                  </button>

                  <div className="ourvids-seek">
                    <span>{formatTime(isDraggingSeek ? seekValue : localState.position)}</span>
                    <input
                      type="range"
                      min={0}
                      max={localState.duration || 100}
                      value={isDraggingSeek ? seekValue : localState.position}
                      onMouseDown={() => setIsDraggingSeek(true)}
                      onTouchStart={() => setIsDraggingSeek(true)}
                      onChange={e => setSeekValue(Number.parseFloat(e.target.value))}
                      onMouseUp={e => {
                        setIsDraggingSeek(false)
                        handleSeek(Number.parseFloat(e.target.value))
                      }}
                      onTouchEnd={e => {
                        setIsDraggingSeek(false)
                        handleSeek(Number.parseFloat(e.target.value))
                      }}
                      disabled={!isHost}
                      style={{ accentColor: '#6366f1', ...hostLockedStyle }}
                    />
                    <span>{formatTime(localState.duration)}</span>
                  </div>

                  <div className="ourvids-volume" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                    <button
                      onClick={toggleMute}
                      style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
                    >
                      {isMuted || volume === 0 ? <SpeakerXMarkIcon width={18} height={18} /> : <SpeakerWaveIcon width={18} height={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={e => handleVolumeChange(Number.parseFloat(e.target.value))}
                      style={{ accentColor: '#6366f1', width: '80px', cursor: 'pointer' }}
                    />
                  </div>

                  <button
                    className="next-btn"
                    onClick={handleNext}
                    disabled={!isHost || serverState.queue.length === 0}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '10px', color: 'white', opacity: (!isHost || serverState.queue.length === 0) ? 0.5 : 1, cursor: (!isHost || serverState.queue.length === 0) ? 'not-allowed' : 'pointer' }}
                  >
                    <ForwardIcon width={20} height={20} />
                  </button>

                  <button className="fullscreen-btn" onClick={toggleFullscreen} style={{ cursor: 'pointer', color: 'white' }}>
                    {document.fullscreenElement ? <ArrowsPointingInIcon width={20} /> : <ArrowsPointingOutIcon width={20} />}
                  </button>

                  {isHost && (
                    <button onClick={syncAll} style={{ background: '#6366f1', border: 'none', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                      <ArrowPathIcon width={18} /><span>Sync</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="ourvids-empty" style={{ color: 'white' }}>
              <p>No video playing</p>
              <p>Add a video to get started!</p>
            </div>
          )}
        </div>

        <div className={`ourvids-queue ${showQueue ? 'visible' : 'hidden'}`} aria-hidden={!showQueue}>
            <div className="ourvids-queue-header">
              <h4 style={{ color: 'white', margin: 0 }}>Queue ({serverState.queue.length})</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                {serverState.queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    disabled={!isHost}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: !isHost ? 'not-allowed' : 'pointer', fontSize: '12px', opacity: !isHost ? 0.6 : 1 }}
                  >
                    Clear
                  </button>
                )}
                <button className="ourvids-queue-close" onClick={() => setShowQueue(false)}><XMarkIcon width={20} /></button>
              </div>
            </div>
            <div className="queue-list">
              {serverState.queue.map((video, index) => (
                <div key={video.queueItemId || video.id} className="queue-item" style={{ cursor: isHost ? 'pointer' : 'default' }} onClick={() => playVideoFromQueue(video)}>
                  <span className="queue-number">{index + 1}</span>
                  <div className="queue-info">
                    <div className="queue-title">{video.title}</div>
                    <div className="queue-type">{video.type}</div>
                  </div>
                  <button className="queue-remove" onClick={(e) => { e.stopPropagation(); removeVideo(video.id) }} disabled={!isHost} style={{ cursor: !isHost ? 'not-allowed' : 'pointer', opacity: !isHost ? 0.6 : 1 }}><TrashIcon width={16} /></button>
                </div>
              ))}
              {serverState.queue.length === 0 && <p className="queue-empty">Queue is empty</p>}
            </div>
          </div>
      </div>
    </div>
  )
}

export default OurVidsActivity
