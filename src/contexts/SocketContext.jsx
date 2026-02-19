import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import { apiService } from '../services/apiService'

const SocketContext = createContext(null)

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [serverUpdates, setServerUpdates] = useState({})
  const [systemUnreadCount, setSystemUnreadCount] = useState(0)
  const { token, isAuthenticated } = useAuth()
  const serverUrlRef = useRef(null)

  // Fetch initial system unread count on auth
  useEffect(() => {
    if (!isAuthenticated) { setSystemUnreadCount(0); return }
    apiService.getSystemUnreadCount()
      .then(res => setSystemUnreadCount(res.data?.count || 0))
      .catch(() => {})
  }, [isAuthenticated])

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

  const handleCategoryCreate = useCallback((category) => {
    setServerUpdates(prev => {
      const server = prev[category.serverId]
      if (server) {
        return {
          ...prev,
          [category.serverId]: {
            ...server,
            categories: [...(server.categories || []), category]
          }
        }
      }
      return prev
    })
  }, [])

  const handleCategoryUpdate = useCallback((category) => {
    setServerUpdates(prev => {
      const server = prev[category.serverId]
      if (server) {
        return {
          ...prev,
          [category.serverId]: {
            ...server,
            categories: server.categories?.map(c => c.id === category.id ? category : c) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleCategoryDelete = useCallback(({ categoryId, serverId }) => {
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            categories: server.categories?.filter(c => c.id !== categoryId) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleCategoryOrderUpdate = useCallback((categories) => {
    const firstCategory = categories[0]
    if (firstCategory?.serverId) {
      setServerUpdates(prev => {
        const server = prev[firstCategory.serverId]
        if (server) {
          return {
            ...prev,
            [firstCategory.serverId]: {
              ...server,
              categories
            }
          }
        }
        return prev
      })
    }
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
    const socketUrl = server?.socketUrl || 'https://volt.voltagechat.app'
    
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
               data.type === 'here'     ? '@here notification' :
               `${data.senderName} mentioned you`,
        message: data.content,
        channelId: data.channelId,
        messageId: data.messageId,
        senderName: data.senderName
      })
      // Distinct sound: personal mention vs broadcast
      if (data.type === 'user') {
        soundService.dmMention()
      } else {
        soundService.mention()
      }
    })

    newSocket.on('server:updated', handleServerUpdate)
    newSocket.on('channel:created', handleChannelCreate)
    newSocket.on('channel:updated', handleChannelUpdate)
    newSocket.on('channel:deleted', handleChannelDelete)
    newSocket.on('channel:order-updated', handleChannelOrderUpdate)
    newSocket.on('category:created', handleCategoryCreate)
    newSocket.on('category:updated', handleCategoryUpdate)
    newSocket.on('category:deleted', handleCategoryDelete)
    newSocket.on('category:order-updated', handleCategoryOrderUpdate)
    newSocket.on('role:created', handleRoleCreate)
    newSocket.on('role:updated', handleRoleUpdate)
    newSocket.on('role:deleted', handleRoleDelete)

    newSocket.on('bot:added', (data) => {
      console.log('[Socket] Bot added to server:', data)
    })

    newSocket.on('bot:removed', (data) => {
      console.log('[Socket] Bot removed from server:', data)
    })

    newSocket.on('e2e:epoch-advanced', (data) => {
      console.log('[Socket] E2EE epoch advanced:', data)
    })

    newSocket.on('e2e:member-added', (data) => {
      console.log('[Socket] E2EE member added:', data)
    })

    newSocket.on('e2e:member-removed', (data) => {
      console.log('[Socket] E2EE member removed:', data)
    })

    // System messages — delivered by the server scheduler or admin
    newSocket.on('system:message', (data) => {
      console.log('[Socket] System message received:', data?.title)
      setSystemUnreadCount(prev => prev + 1)
      // Also surface as a transient notification toast
      addNotification({
        type: 'system',
        category: data.category,
        title: data.title,
        message: data.body?.slice(0, 120),
        severity: data.severity || 'info',
        icon: data.icon,
        messageId: data.id
      })
      soundService.dmReceived?.()
    })

    setSocket(newSocket)

    return () => {
      console.log('[Socket] Cleaning up socket connection')
      newSocket.disconnect()
    }
  }, [isAuthenticated, token, addNotification, handleServerUpdate, handleChannelCreate, handleChannelUpdate, handleChannelDelete, handleChannelOrderUpdate, handleCategoryCreate, handleCategoryUpdate, handleCategoryDelete, handleCategoryOrderUpdate, handleRoleCreate, handleRoleUpdate, handleRoleDelete])

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
    }),
    systemUnreadCount,
    setSystemUnreadCount
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
