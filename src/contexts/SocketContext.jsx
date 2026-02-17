import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'

const SocketContext = createContext(null)

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [serverUpdates, setServerUpdates] = useState({})
  const { token, isAuthenticated } = useAuth()
  const serverUrlRef = useRef(null)

  const handleServerUpdate = useCallback((updatedServer) => {
    setServerUpdates(prev => ({ ...prev, [updatedServer.id]: updatedServer }))
  }, [])

  const handleChannelCreate = useCallback((channel) => {
    setServerUpdates(prev => {
      const server = prev[channel.serverId]
      if (server) {
        return {
          ...prev,
          [channel.serverId]: {
            ...server,
            channels: [...(server.channels || []), channel]
          }
        }
      }
      return prev
    })
  }, [])

  const handleChannelUpdate = useCallback((channel) => {
    setServerUpdates(prev => {
      const server = prev[channel.serverId]
      if (server) {
        return {
          ...prev,
          [channel.serverId]: {
            ...server,
            channels: server.channels?.map(c => c.id === channel.id ? channel : c) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleChannelDelete = useCallback(({ channelId, serverId }) => {
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            channels: server.channels?.filter(c => c.id !== channelId) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleChannelOrderUpdate = useCallback((channels) => {
    setServerUpdates(prev => {
      const firstChannel = channels[0]
      if (firstChannel?.serverId) {
        const server = prev[firstChannel.serverId]
        if (server) {
          return {
            ...prev,
            [firstChannel.serverId]: {
              ...server,
              channels
            }
          }
        }
      }
      return prev
    })
  }, [])

  const handleRoleCreate = useCallback((role) => {
    setServerUpdates(prev => {
      const server = prev[role.serverId]
      if (server) {
        return {
          ...prev,
          [role.serverId]: {
            ...server,
            roles: [...(server.roles || []), role]
          }
        }
      }
      return prev
    })
  }, [])

  const handleRoleUpdate = useCallback((role) => {
    setServerUpdates(prev => {
      const server = prev[role.serverId]
      if (server) {
        return {
          ...prev,
          [role.serverId]: {
            ...server,
            roles: server.roles?.map(r => r.id === role.id ? role : r) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleRoleDelete = useCallback(({ roleId, serverId }) => {
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            roles: server.roles?.filter(r => r.id !== roleId) || []
          }
        }
      }
      return prev
    })
  }, [])

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random()
    const newNotification = { ...notification, id, timestamp: new Date() }
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)) // Keep last 50
    
    // Play mention sound
    if (notification.type === 'mention') {
      soundService.mention()
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socket) {
        socket.disconnect()
        setSocket(null)
        setConnected(false)
      }
      return
    }

    const server = getStoredServer()
    const socketUrl = server?.socketUrl || 'https://voltchatapp.enclicainteractive.com'
    
    if (serverUrlRef.current === socketUrl && socket?.connected) {
      return
    }
    serverUrlRef.current = socketUrl
    
    if (socket) {
      socket.disconnect()
    }
    
    console.log('[Socket] Connecting to:', socketUrl)
    
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    })

    newSocket.on('connect', () => {
      console.log('[Socket] Connected, id:', newSocket.id)
      setConnected(true)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected, reason:', reason)
      setConnected(false)
    })

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts')
      setConnected(true)
    })

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] Reconnection attempt', attemptNumber)
    })

    newSocket.on('reconnect_error', (error) => {
      console.error('[Socket] Reconnection error:', error)
    })

    newSocket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts')
    })

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message)
      setConnected(false)
    })

    newSocket.on('connected', (data) => {
      console.log('[Socket] Server acknowledged connection:', data)
    })

    newSocket.on('notification:mention', (data) => {
      console.log('[Socket] Mention notification:', data)
      addNotification({
        type: 'mention',
        title: data.type === 'everyone' ? '@everyone mentioned you' : 
               data.type === 'here' ? '@here notification' : `${data.senderName} mentioned you`,
        message: data.content,
        channelId: data.channelId,
        messageId: data.messageId,
        senderName: data.senderName
      })
    })

    newSocket.on('server:updated', handleServerUpdate)
    newSocket.on('channel:created', handleChannelCreate)
    newSocket.on('channel:updated', handleChannelUpdate)
    newSocket.on('channel:deleted', handleChannelDelete)
    newSocket.on('channel:order-updated', handleChannelOrderUpdate)
    newSocket.on('role:created', handleRoleCreate)
    newSocket.on('role:updated', handleRoleUpdate)
    newSocket.on('role:deleted', handleRoleDelete)

    setSocket(newSocket)

    return () => {
      console.log('[Socket] Cleaning up socket connection')
      newSocket.disconnect()
    }
  }, [isAuthenticated, token, addNotification, handleServerUpdate, handleChannelCreate, handleChannelUpdate, handleChannelDelete, handleChannelOrderUpdate, handleRoleCreate, handleRoleUpdate, handleRoleDelete])

  const value = {
    socket,
    connected,
    notifications,
    removeNotification,
    serverUpdates,
    clearServerUpdate: (serverId) => setServerUpdates(prev => {
      const newUpdates = { ...prev }
      delete newUpdates[serverId]
      return newUpdates
    })
  }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}
