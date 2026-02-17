import { create } from 'zustand'
import { getMainServers, getStoredServer, storeServer } from '../services/serverConfig'

export const useAppStore = create((set, get) => ({
  user: null,
  servers: [],
  channels: [],
  currentChannel: null,
  messages: [],
  friends: [],
  dms: [],
  activeNetwork: 'main',
  selfHostedServers: [],
  mainServers: getMainServers(),
  currentMainServer: getStoredServer(),
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
  setCurrentChannel: (channel) => set({ currentChannel: channel }),
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
  removeChannel: (channelId) => set((state) => ({ 
    channels: state.channels.filter(c => c.id !== channelId) 
  })),
  
  addFriend: (friend) => set((state) => ({ friends: [...state.friends, friend] })),
  removeFriend: (friendId) => set((state) => ({ 
    friends: state.friends.filter(f => f.id !== friendId) 
  })),
}))
