import React, { useEffect, useState } from 'react'

const P2PLobbyActivity = ({ sdk }) => {
  const [status, setStatus] = useState(() => sdk?.getP2PStatus?.() || { connectedPeers: [] })

  useEffect(() => {
    if (!sdk) return
    const refresh = () => setStatus(sdk.getP2PStatus())
    refresh()
    const offOpen = sdk.on('p2p:peer-open', refresh)
    const offLeft = sdk.on('p2p:peer-left', refresh)
    const intv = setInterval(refresh, 1000)
    return () => { clearInterval(intv); offOpen?.(); offLeft?.() }
  }, [sdk])

  return (
    <div className="builtin-activity-body stack">
      <div>Peer ID: <code>{status.peerId}</code></div>
      <div>P2P Enabled: <strong>{String(status.enabled)}</strong></div>
      <div>Connected Peers: {status.connectedPeers?.length || 0}</div>
      <div className="list">
        {(status.connectedPeers || []).map(peer => <div key={peer}><code>{peer}</code></div>)}
      </div>
    </div>
  )
}

export default P2PLobbyActivity
