import React, { useEffect, useState } from 'react'

const MIN_COUNTER = -1000000
const MAX_COUNTER = 1000000

const sanitizeCounter = (value, fallback = 0) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n)
  return Math.max(MIN_COUNTER, Math.min(MAX_COUNTER, rounded))
}

const SharedCounterActivity = ({ sdk }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!sdk) return
    const offEvent = sdk.on('event', (evt) => {
      if (evt?.eventType === 'counter:set') {
        const next = sanitizeCounter(evt?.payload?.value, 0)
        setCount(prev => (prev === next ? prev : next))
      }
    })
    const offState = sdk.subscribeServerState((state) => {
      if (state?.counter !== undefined) {
        const next = sanitizeCounter(state.counter, 0)
        setCount(prev => (prev === next ? prev : next))
      }
    })
    return () => { offEvent?.(); offState?.() }
  }, [sdk])

  // Defensive check - don't render if SDK is not available
  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading counter...</p></div>
  }

  const push = (value) => {
    const next = sanitizeCounter(value, count)
    if (next === count) return
    setCount(next)
    if (!sdk) return
    sdk.updateState({ counter: next })
    sdk.emitEvent('counter:set', { value: next }, { cue: 'score_update' })
  }

  return (
    <div className="builtin-activity-body stack">
      <div className="counter-value">{count}</div>
      <div className="row gap">
        <button onClick={() => push(count - 1)}>-1</button>
        <button onClick={() => push(count + 1)}>+1</button>
        <button onClick={() => push(0)}>Reset</button>
      </div>
    </div>
  )
}

export default SharedCounterActivity
