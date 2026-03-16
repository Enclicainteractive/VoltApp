import { create } from 'zustand'
import { getMainServers, getStoredServer, storeServer } from '../services/serverConfig'

export const useAppStore = create((set, get) => ({
  user: null,
  servers: [],
  channels: [],
  categories: [],
  currentChannel: null,
  selfPresence: {
    status: 'online',
    customStatus: ''
  },
  messages: [],
  friends: [],
  dms: [],
  activeNetwork: 'main',
  selfHostedServers: [],
  mainServers: getMainServers(),
  currentMainServer: getStoredServer(),
  globalEmojis: [],
  // Activity state - tracks active activity sessions
  activeActivities: [], // Array of { id, sessionId, activityId, activityName, contextType, contextId }
  focusedActivityId: null, // The currently focused/interacted activity
  settings: {
    theme: 'dark',
    notifications: true,
    sounds: true,
    messageNotifications: true,
    friendRequests: true,
    muteAll: false,
    volume: 100
  },
  
  setUser: (user) => set({ user }),
  setServers: (servers) => set({ servers }),
  setChannels: (channels) => set({ channels }),
  setCategories: (categories) => set({ categories }),
  setCurrentChannel: (channel) => set({ currentChannel: channel }),
  setSelfPresence: (presence) => set((state) => ({
    selfPresence: {
      ...state.selfPresence,
      ...(presence || {})
    }
  })),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setFriends: (friends) => set({ friends }),
  setDms: (dms) => set({ dms }),
  setActiveNetwork: (network) => set({ activeNetwork: network }),
  setSelfHostedServers: (servers) => set({ selfHostedServers: servers }),
  setMainServers: (servers) => set({ mainServers: servers }),
  setCurrentMainServer: (server) => {
    storeServer(server)
    set({ currentMainServer: server })
  },
  updateSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
  
  addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),
  removeServer: (serverId) => set((state) => ({ 
    servers: state.servers.filter(s => s.id !== serverId) 
  })),
  
  addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),
  updateChannel: (channelId, updates) => set((state) => ({
    channels: state.channels.map(c => c.id === channelId ? { ...c, ...updates } : c)
  })),
  removeChannel: (channelId) => set((state) => ({ 
    channels: state.channels.filter(c => c.id !== channelId) 
  })),
  
  addCategory: (category) => set((state) => ({ categories: [...state.categories, category] })),
  updateCategory: (categoryId, updates) => set((state) => ({
    categories: state.categories.map(c => c.id === categoryId ? { ...c, ...updates } : c)
  })),
  removeCategory: (categoryId) => set((state) => ({ 
    categories: state.categories.filter(c => c.id !== categoryId) 
  })),
  
  addFriend: (friend) => set((state) => ({ friends: [...state.friends, friend] })),
  removeFriend: (friendId) => set((state) => ({ 
    friends: state.friends.filter(f => f.id !== friendId) 
  })),
  
  setGlobalEmojis: (emojis) => set({ globalEmojis: emojis }),
  addGlobalEmoji: (emoji) => set((state) => ({ 
    globalEmojis: [...state.globalEmojis, emoji] 
  })),
  removeGlobalEmoji: (emojiId, serverId) => set((state) => ({ 
    globalEmojis: state.globalEmojis.filter(e => !(e.id === emojiId && e.serverId === serverId))
  })),
  
  // Activity management
  setActiveActivities: (activities) => set({ activeActivities: activities }),
  addActivity: (activity) => set((state) => {
    // Prevent duplicates - check if activity with same sessionId already exists
    const exists = state.activeActivities.find(a => a.sessionId === activity.sessionId)
    if (exists) {
      return state // No change if already exists
    }
    return { 
      activeActivities: [...state.activeActivities, activity] 
    }
  }),
  removeActivity: (sessionId) => set((state) => ({ 
    activeActivities: state.activeActivities.filter(a => a.sessionId !== sessionId),
    // Clear focus if the focused activity was removed
    focusedActivityId: state.focusedActivityId === sessionId ? null : state.focusedActivityId
  })),
  setFocusedActivity: (sessionId) => set({ focusedActivityId: sessionId }),
  clearFocusedActivity: () => set({ focusedActivityId: null }),
}))

// Export clearFocusedActivity as a named export for convenience
export const clearFocusedActivity = () => useAppStore.getState().clearFocusedActivity()
