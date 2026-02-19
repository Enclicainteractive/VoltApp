import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Wifi, Activity, Server, Mic, Volume2 } from 'lucide-react'

// How often to poll RTCPeerConnection stats (ms)
const POLL_MS = 1000
// How many samples to keep in the ping graph
const GRAPH_SAMPLES = 30

const VoiceInfoModal = ({ channel, onClose }) => {
  const [peers, setPeers] = useState([])   // [{ id, conn, ice, sig, rtt, jitter, packetsLost, bytesReceived, bytesSent }]
  const [pingHistory, setPingHistory] = useState([])  // last N rtt values (avg across peers)
  const canvasRef = useRef(null)
  const timerRef = useRef(null)

  // Grab peer connections from the VoiceChannel component via a global debug hook
  const getPCs = useCallback(() => {
    if (typeof window.__vcGetPCs === 'function') return window.__vcGetPCs()
    return {}
  }, [])

  const poll = useCallback(async () => {
    const pcs = getPCs()
    const results = []
    let totalRtt = 0
    let rttCount = 0

    for (const [peerId, pc] of Object.entries(pcs)) {
      const entry = {
        id: peerId,
        conn: pc.connectionState,
        ice: pc.iceConnectionState,
        sig: pc.signalingState,
        rtt: null,
        jitter: null,
        packetsLost: null,
        bytesReceived: null,
        bytesSent: null,
        codec: null,
      }
      try {
        const stats = await pc.getStats()
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime != null) {
              entry.rtt = Math.round(report.currentRoundTripTime * 1000)
              totalRtt += entry.rtt
              rttCount++
            }
            entry.bytesSent = report.bytesSent
            entry.bytesReceived = report.bytesReceived
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            if (report.jitter != null) entry.jitter = Math.round(report.jitter * 1000)
            if (report.packetsLost != null) entry.packetsLost = report.packetsLost
          }
          if (report.type === 'codec') {
            entry.codec = report.mimeType?.replace('audio/', '') ?? null
          }
        })
      } catch {}
      results.push(entry)
    }

    setPeers(results)
    const avgRtt = rttCount > 0 ? Math.round(totalRtt / rttCount) : null
    if (avgRtt != null) {
      setPingHistory(prev => {
        const next = [...prev, avgRtt]
        return next.slice(-GRAPH_SAMPLES)
      })
    }
  }, [getPCs])

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [poll])

  // Draw the ping graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || pingHistory.length < 2) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const max = Math.max(...pingHistory, 100)
    const min = 0

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    // Colour based on max ping
    const lineColor = max > 200 ? '#ef4444' : max > 100 ? '#f59e0b' : '#22c55e'

    // Fill
    ctx.beginPath()
    const step = w / (GRAPH_SAMPLES - 1)
    pingHistory.forEach((v, i) => {
      const x = i * step
      const y = h - ((v - min) / (max - min)) * h
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.lineTo((pingHistory.length - 1) * step, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, lineColor + '55')
    grad.addColorStop(1, lineColor + '00')
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.beginPath()
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 2
    pingHistory.forEach((v, i) => {
      const x = i * step
      const y = h - ((v - min) / (max - min)) * h
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Latest value label
    const last = pingHistory[pingHistory.length - 1]
    ctx.fillStyle = lineColor
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`${last} ms`, w - 48, 16)
  }, [pingHistory])

  const fmt = (n) => n == null ? '—' : n
  const fmtBytes = (n) => {
    if (n == null) return '—'
    if (n > 1_000_000) return (n / 1_000_000).toFixed(1) + ' MB'
    if (n > 1_000) return (n / 1_000).toFixed(1) + ' KB'
    return n + ' B'
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520, padding: 0, borderRadius: 12, overflow: 'hidden', background: 'var(--volt-bg-secondary)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--volt-border)' }}>
          <Activity size={18} color="var(--volt-primary)" />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Voice Connection — {channel?.name}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--volt-text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ping graph */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Wifi size={14} color="var(--volt-text-muted)" />
              <span style={{ fontSize: 12, color: 'var(--volt-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Latency</span>
              {pingHistory.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--volt-text-secondary)' }}>
                  avg {Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length)} ms
                </span>
              )}
            </div>
            <canvas
              ref={canvasRef}
              width={460}
              height={72}
              style={{ width: '100%', height: 72, borderRadius: 8, background: 'var(--volt-bg-tertiary)', display: 'block' }}
            />
            {pingHistory.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--volt-text-muted)', fontSize: 12, marginTop: -50, position: 'relative' }}>
                Gathering stats…
              </div>
            )}
          </div>

          {/* Per-peer table */}
          {peers.length === 0 ? (
            <div style={{ color: 'var(--volt-text-muted)', fontSize: 13, textAlign: 'center' }}>No active peer connections.</div>
          ) : peers.map(p => (
            <div key={p.id} style={{ background: 'var(--volt-bg-tertiary)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: p.conn === 'connected' ? '#22c55e' : p.conn === 'connecting' ? '#f59e0b' : '#ef4444'
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.id}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
                <StatRow label="Connection" value={p.conn} />
                <StatRow label="ICE" value={p.ice} />
                <StatRow label="Signaling" value={p.sig} />
                <StatRow label="RTT" value={p.rtt != null ? `${p.rtt} ms` : '—'} />
                <StatRow label="Jitter" value={p.jitter != null ? `${p.jitter} ms` : '—'} />
                <StatRow label="Packets lost" value={fmt(p.packetsLost)} />
                <StatRow label="Received" value={fmtBytes(p.bytesReceived)} />
                <StatRow label="Sent" value={fmtBytes(p.bytesSent)} />
                {p.codec && <StatRow label="Codec" value={p.codec} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const StatRow = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ color: 'var(--volt-text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    <span style={{ color: 'var(--volt-text-primary)', fontWeight: 500, fontFamily: 'monospace', fontSize: 12 }}>{value}</span>
  </div>
)

export default VoiceInfoModal
