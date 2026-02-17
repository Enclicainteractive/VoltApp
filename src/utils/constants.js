export const MESSAGE_MAX_LENGTH = 2000
export const SERVER_NAME_MAX_LENGTH = 100
export const CHANNEL_NAME_MAX_LENGTH = 100

export const WEBSOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_TYPING: 'message:typing',
  USER_TYPING: 'user:typing',
  USER_STATUS: 'user:status',
  SERVER_JOIN: 'server:join',
  CHANNEL_JOIN: 'channel:join',
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_SIGNAL: 'voice:signal',
  VOICE_USER_JOINED: 'voice:user-joined',
  VOICE_USER_LEFT: 'voice:user-left'
}

export const USER_STATUS = {
  ONLINE: 'online',
  IDLE: 'idle',
  DND: 'dnd',
  OFFLINE: 'offline'
}

export const CHANNEL_TYPES = {
  TEXT: 'text',
  VOICE: 'voice',
  VIDEO: 'video'
}
