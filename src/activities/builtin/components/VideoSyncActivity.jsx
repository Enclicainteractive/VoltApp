import React, { useEffect, useRef, useState } from 'react'

const MIN_POS = 0
const MAX_POS = 600

const sanitizePosition = (value, fallback = 0) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(MIN_POS, Math.min(MAX_POS, Math.floor(n)))
}

const sanitizePlayState = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  return fallback
}

const VideoSyncActivity = ({ sdk }) => {
  const [playState, setPlayState] = useState({ playing: false, position: 0 })
  const lastSeekSentRef = useRef(0)
  const lastSeekValueRef = useRef(0)
  const playStateRef = useRef(playState)

  useEffect(() => {
    playStateRef.current = playState
  }, [playState])

  useEffect(() => {
    if (!sdk) return
    const offState = sdk.subscribeServerState((state) => {
      if (state?.video && typeof state.video === 'object') {
        const nextPosition = sanitizePosition(state.video.position, playStateRef.current.position)
        const nextPlaying = sanitizePlayState(state.video.playing, playStateRef.current.playing)
        setPlayState(prev => (
          prev.position === nextPosition && prev.playing === nextPlaying
            ? prev
            : { ...prev, position: nextPosition, playing: nextPlaying }
        ))
      }
    })
    const offEvent = sdk.on('event', (evt) => {
      if (evt?.eventType === 'video:play') setPlayState(prev => ({ ...prev, playing: true }))
      if (evt?.eventType === 'video:pause') setPlayState(prev => ({ ...prev, playing: false }))
      if (evt?.eventType === 'video:seek') {
        const nextPosition = sanitizePosition(evt?.payload?.position, playStateRef.current.position)
        setPlayState(prev => (prev.position === nextPosition ? prev : { ...prev, position: nextPosition }))
      }
    })
    return () => { offState?.(); offEvent?.() }
  }, [sdk])

  const seek = (position) => {
    if (!sdk) return
    const next = sanitizePosition(position, playState.position)
    setPlayState(prev => (prev.position === next ? prev : { ...prev, position: next }))

    const now = Date.now()
    const duplicate = lastSeekValueRef.current === next && (now - lastSeekSentRef.current) < 120
    if (duplicate) return
    lastSeekValueRef.current = next
    lastSeekSentRef.current = now

    sdk.updateState({ video: { position: next, playing: !!playStateRef.current.playing, ts: now } })
    sdk.emitEvent('video:seek', { position: next })
  }

  return (
    <div className="builtin-activity-body stack">
      <div>Playback: {playState.playing ? 'Playing' : 'Paused'}</div>
      <input type="range" min="0" max="600" value={playState.position} onChange={(e) => seek(e.target.value)} />
      <div className="row gap">
        <button onClick={() => { sdk.emitEvent('video:play', {}, { cue: 'round_start' }); setPlayState(prev => ({ ...prev, playing: true })) }}>Play</button>
        <button onClick={() => { sdk.emitEvent('video:pause'); setPlayState(prev => ({ ...prev, playing: false })) }}>Pause</button>
      </div>
    </div>
  )
}

export default VideoSyncActivity
