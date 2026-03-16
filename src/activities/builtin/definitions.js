export const CLIENT_BUILTIN_ACTIVITIES = [
  { id: 'builtin:our-vids', key: 'our-vids', iconKey: 'our-vids', name: 'OurVids', description: 'Synchronized video watching with queue and voting. YouTube and video file support.', category: 'Media', icon: 'video', participantCap: 64 },
  { id: 'builtin:ready-check', key: 'ready-check', iconKey: 'ready-check', name: 'Ready Check', description: 'Fast ready confirmations for groups.', category: 'Utility', icon: 'check', participantCap: 128 },
  { id: 'builtin:soundboard-cues', key: 'soundboard-cues', iconKey: 'soundboard-cues', name: 'Soundboard Cues', description: 'Trigger and share reactive sound cues.', category: 'Music', icon: 'audio', participantCap: 64 },
  { id: 'builtin:sequencer', key: 'sequencer', iconKey: 'sequencer', name: 'Sequencer', description: 'Simple 8-step beat sequencer.', category: 'Music', icon: 'grid', participantCap: 32 },
  { id: 'builtin:bytebeat', key: 'bytebeat', iconKey: 'bytebeat', name: 'Bytebeat', description: 'Algorithmic music composer using mathematical formulas. Write one-liner code to generate 8-bit chiptune audio in real-time. Supports bytebeat, signed, float, and funcbeat modes.', category: 'Music', icon: 'audio', participantCap: 32 },
  { id: 'builtin:colabcreate', key: 'colabcreate', iconKey: 'colabcreate', name: 'ColabCreate', description: 'Full collaborative DAW with advanced synth oscillators, piano roll, drum kits, synced sample streaming, track arrangement, mixer, MIDI support, and export to WAV/MIDI/JSON.', category: 'Music', icon: 'daw', participantCap: 16 },
  { id: 'builtin:sketch-duel', key: 'sketch-duel', iconKey: 'sketch-duel', name: 'Sketch Duel', description: 'Fast timed doodle battles with judging.', category: 'Creative', icon: 'sketch', participantCap: 8 },
  { id: 'builtin:collaborative-drawing', key: 'collaborative-drawing', iconKey: 'collaborative-drawing', name: 'Drawing Board', description: 'Real-time collaborative drawing canvas. See everyone\'s cursor, draw together, export to PNG or project files.', category: 'Creative', icon: 'draw', participantCap: 16 },
  { id: 'builtin:pixel-art', key: 'pixel-art', iconKey: 'pixel-art', name: 'Pixel Art Board', description: 'Shared pixel canvas with palette tools and history timeline.', category: 'Creative', icon: 'pixels', participantCap: 32 },
  { id: 'builtin:poker-night', key: 'poker-night', iconKey: 'poker-night', name: 'Poker Night', description: 'Texas Hold\'em poker with friends. Bet, raise, and bluff your way to victory!', category: 'Games', icon: 'poker', participantCap: 8, minPlayers: 2, gameType: 'turn-based' },
  { id: 'builtin:chess-arena', key: 'chess-arena', iconKey: 'chess-arena', name: 'Chess Arena', description: 'Multiplayer chess with spectators.', category: 'Games', icon: 'board', participantCap: 16, minPlayers: 2, gameType: 'turn-based' },
  { id: 'builtin:tic-tac-toe', key: 'tic-tac-toe', iconKey: 'tic-tac-toe', name: 'Tic Tac Toe', description: 'Classic multiplayer grid duel.', category: 'Games', icon: 'tic-tac-toe', participantCap: 8, minPlayers: 2, gameType: 'turn-based' },
  { id: 'builtin:connect-four', key: 'connect-four', iconKey: 'connect-four', name: 'Connect Four', description: 'Drop-disc strategy game.', category: 'Games', icon: 'connect-four', participantCap: 8, minPlayers: 2, gameType: 'turn-based' },
  { id: 'builtin:minigolf', key: 'minigolf', iconKey: 'minigolf', name: 'MiniGolf', description: 'Shared mini golf with stylized 3D courses and rotating turns.', category: 'Games', icon: 'board', participantCap: 8, minPlayers: 2, gameType: 'turn-based' },
  { id: 'builtin:voltcraft', key: 'voltcraft', iconKey: 'voltcraft', name: 'VoltCraft', description: 'Shared voxel sandbox with 16x16 chunks, mining, crafting, creative or survival play, and multiplayer block sync.', category: 'Games', icon: 'board', participantCap: 16, minPlayers: 1, gameType: 'sandbox' },
  { id: 'builtin:voltverse', key: 'voltverse', iconKey: 'voltverse', name: 'VoltVerse', description: 'Full 3D social VR platform with shared avatars, worlds, custom shaders, level editor, avatar editor, portals, triggers, teleportation, and real-time P2P networking. Supports VR and desktop.', category: 'Social', icon: 'vr', participantCap: 64 },
  { id: 'builtin:voltverse-creator', key: 'voltverse-creator', iconKey: 'voltverse-creator', name: 'VoltVerse Creator', description: 'Collaborative WYSIWYG world and avatar editor. Create custom 3D worlds with objects, imported models, lighting, portals, triggers, shaders, and shared editing. Design avatars with customizable body parts, colors, presets, and imported 3D models. Export as .voltworld or .voltavatar files.', category: 'Creative', icon: 'edit', participantCap: 8 }
].map((item, idx) => ({
  ...item,
  isBuiltinClient: true,
  isDefault: false,
  defaultRank: idx + 1,
  visibility: 'public',
  oauthRequired: false,
  scopes: ['activities:read', 'activities:join', 'activities:state:write', 'activities:events:write', 'activities:p2p'],
  p2pPolicy: { enabled: true, preferred: true, maxPeers: 32, fallbackToServerRelay: true },
  soundPack: { profile: 'cinematic', enabledByDefault: true, volume: 0.82, cues: ['session_created', 'session_joined', 'session_left', 'round_start', 'round_end', 'score_update', 'ready_check', 'error', 'game_start', 'game_end', 'player_join', 'player_leave', 'your_turn', 'countdown', 'timer_start', 'timer_end', 'victory', 'defeat', 'draw', 'turn_switch', 'move_valid', 'move_invalid', 'combo', 'streak', 'powerup', 'damage', 'heal', 'level_up', 'achievement_unlock', 'button_click', 'menu_open', 'menu_close', 'popup_open', 'popup_close', 'selection_change', 'spectator_join', 'spectator_leave', 'host_transfer', 'player_ready', 'player_not_ready', 'round_win', 'round_loss', 'sudden_death', 'overtime', 'intermission', 'pause', 'resume', 'coin_collect', 'xp_gain'] },
  launchUrl: `builtin://${item.key}`,
  originHost: 'client',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z'
}))

export const CLIENT_BUILTIN_BY_ID = Object.fromEntries(CLIENT_BUILTIN_ACTIVITIES.map(item => [item.id, item]))

const BUILTIN_DEFINITION_ALIASES = {
  'builtin:ourvids': 'builtin:our-vids',
  'builtin:drawing-board': 'builtin:collaborative-drawing',
  'builtin:daw': 'builtin:colabcreate',
  'builtin:colab-create': 'builtin:colabcreate',
  'builtin:byte-beat': 'builtin:bytebeat',
  'our-vids': 'builtin:our-vids',
  'ready-check': 'builtin:ready-check',
  'soundboard-cues': 'builtin:soundboard-cues',
  'sequencer': 'builtin:sequencer',
  'bytebeat': 'builtin:bytebeat',
  'byte-beat': 'builtin:bytebeat',
  'sketch-duel': 'builtin:sketch-duel',
  'pixel-art': 'builtin:pixel-art',
  'poker-night': 'builtin:poker-night',
  'chess-arena': 'builtin:chess-arena',
  'tic-tac-toe': 'builtin:tic-tac-toe',
  'connect-four': 'builtin:connect-four',
  'minigolf': 'builtin:minigolf',
  'voltcraft': 'builtin:voltcraft',
  'volt-craft': 'builtin:voltcraft',
  'collaborative-drawing': 'builtin:collaborative-drawing',
  'daw-sequencer': 'builtin:colabcreate',
  'daw-studio': 'builtin:colabcreate',
  'colabcreate': 'builtin:colabcreate',
  'voltverse': 'builtin:voltverse',
  'volt-verse': 'builtin:voltverse',
  'voltverse3d': 'builtin:voltverse',
  'voltverse-creator': 'builtin:voltverse-creator',
  'voltverse-creator': 'builtin:voltverse-creator',
  'vv-creator': 'builtin:voltverse-creator'
}

export const normalizeBuiltinDefinitionId = (activityId) => {
  if (typeof activityId !== 'string') return null
  const normalized = activityId.trim()
  if (!normalized) return null
  if (CLIENT_BUILTIN_BY_ID[normalized]) return normalized
  return BUILTIN_DEFINITION_ALIASES[normalized] || null
}

export const getBuiltinActivityDefinition = (activityId) => {
  const normalized = normalizeBuiltinDefinitionId(activityId)
  if (!normalized) return null
  return CLIENT_BUILTIN_BY_ID[normalized] || null
}

export const isBuiltinActivityId = (activityId) => !!getBuiltinActivityDefinition(activityId)
