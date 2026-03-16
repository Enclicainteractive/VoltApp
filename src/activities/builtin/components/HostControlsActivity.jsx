import React, { useEffect, useState } from 'react'

const HostControlsActivity = ({ sdk, session, currentUser }) => {
  const [log, setLog] = useState([])
  const role = session?.participantRoles?.[currentUser?.id] || 'participant'
  const isHost = role === 'host' || session?.hostUserId === currentUser?.id

  useEffect(() => {
    if (!sdk) return
    const off = sdk.on('event', (evt) => {
      if (!evt?.eventType?.startsWith('round:')) return
      setLog(prev => [`${evt.eventType} by ${evt.fromPeerId || evt.payload?.userId || 'peer'}`, ...prev].slice(0, 12))
    })
    return () => off?.()
  }, [sdk])

  const act = (eventType, cue = null) => {
    if (!isHost || !sdk) return
    sdk.emitEvent(eventType, { userId: currentUser?.id, t: Date.now() }, { cue })
  }

  return (
    <div className="builtin-activity-body stack">
      <div>Role: <strong>{role}</strong></div>
      <div className="row gap">
        <button disabled={!isHost} onClick={() => act('round:start', 'round_start')}>Start Round</button>
        <button disabled={!isHost} onClick={() => act('round:pause')}>Pause</button>
        <button disabled={!isHost} onClick={() => act('round:resume')}>Resume</button>
        <button disabled={!isHost} onClick={() => act('round:end', 'round_end')}>End</button>
      </div>
      <div className="list">{log.map((entry, idx) => <div key={`${entry}_${idx}`}>{entry}</div>)}</div>
    </div>
  )
}

export default HostControlsActivity
