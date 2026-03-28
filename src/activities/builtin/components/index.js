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
import EightBallPoolActivity from './EightBallPoolActivity'
import ArcadePartyActivity from './ArcadePartyActivity'
import CollaborativeDrawingActivity from './CollaborativeDrawingActivity'
import CollaborativeDrawing3DActivity from './CollaborativeDrawing3DActivity'
import DAWSequencerActivity from './DAWSequencerActivity'
import ColabCreateDAW from './ColabCreateDAW'
import VoltVerseActivity from './voltverse/VoltVerseActivity'
import VoltVerseCreator from './voltverse-creator/VoltVerseCreator'
import VoltCraftActivity from './VoltCraftActivity'
import Collab3DModelingActivity from './Collab3DModelingActivity'
import SkyRaidActivity from './SkyRaidActivity'
import TempleVoltActivity from './TempleVoltActivity'
import RetroRiftActivity from './RetroRiftActivity'
import Defcon3Activity from './Defcon3Activity'
import TimeDilationChessActivity from './TimeDilationChessActivity'
import AnarchyChessActivity from './AnarchyChessActivity'

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
  'builtin:8ball-pool': EightBallPoolActivity,
  'builtin:checkers': ArcadePartyActivity,
  'builtin:reversi': ArcadePartyActivity,
  'builtin:gomoku': ArcadePartyActivity,
  'builtin:dots-and-boxes': ArcadePartyActivity,
  'builtin:memory-match': ArcadePartyActivity,
  'builtin:minesweeper-party': ArcadePartyActivity,
  'builtin:party-2048': ArcadePartyActivity,
  'builtin:mancala': ArcadePartyActivity,
  'builtin:skyline-checkers-3d': ArcadePartyActivity,
  'builtin:lava-checkers-3d': ArcadePartyActivity,
  'builtin:glacier-checkers-3d': ArcadePartyActivity,
  'builtin:orbit-reversi-3d': ArcadePartyActivity,
  'builtin:prism-reversi-3d': ArcadePartyActivity,
  'builtin:reef-reversi-3d': ArcadePartyActivity,
  'builtin:zen-gomoku-3d': ArcadePartyActivity,
  'builtin:neon-gomoku-3d': ArcadePartyActivity,
  'builtin:asteroid-gomoku-3d': ArcadePartyActivity,
  'builtin:neon-dots-3d': ArcadePartyActivity,
  'builtin:blueprint-boxes-3d': ArcadePartyActivity,
  'builtin:laser-lattice-3d': ArcadePartyActivity,
  'builtin:memory-vault-3d': ArcadePartyActivity,
  'builtin:crystal-pairs-3d': ArcadePartyActivity,
  'builtin:holo-match-3d': ArcadePartyActivity,
  'builtin:void-sweeper-3d': ArcadePartyActivity,
  'builtin:reef-sweeper-3d': ArcadePartyActivity,
  'builtin:ruins-sweeper-3d': ArcadePartyActivity,
  'builtin:reactor-2048-3d': ArcadePartyActivity,
  'builtin:monolith-2048-3d': ArcadePartyActivity,
  'builtin:prism-2048-3d': ArcadePartyActivity,
  'builtin:temple-mancala-3d': ArcadePartyActivity,
  'builtin:nebula-mancala-3d': ArcadePartyActivity,
  'builtin:relic-mancala-3d': ArcadePartyActivity,
  'builtin:canyon-derby-3d': ArcadePartyActivity,
  'builtin:neon-derby-3d': ArcadePartyActivity,
  'builtin:storm-runner-3d': ArcadePartyActivity,
  'builtin:skyline-stack-3d': ArcadePartyActivity,
  'builtin:crystal-stack-3d': ArcadePartyActivity,
  'builtin:magma-stack-3d': ArcadePartyActivity,
  'builtin:sky-derby-3d': SkyRaidActivity,
  'builtin:tower-stack-3d': ArcadePartyActivity,
  'builtin:collaborative-drawing': CollaborativeDrawingActivity,
  'builtin:collaborative-drawing-3d': CollaborativeDrawing3DActivity,
  'builtin:colabcreate': ColabCreateDAW,
  'builtin:daw-sequencer': DAWSequencerActivity,
  'builtin:voltverse': VoltVerseActivity,
  'builtin:voltverse-creator': VoltVerseCreator,
  'builtin:voltcraft': VoltCraftActivity,
  'builtin:collab-3d-modeling': Collab3DModelingActivity,
  'builtin:sky-raid': SkyRaidActivity,
  'builtin:templevolt': TempleVoltActivity,
  'builtin:retro-rift-93': RetroRiftActivity,
  'builtin:defcon-3': Defcon3Activity,
  'builtin:timedilationchess': TimeDilationChessActivity,
  'builtin:anarchy-chess': AnarchyChessActivity
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
  '8ball-pool': 'builtin:8ball-pool',
  '8-ball-pool': 'builtin:8ball-pool',
  'eightball-pool': 'builtin:8ball-pool',
  'eight-ball-pool': 'builtin:8ball-pool',
  'checkers': 'builtin:checkers',
  'reversi': 'builtin:reversi',
  'gomoku': 'builtin:gomoku',
  'dots-and-boxes': 'builtin:dots-and-boxes',
  'dots-boxes': 'builtin:dots-and-boxes',
  'memory-match': 'builtin:memory-match',
  'minesweeper-party': 'builtin:minesweeper-party',
  'party-2048': 'builtin:party-2048',
  'mancala': 'builtin:mancala',
  'skyline-checkers-3d': 'builtin:skyline-checkers-3d',
  'lava-checkers-3d': 'builtin:lava-checkers-3d',
  'glacier-checkers-3d': 'builtin:glacier-checkers-3d',
  'orbit-reversi-3d': 'builtin:orbit-reversi-3d',
  'prism-reversi-3d': 'builtin:prism-reversi-3d',
  'reef-reversi-3d': 'builtin:reef-reversi-3d',
  'zen-gomoku-3d': 'builtin:zen-gomoku-3d',
  'neon-gomoku-3d': 'builtin:neon-gomoku-3d',
  'asteroid-gomoku-3d': 'builtin:asteroid-gomoku-3d',
  'neon-dots-3d': 'builtin:neon-dots-3d',
  'blueprint-boxes-3d': 'builtin:blueprint-boxes-3d',
  'laser-lattice-3d': 'builtin:laser-lattice-3d',
  'memory-vault-3d': 'builtin:memory-vault-3d',
  'crystal-pairs-3d': 'builtin:crystal-pairs-3d',
  'holo-match-3d': 'builtin:holo-match-3d',
  'void-sweeper-3d': 'builtin:void-sweeper-3d',
  'reef-sweeper-3d': 'builtin:reef-sweeper-3d',
  'ruins-sweeper-3d': 'builtin:ruins-sweeper-3d',
  'reactor-2048-3d': 'builtin:reactor-2048-3d',
  'monolith-2048-3d': 'builtin:monolith-2048-3d',
  'prism-2048-3d': 'builtin:prism-2048-3d',
  'temple-mancala-3d': 'builtin:temple-mancala-3d',
  'nebula-mancala-3d': 'builtin:nebula-mancala-3d',
  'relic-mancala-3d': 'builtin:relic-mancala-3d',
  'canyon-derby-3d': 'builtin:canyon-derby-3d',
  'neon-derby-3d': 'builtin:neon-derby-3d',
  'storm-runner-3d': 'builtin:storm-runner-3d',
  'skyline-stack-3d': 'builtin:skyline-stack-3d',
  'crystal-stack-3d': 'builtin:crystal-stack-3d',
  'magma-stack-3d': 'builtin:magma-stack-3d',
  'sky-derby-3d': 'builtin:sky-derby-3d',
  'sky-raid': 'builtin:sky-raid',
  'skyraid': 'builtin:sky-raid',
  'builtin:asteroid-run-3d': 'builtin:sky-derby-3d',
  'builtin:canyon-wing': 'builtin:sky-derby-3d',
  'builtin:cloud-circuit': 'builtin:sky-derby-3d',
  'builtin:volcano-rush': 'builtin:sky-derby-3d',
  'builtin:storm-chasers-3d': 'builtin:sky-derby-3d',
  'builtin:orbital-strike': 'builtin:sky-raid',
  'builtin:glacier-gunners': 'builtin:sky-raid',
  'builtin:island-patrol': 'builtin:sky-raid',
  'builtin:desert-ace': 'builtin:sky-raid',
  'builtin:neon-drone-arena': 'builtin:sky-raid',
  'asteroid-run-3d': 'builtin:sky-derby-3d',
  'canyon-wing': 'builtin:sky-derby-3d',
  'cloud-circuit': 'builtin:sky-derby-3d',
  'volcano-rush': 'builtin:sky-derby-3d',
  'storm-chasers-3d': 'builtin:sky-derby-3d',
  'orbital-strike': 'builtin:sky-raid',
  'glacier-gunners': 'builtin:sky-raid',
  'island-patrol': 'builtin:sky-raid',
  'desert-ace': 'builtin:sky-raid',
  'neon-drone-arena': 'builtin:sky-raid',
  'tower-stack-3d': 'builtin:tower-stack-3d',
  'collaborative-drawing': 'builtin:collaborative-drawing',
  'drawing-3d': 'builtin:collaborative-drawing-3d',
  'collaborative-drawing-3d': 'builtin:collaborative-drawing-3d',
  'world-sketch-3d': 'builtin:collaborative-drawing-3d',
  'daw-sequencer': 'builtin:colabcreate',
  'daw-studio': 'builtin:colabcreate',
  'colabcreate': 'builtin:colabcreate',
  'voltverse': 'builtin:voltverse',
  'volt-verse': 'builtin:voltverse',
  'voltverse3d': 'builtin:voltverse',
  'voltverse-creator': 'builtin:voltverse-creator',
  'vv-creator': 'builtin:voltverse-creator',
  'voltcraft': 'builtin:voltcraft',
  'volt-craft': 'builtin:voltcraft',
  'templevolt': 'builtin:templevolt',
  'templevolt-os': 'builtin:templevolt',
  'holy-shell': 'builtin:templevolt',
  'flight-sim': 'builtin:sky-raid',
  'flight-simulator': 'builtin:sky-raid',
  'builtin:retro-rift': 'builtin:retro-rift-93',
  'builtin:rift93': 'builtin:retro-rift-93',
  'retro-rift-93': 'builtin:retro-rift-93',
  'retro-rift': 'builtin:retro-rift-93',
  'rift93': 'builtin:retro-rift-93',
  'builtin:nullfire': 'builtin:defcon-3',
  'builtin:defcon3': 'builtin:defcon-3',
  'defcon-3': 'builtin:defcon-3',
  'defcon3': 'builtin:defcon-3',
  'nullfire': 'builtin:defcon-3',
  'collab-3d-modeling': 'builtin:collab-3d-modeling',
  '3d-modeling': 'builtin:collab-3d-modeling',
  'collab3d': 'builtin:collab-3d-modeling',
  'timedilationchess': 'builtin:timedilationchess',
  'time-dilation-chess': 'builtin:timedilationchess',
  '5d-chess': 'builtin:timedilationchess',
  '5dchess': 'builtin:timedilationchess',
  'builtin:5d-chess': 'builtin:timedilationchess',
  'builtin:5dchess': 'builtin:timedilationchess',
  'anarchy-chess': 'builtin:anarchy-chess',
  'anarchychess': 'builtin:anarchy-chess',
  'builtin:anarchychess': 'builtin:anarchy-chess',
  '4-player-chess': 'builtin:anarchy-chess',
  'realtime-chess': 'builtin:anarchy-chess'
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
