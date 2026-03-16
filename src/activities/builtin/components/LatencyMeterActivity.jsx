import React, { useEffect, useRef, useState } from 'react'

const LatencyMeterActivity = ({ sdk }) => {
  const [rtt, setRtt] = useState(null)
  const pending = useRef(new Map())

  useEffect(() => {
    if (!sdk) return

    const off = sdk.on('event', (evt) => {
      if (evt?.eventType === 'latency:ping') {
        sdk.emitEvent('latency:pong', { id: evt.payload?.id, t0: evt.payload?.t0 })
      }
      if (evt?.eventType === 'latency:pong') {
        const id = evt.payload?.id
        if (!id || !pending.current.has(id)) return
        const sent = pending.current.get(id)
        pending.current.delete(id)
        setRtt(Math.max(0, Date.now() - sent))
      }
    })

    const interval = setInterval(() => {
      // Evict the oldest pending entry if the map grows too large (e.g. pongs never arrive)
      if (pending.current.size >= 20) {
        const oldest = pending.current.keys().next().value
        pending.current.delete(oldest)
      }
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      pending.current.set(id, Date.now())
      sdk.emitEvent('latency:ping', { id, t0: Date.now() })
    }, 1500)

    return () => {
      clearInterval(interval)
      off?.()
    }
  }, [sdk])

  return (
    <div className="builtin-activity-body stack">
      <div className="latency-value">RTT: {rtt == null ? '--' : `${rtt}ms`}</div>
    </div>
  )
}

export default LatencyMeterActivity
