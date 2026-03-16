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

export const BOT_PERMISSIONS = {
  MESSAGES_READ: 'messages:read',
  MESSAGES_SEND: 'messages:send',
  MESSAGES_DELETE: 'messages:delete',
  CHANNELS_READ: 'channels:read',
  CHANNELS_MANAGE: 'channels:manage',
  MEMBERS_READ: 'members:read',
  MEMBERS_MANAGE: 'members:manage',
  REACTIONS_ADD: 'reactions:add',
  VOICE_CONNECT: 'voice:connect',
  SERVER_MANAGE: 'server:manage'
}

export const E2E_TRUE_EVENTS = {
  REGISTER_DEVICE: 'e2e-true:register-device',
  DEVICE_REGISTERED: 'e2e-true:device-registered',
  SENDER_KEY_AVAILABLE: 'e2e-true:sender-key-available',
  EPOCH_ADVANCED: 'e2e-true:epoch-advanced',
  QUEUED_UPDATES: 'e2e-true:queued-updates',
  FETCH_QUEUED: 'e2e-true:fetch-queued-updates',
  DISTRIBUTE_KEY: 'e2e-true:distribute-sender-key'
}

export const FEDERATION_STATUS = {
  PENDING: 'pending',
  CONNECTED: 'connected',
  REJECTED: 'rejected',
  ERROR: 'error'
}
