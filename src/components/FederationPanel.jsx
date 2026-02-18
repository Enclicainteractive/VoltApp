import React, { useState, useEffect } from 'react'
import { Globe, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Link, Send, Clock, Share2 } from 'lucide-react'
import { apiService } from '../services/apiService'
import './FederationPanel.css'

const FederationPanel = () => {
  const [peers, setPeers] = useState([])
  const [sharedInvites, setSharedInvites] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddPeer, setShowAddPeer] = useState(false)
  const [showShareInvite, setShowShareInvite] = useState(false)
  const [peerForm, setPeerForm] = useState({ name: '', url: '' })
  const [inviteForm, setInviteForm] = useState({ code: '', serverId: '', serverName: '', maxUses: 0 })
  const [info, setInfo] = useState(null)

  const loadPeers = async () => {
    setLoading(true)
    try {
      const res = await apiService.getFederationPeers()
      setPeers(res.data || [])
    } catch (err) {
      console.error('Failed to load peers:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadInvites = async () => {
    try {
      const res = await apiService.getFederationInvites()
      setSharedInvites(res.data || [])
    } catch (err) {
      console.error('Failed to load invites:', err)
    }
  }

  const loadInfo = async () => {
    try {
      const res = await apiService.getFederationInfo()
      setInfo(res.data || null)
    } catch (err) {
      console.error('Failed to load federation info:', err)
    }
  }

  useEffect(() => {
    loadPeers()
    loadInvites()
    loadInfo()
  }, [])

  const handleAddPeer = async (e) => {
    e.preventDefault()
    if (!peerForm.name || !peerForm.url) return
    try {
      await apiService.addFederationPeer(peerForm)
      setPeerForm({ name: '', url: '' })
      setShowAddPeer(false)
      loadPeers()
    } catch (err) {
      console.error('Failed to add peer:', err)
    }
  }

  const handleAcceptPeer = async (peerId) => {
    try {
      await apiService.acceptFederationPeer(peerId)
      loadPeers()
    } catch (err) {
      console.error('Failed to accept peer:', err)
    }
  }

  const handleRejectPeer = async (peerId) => {
    try {
      await apiService.rejectFederationPeer(peerId)
      loadPeers()
    } catch (err) {
      console.error('Failed to reject peer:', err)
    }
  }

  const handleRemovePeer = async (peerId) => {
    if (!confirm('Remove this peer?')) return
    try {
      await apiService.removeFederationPeer(peerId)
      loadPeers()
    } catch (err) {
      console.error('Failed to remove peer:', err)
    }
  }

  const handleShareInvite = async (e) => {
    e.preventDefault()
    if (!inviteForm.code || !inviteForm.serverId) return
    try {
      await apiService.shareFederationInvite(inviteForm)
      setInviteForm({ code: '', serverId: '', serverName: '', maxUses: 0 })
      setShowShareInvite(false)
      loadInvites()
    } catch (err) {
      console.error('Failed to share invite:', err)
    }
  }

  const handleRemoveInvite = async (inviteId) => {
    try {
      await apiService.removeFederationInvite(inviteId)
      loadInvites()
    } catch (err) {
      console.error('Failed to remove invite:', err)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircle size={14} className="status-connected" />
      case 'pending': return <Clock size={14} className="status-pending" />
      case 'rejected': return <XCircle size={14} className="status-rejected" />
      default: return <XCircle size={14} className="status-error" />
    }
  }

  return (
    <div className="federation-panel">
      {info && (
        <div className="federation-info-card">
          <div className="info-row">
            <Globe size={16} />
            <span className="info-label">Host:</span>
            <span className="info-value">{info.host}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Federation:</span>
            <span className={`info-badge ${info.federationEnabled ? 'enabled' : 'disabled'}`}>
              {info.federationEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Connected Peers:</span>
            <span className="info-value">{info.peerCount}</span>
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="section-header">
          <h3>Federated Peers</h3>
          <div className="section-actions">
            <button className="btn btn-sm btn-ghost" onClick={loadPeers} title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAddPeer(true)}>
              <Plus size={14} /> Add Peer
            </button>
          </div>
        </div>

        {showAddPeer && (
          <form className="inline-form" onSubmit={handleAddPeer}>
            <input
              placeholder="Mainline name"
              value={peerForm.name}
              onChange={e => setPeerForm(p => ({ ...p, name: e.target.value }))}
            />
            <input
              placeholder="https://other-mainline.com"
              value={peerForm.url}
              onChange={e => setPeerForm(p => ({ ...p, url: e.target.value }))}
            />
            <button type="submit" className="btn btn-sm btn-primary">Connect</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAddPeer(false)}>Cancel</button>
          </form>
        )}

        {loading ? (
          <div className="loading-state">Loading peers...</div>
        ) : peers.length === 0 ? (
          <div className="empty-state-small">No federated peers yet. Add a peer to start communicating across mainlines.</div>
        ) : (
          <div className="peer-list">
            {peers.map(peer => (
              <div key={peer.id} className="peer-item">
                <div className="peer-info">
                  <div className="peer-name">
                    {getStatusIcon(peer.status)}
                    <span>{peer.name}</span>
                    <span className="peer-direction">({peer.direction})</span>
                  </div>
                  <div className="peer-host">{peer.host}</div>
                  {peer.lastSeen && (
                    <div className="peer-last-seen">Last seen: {new Date(peer.lastSeen).toLocaleString()}</div>
                  )}
                </div>
                <div className="peer-actions">
                  {peer.status === 'pending' && peer.direction === 'incoming' && (
                    <>
                      <button className="btn btn-sm btn-success" onClick={() => handleAcceptPeer(peer.id)}>
                        <CheckCircle size={14} /> Accept
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleRejectPeer(peer.id)}>
                        <XCircle size={14} /> Reject
                      </button>
                    </>
                  )}
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={() => handleRemovePeer(peer.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="section-header">
          <h3>Shared Invites</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setShowShareInvite(true)}>
            <Share2 size={14} /> Share Invite
          </button>
        </div>

        {showShareInvite && (
          <form className="inline-form" onSubmit={handleShareInvite}>
            <input
              placeholder="Invite code"
              value={inviteForm.code}
              onChange={e => setInviteForm(p => ({ ...p, code: e.target.value }))}
            />
            <input
              placeholder="Server ID"
              value={inviteForm.serverId}
              onChange={e => setInviteForm(p => ({ ...p, serverId: e.target.value }))}
            />
            <input
              placeholder="Server name"
              value={inviteForm.serverName}
              onChange={e => setInviteForm(p => ({ ...p, serverName: e.target.value }))}
            />
            <button type="submit" className="btn btn-sm btn-primary">Share</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowShareInvite(false)}>Cancel</button>
          </form>
        )}

        {sharedInvites.length === 0 ? (
          <div className="empty-state-small">No shared invites. Share invite codes to let users from other mainlines join your servers.</div>
        ) : (
          <div className="invite-list">
            {sharedInvites.map(invite => (
              <div key={invite.id} className="invite-item">
                <div className="invite-info">
                  <div className="invite-server">{invite.serverName || invite.serverId}</div>
                  <div className="invite-code">
                    <Link size={12} /> {invite.code}
                  </div>
                  <div className="invite-meta">
                    From: {invite.sourceMainline} | Uses: {invite.uses}{invite.maxUses ? `/${invite.maxUses}` : ''}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => handleRemoveInvite(invite.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FederationPanel
