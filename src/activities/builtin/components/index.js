import OurVidsActivity from './OurVidsActivity'
import ReadyCheckActivity from './ReadyCheckActivity'
import SoundboardCuesActivity from './SoundboardCuesActivity'
import SequencerActivity from './SequencerActivity'
import BytebeatActivity from './BytebeatActivity'
import SketchDuelActivity from './SketchDuelActivity'
import PixelArtActivity from './PixelArtActivity'
import PokerNightActivity from './PokerNightActivity'
import ChessArenaActivity from './ChessArenaActivity'
import TicTacToeActivity from './TicTacToeActivity'
import ConnectFourActivity from './ConnectFourActivity'
import MiniGolfActivity from './MiniGolfActivity'
import CollaborativeDrawingActivity from './CollaborativeDrawingActivity'
import DAWSequencerActivity from './DAWSequencerActivity'
import ColabCreateDAW from './ColabCreateDAW'
import VoltVerseActivity from './voltverse/VoltVerseActivity'
import VoltVerseCreator from './voltverse-creator/VoltVerseCreator'
import VoltCraftActivity from './VoltCraftActivity'

export const BuiltinActivityComponentMap = {
  'builtin:our-vids': OurVidsActivity,
  'builtin:ready-check': ReadyCheckActivity,
  'builtin:soundboard-cues': SoundboardCuesActivity,
  'builtin:sequencer': SequencerActivity,
  'builtin:bytebeat': BytebeatActivity,
  'builtin:sketch-duel': SketchDuelActivity,
  'builtin:pixel-art': PixelArtActivity,
  'builtin:poker-night': PokerNightActivity,
  'builtin:chess-arena': ChessArenaActivity,
  'builtin:tic-tac-toe': TicTacToeActivity,
  'builtin:connect-four': ConnectFourActivity,
  'builtin:minigolf': MiniGolfActivity,
  'builtin:collaborative-drawing': CollaborativeDrawingActivity,
  'builtin:colabcreate': ColabCreateDAW,
  'builtin:daw-sequencer': DAWSequencerActivity,
  'builtin:voltverse': VoltVerseActivity,
  'builtin:voltverse-creator': VoltVerseCreator,
  'builtin:voltcraft': VoltCraftActivity
}

const BuiltinActivityAliases = {
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
  'collaborative-drawing': 'builtin:collaborative-drawing',
  'daw-sequencer': 'builtin:colabcreate',
  'daw-studio': 'builtin:colabcreate',
  'colabcreate': 'builtin:colabcreate',
  'voltverse': 'builtin:voltverse',
  'volt-verse': 'builtin:voltverse',
  'voltverse3d': 'builtin:voltverse',
  'voltverse-creator': 'builtin:voltverse-creator',
  'vv-creator': 'builtin:voltverse-creator',
  'voltcraft': 'builtin:voltcraft',
  'volt-craft': 'builtin:voltcraft'
}

export const normalizeBuiltinActivityId = (activityId) => {
  if (typeof activityId !== 'string') return null
  const normalized = activityId.trim()
  if (!normalized) return null
  if (BuiltinActivityComponentMap[normalized]) return normalized
  return BuiltinActivityAliases[normalized] || null
}

export const resolveBuiltinActivityComponent = (activityId) => {
  const normalized = normalizeBuiltinActivityId(activityId)
  if (!normalized) return null
  return BuiltinActivityComponentMap[normalized] || null
}
