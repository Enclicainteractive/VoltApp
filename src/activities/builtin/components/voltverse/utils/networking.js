import { v4 as uuidv4 } from 'uuid'
import LZString from 'lz-string'
import { useStore } from '../stores/voltverseStore'

let socketRef = null
let peerConnections = new Map()
let dataChannels = new Map()
let offEventRef = null

const PEER_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export const initializeNetworking = async (sdk) => {
  if (!sdk) {
    console.warn('[VoltVerse] No SDK provided for networking')
    return
  }

  socketRef = sdk

  sdk.on('peer:join', handlePeerJoin)
  sdk.on('peer:leave', handlePeerLeave)
  sdk.on('peer:data', handlePeerData)
  sdk.on('room:state', handleRoomState)
  sdk.on('player:update', handlePlayerUpdate)
  offEventRef = sdk.on('event', handleSdkEvent)

  sdk.emitEvent('voltverse:network-ready', {}, { serverRelay: true })

  console.log('[VoltVerse] Networking initialized')
}

export const cleanupNetworking = () => {
  peerConnections.forEach((pc) => pc.close())
  peerConnections.clear()
  dataChannels.clear()
  offEventRef?.()
  offEventRef = null

  socketRef = null
  console.log('[VoltVerse] Networking cleaned up')
}

const handleSdkEvent = (evt = {}) => {
  const { eventType, payload, userId } = evt
  if (!eventType || !eventType.startsWith('voltverse:')) return
  if (userId && userId === useStore.getState().localPlayerId) return

  switch (eventType) {
    case 'voltverse:player-state':
      handlePlayerState(userId || payload?.playerId, payload)
      break
    case 'voltverse:world-sync':
      handleWorldSync(payload?.compressed ? decompressData(payload.compressed) : payload)
      break
    case 'voltverse:avatar-update':
      handleAvatarUpdate(userId || payload?.playerId, payload?.compressed ? decompressData(payload.compressed) : payload)
      break
    case 'voltverse:chat-message':
      handleChatMessage(userId || payload?.senderId, payload)
      break
    default:
      break
  }
}

const handlePeerJoin = async (peerId) => {
  console.log('[VoltVerse] Peer joined:', peerId)
  
  const pc = new RTCPeerConnection(PEER_CONFIG)
  peerConnections.set(peerId, pc)

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketRef?.emitEvent({
        type: 'ice:candidate',
        target: peerId,
        candidate: event.candidate
      })
    }
  }

  pc.ondatachannel = (event) => {
    const channel = event.channel
    setupDataChannel(peerId, channel)
  }

  const channel = pc.createDataChannel('voltverse', {
    ordered: true
  })
  setupDataChannel(peerId, channel)

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    
    socketRef?.emitEvent({
      type: 'offer',
      target: peerId,
      offer: offer
    })
  } catch (err) {
    console.error('[VoltVerse] Error creating offer:', err)
  }
}

const handlePeerLeave = (peerId) => {
  const pc = peerConnections.get(peerId)
  if (pc) {
    pc.close()
    peerConnections.delete(peerId)
  }
  dataChannels.delete(peerId)
  
  useStore.getState().removePlayer(peerId)
}

const handlePeerData = async (data) => {
  const { type, payload } = data

  switch (type) {
    case 'offer':
      await handleOffer(data.from, payload)
      break
    case 'answer':
      await handleAnswer(data.from, payload)
      break
    case 'ice:candidate':
      await handleIceCandidate(data.from, payload)
      break
    case 'player:state':
      handlePlayerState(data.from, payload)
      break
    case 'world:sync':
      handleWorldSync(payload)
      break
    case 'avatar:update':
      handleAvatarUpdate(data.from, payload)
      break
    case 'chat:message':
      handleChatMessage(data.from, payload)
      break
    default:
      break
  }
}

const setupDataChannel = (peerId, channel) => {
  channel.onopen = () => {
    console.log('[VoltVerse] Data channel open with:', peerId)
    dataChannels.set(peerId, channel)
  }

  channel.onclose = () => {
    console.log('[VoltVerse] Data channel closed with:', peerId)
    dataChannels.delete(peerId)
  }

  channel.onmessage = (event) => {
    try {
      const data = typeof event.data === 'string' ? decompressData(event.data) : event.data
      handlePeerData({ ...data, from: peerId })
    } catch (err) {
      console.error('[VoltVerse] Error parsing peer data:', err)
    }
  }
}

const handleOffer = async (peerId, offer) => {
  const pc = peerConnections.get(peerId) || new RTCPeerConnection(PEER_CONFIG)
  peerConnections.set(peerId, pc)

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketRef?.emitEvent({
        type: 'ice:candidate',
        target: peerId,
        candidate: event.candidate
      })
    }
  }

  pc.ondatachannel = (event) => {
    setupDataChannel(peerId, event.channel)
  }

  await pc.setRemoteDescription(new RTCSessionDescription(offer))
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)

  socketRef?.emitEvent({
    type: 'answer',
    target: peerId,
    answer: answer
  })
}

const handleAnswer = async (peerId, answer) => {
  const pc = peerConnections.get(peerId)
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer))
  }
}

const handleIceCandidate = async (peerId, candidate) => {
  const pc = peerConnections.get(peerId)
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }
}

const handlePlayerState = (peerId, state) => {
  useStore.getState().updatePlayer(peerId, state)
}

const handleWorldSync = (worldData) => {
  useStore.getState().setWorldState(worldData?.worldState || worldData)
}

const handleAvatarUpdate = (peerId, avatarData) => {
  useStore.getState().updateAvatar(peerId, avatarData?.avatarData || avatarData)
}

const handleChatMessage = (peerId, message) => {
  useStore.getState().addChatMessage({
    ...message,
    senderId: peerId
  })
}

const handleRoomState = (state) => {
  if (state.players) {
    useStore.getState().setPlayers(new Map(Object.entries(state.players)))
  }
  if (state.worldState) {
    useStore.getState().setWorldState(state.worldState)
  }
}

const handlePlayerUpdate = (update) => {
  broadcastToPeers({
    type: 'player:state',
    payload: update
  })
}

export const broadcastToPeers = (data) => {
  const compressed = compressData(data)

  if (socketRef?.emitEvent) {
    const eventMap = {
      'player:state': 'voltverse:player-state',
      'world:sync': 'voltverse:world-sync',
      'avatar:update': 'voltverse:avatar-update',
      'chat:message': 'voltverse:chat-message'
    }
    const eventType = eventMap[data.type]
    if (eventType) {
      socketRef.emitEvent(
        eventType,
        data.type === 'player:state' ? data.payload : { compressed },
        { serverRelay: true }
      )
    }
  }
  
  dataChannels.forEach((channel, peerId) => {
    if (channel.readyState === 'open') {
      try {
        channel.send(compressed)
      } catch (err) {
        console.error('[VoltVerse] Error sending to peer:', peerId, err)
      }
    }
  })
}

export const sendToPeer = (peerId, data) => {
  const channel = dataChannels.get(peerId)
  if (channel && channel.readyState === 'open') {
    const compressed = compressData(data)
    channel.send(compressed)
  }
}

const compressData = (data) => {
  try {
    const json = JSON.stringify(data)
    return LZString.compressToEncodedURIComponent(json)
  } catch {
    return JSON.stringify(data)
  }
}

export const decompressData = (compressed) => {
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed)
    return JSON.parse(json)
  } catch {
    return JSON.parse(compressed)
  }
}

export const broadcastWorldState = (worldState) => {
  broadcastToPeers({
    type: 'world:sync',
    payload: { worldState }
  })
}

export const broadcastAvatarUpdate = (avatarData) => {
  broadcastToPeers({
    type: 'avatar:update',
    payload: { avatarData }
  })
}

export const broadcastChatMessage = (message) => {
  broadcastToPeers({
    type: 'chat:message',
    payload: message
  })
}
