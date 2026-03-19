import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ArcadeParty3DScene from './arcade/ArcadeParty3DScene'

const createModeMeta = (name, subtitle, seats, engine, theme = {}, kind = '3d') => ({ name, subtitle, seats, engine, theme, kind })

const MODE_META = {
  checkers: createModeMeta('Checkers', 'Classic diagonal captures, now staged on a physical 3D board.', 2, 'checkers', { glow: '#38bdf8', accent2: '#fb7185' }),
  reversi: createModeMeta('Reversi', 'Flip discs across a polished tactical table with animated ownership shifts.', 2, 'reversi', { glow: '#60a5fa', accent: '#f59e0b' }),
  gomoku: createModeMeta('Gomoku', 'Five in a row on a raised strategy board with orbital camera drift.', 2, 'gomoku', { glow: '#34d399', accent: '#a78bfa' }),
  'dots-and-boxes': createModeMeta('Dots & Boxes', 'Claim light-lattice boxes in a suspended 3D grid.', 2, 'dots-and-boxes', { glow: '#22d3ee', accent2: '#f472b6' }),
  'memory-match': createModeMeta('Memory Match', 'Flip floating cards in a neon memory vault.', 2, 'memory-match', { glow: '#38bdf8', accent: '#fbbf24' }),
  'minesweeper-party': createModeMeta('Minesweeper Party', 'Co-op clear a fully 3D hazard floor with shared flags and reveals.', 0, 'minesweeper-party', { glow: '#22c55e', accent: '#ef4444', accent2: '#38bdf8' }),
  'party-2048': createModeMeta('2048 Party', 'Merge energy blocks on a glowing tabletop reactor grid.', 0, 'party-2048', { glow: '#fbbf24', accent: '#f97316', accent2: '#fb7185' }),
  mancala: createModeMeta('Mancala', 'Sow stones across carved ceremonial pits with animated bowls.', 2, 'mancala', { glow: '#f59e0b', accent2: '#60a5fa' }),
  'sky-derby-3d': createModeMeta('Sky Derby 3D', 'Turn-based lane runner inside a proper 3D race chamber.', 2, 'sky-derby-3d', { glow: '#22d3ee', accent: '#f97316', accent2: '#fb7185' }),
  'tower-stack-3d': createModeMeta('Tower Stack 3D', 'Build a skyline of glowing blocks with adjacency bonuses.', 2, 'tower-stack-3d', { glow: '#38bdf8', accent2: '#c084fc' }),
  'skyline-checkers-3d': createModeMeta('Skyline Checkers 3D', 'Capture across a rooftop board with luminous crowned kings.', 2, 'checkers', { glow: '#38bdf8', accent2: '#f97316', floor: '#0b1220' }),
  'lava-checkers-3d': createModeMeta('Lava Checkers 3D', 'A magma-lit checkers duel over heat-soaked stone tiles.', 2, 'checkers', { glow: '#f97316', accent2: '#ef4444', floor: '#1a0f10' }),
  'glacier-checkers-3d': createModeMeta('Glacier Checkers 3D', 'Frozen captures on a cold crystalline board.', 2, 'checkers', { glow: '#7dd3fc', accent2: '#c4b5fd', floor: '#08131d' }),
  'orbit-reversi-3d': createModeMeta('Orbit Reversi 3D', 'Disc-flipping on a sleek orbital command table.', 2, 'reversi', { glow: '#60a5fa', accent: '#fbbf24', floor: '#09111f' }),
  'prism-reversi-3d': createModeMeta('Prism Reversi 3D', 'Reflections and reversals on a prismatic tactical board.', 2, 'reversi', { glow: '#a78bfa', accent: '#22d3ee', floor: '#0f1020' }),
  'reef-reversi-3d': createModeMeta('Reef Reversi 3D', 'Coral-lit control battles with bright disc flips.', 2, 'reversi', { glow: '#2dd4bf', accent: '#f97316', floor: '#08161d' }),
  'zen-gomoku-3d': createModeMeta('Zen Gomoku 3D', 'Place stones on a tranquil elevated strategy garden.', 2, 'gomoku', { glow: '#86efac', accent: '#60a5fa', floor: '#0a1714' }),
  'neon-gomoku-3d': createModeMeta('Neon Gomoku 3D', 'Five-in-a-row under reactive cyber lighting.', 2, 'gomoku', { glow: '#22d3ee', accent: '#f472b6', floor: '#08111c' }),
  'asteroid-gomoku-3d': createModeMeta('Asteroid Gomoku 3D', 'Command a dense orbital stone grid in low gravity.', 2, 'gomoku', { glow: '#fbbf24', accent: '#38bdf8', floor: '#0b1019' }),
  'neon-dots-3d': createModeMeta('Neon Dots 3D', 'Claim volumetric boxes in a neon suspended lattice.', 2, 'dots-and-boxes', { glow: '#22d3ee', accent2: '#fb7185', floor: '#071018' }),
  'blueprint-boxes-3d': createModeMeta('Blueprint Boxes 3D', 'Architectural line battles on a blueprint light grid.', 2, 'dots-and-boxes', { glow: '#60a5fa', accent2: '#38bdf8', floor: '#081421' }),
  'laser-lattice-3d': createModeMeta('Laser Lattice 3D', 'Draw and claim laser-framed volumes before your rival does.', 2, 'dots-and-boxes', { glow: '#a78bfa', accent2: '#f97316', floor: '#0d0e1a' }),
  'memory-vault-3d': createModeMeta('Memory Vault 3D', 'Artifact cards flip above a secure vault stage.', 2, 'memory-match', { glow: '#38bdf8', accent: '#fbbf24', floor: '#09131f' }),
  'crystal-pairs-3d': createModeMeta('Crystal Pairs 3D', 'A crystalline memory duel with bright refractive flips.', 2, 'memory-match', { glow: '#67e8f9', accent: '#c084fc', floor: '#091522' }),
  'holo-match-3d': createModeMeta('Holo Match 3D', 'Floating hologram cards and combo-driven pair racing.', 2, 'memory-match', { glow: '#22d3ee', accent: '#f472b6', floor: '#08111c' }),
  'void-sweeper-3d': createModeMeta('Void Sweeper 3D', 'Co-op clear a floating hazard field in deep space.', 0, 'minesweeper-party', { glow: '#a78bfa', accent: '#ef4444', accent2: '#60a5fa', floor: '#090916' }),
  'reef-sweeper-3d': createModeMeta('Reef Sweeper 3D', 'Shared trap-clearing across a submerged coral shelf.', 0, 'minesweeper-party', { glow: '#2dd4bf', accent: '#ef4444', accent2: '#38bdf8', floor: '#06151a' }),
  'ruins-sweeper-3d': createModeMeta('Ruins Sweeper 3D', 'Flag hidden traps on a collapsing temple floor.', 0, 'minesweeper-party', { glow: '#fbbf24', accent: '#ef4444', accent2: '#f97316', floor: '#18120b' }),
  'reactor-2048-3d': createModeMeta('Reactor 2048 3D', 'Merge energy cubes in a pulsing reactor chamber.', 0, 'party-2048', { glow: '#fbbf24', accent: '#f97316', accent2: '#fb7185', floor: '#15100a' }),
  'monolith-2048-3d': createModeMeta('Monolith 2048 3D', 'Stack monolithic numerals on a dark stone merge board.', 0, 'party-2048', { glow: '#94a3b8', accent: '#c084fc', accent2: '#fbbf24', floor: '#0b1016' }),
  'prism-2048-3d': createModeMeta('Prism 2048 3D', 'A refractive merge table with colorful escalating blocks.', 0, 'party-2048', { glow: '#22d3ee', accent: '#c084fc', accent2: '#f59e0b', floor: '#09111f' }),
  'temple-mancala-3d': createModeMeta('Temple Mancala 3D', 'Stone sowing across carved ceremonial bowls.', 2, 'mancala', { glow: '#f59e0b', accent2: '#38bdf8', floor: '#161009' }),
  'nebula-mancala-3d': createModeMeta('Nebula Mancala 3D', 'Magnetic pits and orbital stone flow in a sci-fi shrine.', 2, 'mancala', { glow: '#a78bfa', accent2: '#22d3ee', floor: '#0a0b1a' }),
  'relic-mancala-3d': createModeMeta('Relic Mancala 3D', 'Ancient relic bowls with luminous bead scoring.', 2, 'mancala', { glow: '#fbbf24', accent2: '#fb7185', floor: '#140f0a' }),
  'canyon-derby-3d': createModeMeta('Canyon Derby 3D', 'Turn-based lane calls through a canyon flight tunnel.', 2, 'sky-derby-3d', { glow: '#38bdf8', accent: '#f97316', accent2: '#fbbf24', floor: '#120c0a' }),
  'neon-derby-3d': createModeMeta('Neon Derby 3D', 'A cyber-lit lane runner with reactive hazard bars.', 2, 'sky-derby-3d', { glow: '#22d3ee', accent: '#f472b6', accent2: '#f59e0b', floor: '#070d18' }),
  'storm-runner-3d': createModeMeta('Storm Runner 3D', 'Thread stormwall hazards across a violent sky corridor.', 2, 'sky-derby-3d', { glow: '#93c5fd', accent: '#f97316', accent2: '#c084fc', floor: '#08131b' }),
  'skyline-stack-3d': createModeMeta('Skyline Stack 3D', 'Build upward from a clean neon skyline foundation.', 2, 'tower-stack-3d', { glow: '#38bdf8', accent2: '#fbbf24', floor: '#08111c' }),
  'crystal-stack-3d': createModeMeta('Crystal Stack 3D', 'Raise shimmering crystalline pillars for area control.', 2, 'tower-stack-3d', { glow: '#67e8f9', accent2: '#c084fc', floor: '#0a1422' }),
  'magma-stack-3d': createModeMeta('Magma Stack 3D', 'Competitive stacking above a volcanic forge platform.', 2, 'tower-stack-3d', { glow: '#f97316', accent2: '#ef4444', floor: '#140d0c' }),
}

const UI_PRESETS = {
  checkers: {
    skin: 'royal',
    kicker: 'Royal Board Duel',
    panel: 'rgba(18, 21, 34, 0.88)',
    bg0: '#0f1022',
    bg1: '#1d1632',
    text: '#f7f1ff',
    muted: '#b9abcf',
    line: 'rgba(192, 132, 252, 0.18)',
    lineStrong: 'rgba(251, 191, 36, 0.3)',
    hero: 'Velvet tactics, crowned pieces, and old-school duel energy.',
  },
  reversi: {
    skin: 'orbit',
    kicker: 'Orbital Command Table',
    panel: 'rgba(10, 22, 34, 0.9)',
    bg0: '#06131f',
    bg1: '#10283c',
    text: '#ecfeff',
    muted: '#9bc5d2',
    line: 'rgba(34, 211, 238, 0.16)',
    lineStrong: 'rgba(96, 165, 250, 0.28)',
    hero: 'Clean tactical telemetry with hard flips and cold light.',
  },
  gomoku: {
    skin: 'zen',
    kicker: 'Stone Garden Clash',
    panel: 'rgba(11, 23, 18, 0.9)',
    bg0: '#09140f',
    bg1: '#16291f',
    text: '#effdf5',
    muted: '#a9c8b5',
    line: 'rgba(110, 231, 183, 0.18)',
    lineStrong: 'rgba(167, 139, 250, 0.24)',
    hero: 'Quiet board, sharp reads, no wasted placements.',
  },
  'dots-and-boxes': {
    skin: 'blueprint',
    kicker: 'Blueprint Grid Race',
    panel: 'rgba(7, 18, 30, 0.92)',
    bg0: '#06111d',
    bg1: '#0b2238',
    text: '#eff6ff',
    muted: '#9eb4cb',
    line: 'rgba(96, 165, 250, 0.18)',
    lineStrong: 'rgba(34, 211, 238, 0.28)',
    hero: 'Architect the board before the other player closes the room.',
  },
  'memory-match': {
    skin: 'vault',
    kicker: 'Artifact Vault',
    panel: 'rgba(28, 17, 10, 0.9)',
    bg0: '#130d08',
    bg1: '#2f1b10',
    text: '#fff7ed',
    muted: '#d3b797',
    line: 'rgba(251, 191, 36, 0.18)',
    lineStrong: 'rgba(249, 115, 22, 0.3)',
    hero: 'Golden cache, hidden pairs, fast recall under pressure.',
  },
  'minesweeper-party': {
    skin: 'hazmat',
    kicker: 'Hazmat Sweep',
    panel: 'rgba(17, 24, 20, 0.92)',
    bg0: '#09100c',
    bg1: '#1c2c1b',
    text: '#f0fdf4',
    muted: '#b1c8b5',
    line: 'rgba(34, 197, 94, 0.18)',
    lineStrong: 'rgba(239, 68, 68, 0.34)',
    hero: 'Shared minefield, shared panic, zero room for sloppy flags.',
  },
  'party-2048': {
    skin: 'reactor',
    kicker: 'Reactor Merge Board',
    panel: 'rgba(27, 18, 8, 0.92)',
    bg0: '#120d06',
    bg1: '#2c1808',
    text: '#fffbeb',
    muted: '#d8c59d',
    line: 'rgba(251, 191, 36, 0.18)',
    lineStrong: 'rgba(249, 115, 22, 0.34)',
    hero: 'Hot tiles, greedy merges, and bright catastrophic math.',
  },
  mancala: {
    skin: 'temple',
    kicker: 'Ceremonial Bowl Table',
    panel: 'rgba(24, 18, 10, 0.92)',
    bg0: '#110c07',
    bg1: '#24170d',
    text: '#fef3c7',
    muted: '#cfbc95',
    line: 'rgba(245, 158, 11, 0.18)',
    lineStrong: 'rgba(56, 189, 248, 0.3)',
    hero: 'Ancient rhythm, chain turns, and brutal seed economy.',
  },
  'sky-derby-3d': {
    skin: 'velocity',
    kicker: 'Velocity Tunnel',
    panel: 'rgba(8, 18, 34, 0.9)',
    bg0: '#07111c',
    bg1: '#11243d',
    text: '#f0f9ff',
    muted: '#a8bfd7',
    line: 'rgba(56, 189, 248, 0.18)',
    lineStrong: 'rgba(249, 115, 22, 0.34)',
    hero: 'Pick the lane, read the hazard rhythm, don’t blink.',
  },
  'tower-stack-3d': {
    skin: 'forge',
    kicker: 'Skyline Foundry',
    panel: 'rgba(19, 16, 24, 0.9)',
    bg0: '#0d0b12',
    bg1: '#1a1524',
    text: '#f5f3ff',
    muted: '#b7acc9',
    line: 'rgba(192, 132, 252, 0.18)',
    lineStrong: 'rgba(34, 211, 238, 0.28)',
    hero: 'Build tall, build connected, and own the final silhouette.',
  },
}

const getUiPreset = (engine, meta) => ({
  ...(UI_PRESETS[engine] || UI_PRESETS.checkers),
  glow: meta.theme?.glow || '#38bdf8',
  accent: meta.theme?.accent || '#f97316',
  accent2: meta.theme?.accent2 || '#fb7185',
})

const CSS = `
.arcade-party {
  --bg0: #071018;
  --bg1: #0d1c28;
  --panel: rgba(9, 18, 29, 0.9);
  --line: rgba(148, 163, 184, 0.15);
  --line-strong: rgba(148, 163, 184, 0.28);
  --text: #e5eef8;
  --muted: #8ca1b4;
  --cyan: #22d3ee;
  --pink: #fb7185;
  --gold: #fbbf24;
  min-height: 100%;
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.14), transparent 34%),
    radial-gradient(circle at bottom right, rgba(251, 113, 133, 0.12), transparent 32%),
    linear-gradient(180deg, var(--bg0), var(--bg1));
  box-sizing: border-box;
  overflow: auto;
}
.arcade-party * { box-sizing: border-box; }
.arcade-side,
.arcade-main {
  border-radius: 26px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}
.arcade-side {
  padding: 18px;
  display: grid;
  gap: 14px;
  align-content: start;
}
.arcade-main {
  padding: 18px;
  display: grid;
  gap: 14px;
}
.arcade-side-header {
  display: grid;
  gap: 10px;
}
.arcade-kicker {
  color: var(--cyan);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 800;
}
.arcade-title {
  margin: 6px 0 0;
  font-size: 32px;
  line-height: 0.96;
  letter-spacing: -0.04em;
}
.arcade-subtitle {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.arcade-hero-strip {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--line-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--panel) 84%, var(--cyan) 16%), color-mix(in srgb, var(--panel) 88%, var(--pink) 12%));
}
.arcade-hero-strip strong,
.arcade-hero-strip span {
  display: block;
}
.arcade-hero-strip strong {
  font-size: 13px;
  letter-spacing: 0.04em;
}
.arcade-hero-strip span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.arcade-card {
  padding: 14px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid var(--line);
}
.arcade-status {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--line-strong);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(21, 38, 56, 0.74));
}
.arcade-status strong {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
}
.arcade-seat {
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.46);
  border: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.arcade-seat.active {
  border-color: rgba(34, 211, 238, 0.44);
  box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.18);
}
.arcade-seat-id {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  color: white;
  font-weight: 800;
  background: linear-gradient(135deg, #0891b2, #22d3ee);
}
.arcade-seat:nth-child(2n) .arcade-seat-id {
  background: linear-gradient(135deg, #be123c, #fb7185);
}
.arcade-seat strong,
.arcade-seat span {
  display: block;
}
.arcade-seat span {
  color: var(--muted);
  font-size: 12px;
}
.arcade-btn {
  border: 1px solid transparent;
  border-radius: 13px;
  padding: 10px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  color: white;
  background: linear-gradient(135deg, #0891b2, #22d3ee);
}
.arcade-btn.secondary {
  background: rgba(15, 23, 42, 0.8);
  border-color: var(--line);
  color: #dbeafe;
}
.arcade-btn.pink {
  background: linear-gradient(135deg, #be123c, #fb7185);
}
.arcade-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.arcade-grid {
  display: grid;
  gap: 10px;
}
.arcade-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.arcade-stat {
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid var(--line);
}
.arcade-stat-label {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.arcade-stat-value {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 800;
}
.arcade-main-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.arcade-main-top strong,
.arcade-main-top span {
  display: block;
}
.arcade-main-top strong {
  font-size: 19px;
  letter-spacing: -0.03em;
}
.arcade-main-top span {
  margin-top: 5px;
  font-size: 12px;
  color: var(--muted);
}
.arcade-badge {
  padding: 10px 12px;
  min-width: 132px;
  border-radius: 16px;
  text-align: right;
  border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.46);
}
.arcade-badge strong,
.arcade-badge span {
  display: block;
}
.arcade-badge strong {
  font-size: 13px;
}
.arcade-badge span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}
.arcade-intel {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.85fr);
  gap: 14px;
}
.arcade-feature {
  padding: 16px;
  border-radius: 22px;
  border: 1px solid var(--line-strong);
  background:
    linear-gradient(135deg, rgba(255,255,255,0.06), transparent 62%),
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 90%, var(--cyan) 10%), color-mix(in srgb, var(--panel) 92%, black 8%));
}
.arcade-feature-label {
  color: var(--cyan);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}
.arcade-feature-title {
  margin-top: 8px;
  font-size: 24px;
  line-height: 0.98;
  letter-spacing: -0.04em;
}
.arcade-feature-copy {
  margin-top: 10px;
  max-width: 60ch;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
.arcade-feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.arcade-feature-tag {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.05);
  font-size: 11px;
  color: var(--text);
}
.arcade-intel-grid {
  display: grid;
  gap: 10px;
}
.arcade-intel-card {
  padding: 13px 14px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.42);
}
.arcade-intel-card strong,
.arcade-intel-card span {
  display: block;
}
.arcade-intel-card strong {
  font-size: 15px;
}
.arcade-intel-card span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}
.arcade-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.arcade-pill {
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.62);
  border: 1px solid var(--line);
  color: #dbeafe;
  font-size: 12px;
}
.arcade-board {
  min-height: 520px;
  border-radius: 26px;
  border: 1px solid var(--line);
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.04), transparent 28%),
    linear-gradient(180deg, rgba(7, 12, 20, 0.85), rgba(11, 20, 31, 0.96));
  padding: 16px;
}
.arcade-board.game-3d {
  background:
    radial-gradient(circle at 50% 12%, rgba(56, 189, 248, 0.16), transparent 24%),
    linear-gradient(180deg, #09131f, #0b1623 54%, #08111c);
}
.arcade-board > * {
  width: 100%;
  height: 100%;
}
.arcade-party.arcade-skin-royal .arcade-side,
.arcade-party.arcade-skin-royal .arcade-main {
  border-radius: 30px;
}
.arcade-party.arcade-skin-royal .arcade-title,
.arcade-party.arcade-skin-vault .arcade-title,
.arcade-party.arcade-skin-temple .arcade-title {
  font-family: Georgia, 'Times New Roman', serif;
}
.arcade-party.arcade-skin-orbit .arcade-side,
.arcade-party.arcade-skin-orbit .arcade-main,
.arcade-party.arcade-skin-velocity .arcade-side,
.arcade-party.arcade-skin-velocity .arcade-main {
  backdrop-filter: blur(16px);
}
.arcade-party.arcade-skin-orbit .arcade-card,
.arcade-party.arcade-skin-blueprint .arcade-card {
  border-style: dashed;
}
.arcade-party.arcade-skin-zen .arcade-side,
.arcade-party.arcade-skin-zen .arcade-main {
  border-radius: 22px;
}
.arcade-party.arcade-skin-zen .arcade-btn {
  border-radius: 999px;
}
.arcade-party.arcade-skin-vault .arcade-board,
.arcade-party.arcade-skin-temple .arcade-board {
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.08);
}
.arcade-party.arcade-skin-hazmat .arcade-status {
  background: linear-gradient(135deg, rgba(20, 35, 22, 0.94), rgba(35, 21, 21, 0.82));
}
.arcade-party.arcade-skin-reactor .arcade-status,
.arcade-party.arcade-skin-forge .arcade-status {
  background: linear-gradient(135deg, rgba(40, 25, 12, 0.94), rgba(30, 16, 28, 0.82));
}
.arcade-party.arcade-skin-blueprint .arcade-side,
.arcade-party.arcade-skin-blueprint .arcade-main {
  border-radius: 18px;
}
.arcade-party.arcade-skin-blueprint .arcade-board {
  border-style: dashed;
}
.arcade-three-stack {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
}
.arcade-three-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  padding-bottom: 4px;
}
.arcade-three-stack canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
  border-radius: 20px;
}
.arcade-spectators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.arcade-chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}
.arcade-log {
  display: grid;
  gap: 8px;
}
.arcade-log-entry {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.42);
  font-size: 12px;
  color: var(--muted);
}
.arcade-log-entry strong {
  color: #f8fafc;
}
.board-grid {
  display: grid;
  gap: 4px;
  justify-content: center;
}
.board-cell {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(12, 23, 36, 0.9);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
  position: relative;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.board-cell:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.18);
}
.board-cell.light {
  background: rgba(240, 249, 255, 0.12);
}
.piece {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  box-shadow: inset 0 2px 0 rgba(255,255,255,0.16), 0 10px 20px rgba(0,0,0,0.24);
}
.piece.red { background: linear-gradient(135deg, #fb7185, #be123c); }
.piece.blue { background: linear-gradient(135deg, #67e8f9, #0e7490); }
.piece.king::after {
  content: 'K';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: white;
  font-size: 11px;
  font-weight: 900;
}
.disc {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  box-shadow: inset 0 2px 0 rgba(255,255,255,0.12);
}
.disc.dark { background: linear-gradient(135deg, #38bdf8, #0f172a); }
.disc.light { background: linear-gradient(135deg, #fbbf24, #fde68a); }
.dot-grid {
  display: grid;
  grid-template-columns: repeat(6, 42px);
  grid-template-rows: repeat(6, 42px);
  justify-content: center;
  position: relative;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: white;
  margin: auto;
}
.edge {
  position: absolute;
  background: rgba(148, 163, 184, 0.32);
  cursor: pointer;
  border-radius: 999px;
}
.edge.active.cyan { background: #22d3ee; box-shadow: 0 0 18px rgba(34, 211, 238, 0.4); }
.edge.active.pink { background: #fb7185; box-shadow: 0 0 18px rgba(251, 113, 133, 0.4); }
.edge.h { width: 32px; height: 6px; }
.edge.v { width: 6px; height: 32px; }
.box-owner {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: white;
  font-size: 11px;
  font-weight: 800;
}
.box-owner.cyan { background: rgba(34, 211, 238, 0.38); }
.box-owner.pink { background: rgba(251, 113, 133, 0.38); }
.memory-card {
  width: 74px;
  height: 94px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(30, 41, 59, 0.92));
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 28px;
  color: white;
}
.memory-card.revealed {
  background: linear-gradient(180deg, rgba(34, 211, 238, 0.26), rgba(14, 116, 144, 0.26));
}
.memory-card.matched {
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.24), rgba(120, 53, 15, 0.26));
}
.mine-cell {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(15, 23, 42, 0.82);
  display: grid;
  place-items: center;
  color: white;
  font-weight: 800;
  cursor: pointer;
}
.mine-cell.revealed {
  background: rgba(148, 163, 184, 0.18);
}
.mine-cell.mine {
  background: rgba(190, 24, 93, 0.38);
}
.slider-board {
  display: grid;
  grid-template-columns: repeat(4, 84px);
  gap: 8px;
  justify-content: center;
}
.slider-cell {
  width: 84px;
  height: 84px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.76);
  display: grid;
  place-items: center;
  color: white;
  font-size: 22px;
  font-weight: 900;
}
.mancala {
  display: grid;
  grid-template-columns: 88px repeat(6, 60px) 88px;
  grid-template-rows: repeat(2, 60px);
  gap: 10px;
  justify-content: center;
  align-items: center;
}
.pit {
  width: 60px;
  height: 60px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(15, 23, 42, 0.86);
  display: grid;
  place-items: center;
  color: white;
  font-weight: 800;
  cursor: pointer;
}
.store {
  width: 88px;
  height: 130px;
  border-radius: 26px;
}
.road3d {
  width: min(720px, 100%);
  margin: 0 auto;
  padding: 26px 24px 38px;
  perspective: 960px;
}
.road3d-stage {
  position: relative;
  height: 420px;
  transform-style: preserve-3d;
  transform: rotateX(64deg);
  border-radius: 24px;
  background:
    linear-gradient(90deg, rgba(14, 165, 233, 0.12), transparent 16%, transparent 84%, rgba(14, 165, 233, 0.12)),
    linear-gradient(180deg, rgba(8, 47, 73, 0.32), rgba(8, 15, 30, 0.96));
  border: 1px solid rgba(125, 211, 252, 0.18);
  overflow: hidden;
}
.road-lane-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: rgba(255,255,255,0.16);
}
.road-row {
  position: absolute;
  left: 0;
  width: 100%;
}
.road-hazard {
  position: absolute;
  width: 24%;
  height: 40px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.88), rgba(190, 24, 93, 0.92));
  box-shadow: 0 0 24px rgba(251, 191, 36, 0.26);
}
.road-car {
  position: absolute;
  bottom: 14px;
  width: 24%;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: white;
  font-weight: 900;
  box-shadow: 0 0 28px rgba(34, 211, 238, 0.18);
}
.road-car.cyan { background: linear-gradient(135deg, #22d3ee, #0e7490); }
.road-car.pink { background: linear-gradient(135deg, #fb7185, #be123c); }
.iso-grid {
  width: min(720px, 100%);
  margin: 0 auto;
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 22px;
}
.stack-slot {
  position: relative;
  height: 170px;
  cursor: pointer;
}
.voxel {
  position: absolute;
  left: 50%;
  width: 72px;
  height: 46px;
  transform: translateX(-50%);
}
.voxel-top,
.voxel-left,
.voxel-right {
  position: absolute;
}
.voxel-top {
  inset: 0 12px auto;
  height: 22px;
  transform: skew(-30deg);
  border-radius: 10px;
}
.voxel-left {
  left: 0;
  top: 11px;
  width: 24px;
  height: 30px;
  transform: skewY(30deg);
  border-radius: 10px 0 0 10px;
}
.voxel-right {
  right: 0;
  top: 11px;
  width: 24px;
  height: 30px;
  transform: skewY(-30deg);
  border-radius: 0 10px 10px 0;
}
@media (max-width: 980px) {
  .arcade-party { grid-template-columns: 1fr; }
  .arcade-intel { grid-template-columns: 1fr; }
}
`

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const seededShuffle = (items, seed = 1) => {
  const list = [...items]
  let state = seed
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1))
    ;[list[index], list[swapIndex]] = [list[swapIndex], list[index]]
  }
  return list
}

const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return { id: String(player.id), username: String(player.username || 'Player') }
}

const emptyBoard = (size, fill = null) => Array.from({ length: size }, () => Array.from({ length: size }, () => fill))

const createCheckersPayload = () => {
  const board = emptyBoard(8, null)
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 8; x += 1) if ((x + y) % 2 === 1) board[y][x] = 'b'
  }
  for (let y = 5; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) if ((x + y) % 2 === 1) board[y][x] = 'r'
  }
  return { board }
}

const createReversiPayload = () => {
  const board = emptyBoard(8, null)
  board[3][3] = 'l'
  board[3][4] = 'd'
  board[4][3] = 'd'
  board[4][4] = 'l'
  return { board }
}

const createGomokuPayload = () => ({ board: emptyBoard(15, null) })

const createDotsPayload = () => ({
  hLines: Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => null)),
  vLines: Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => null)),
  owners: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null)),
  scores: {},
})

const createMemoryPayload = () => {
  const values = seededShuffle(['🍒', '🍓', '🍉', '🍋', '🥝', '🍇', '🍊', '🫐', '🍒', '🍓', '🍉', '🍋', '🥝', '🍇', '🍊', '🫐'], 2048)
  return {
    cards: values.map((value, index) => ({ id: `card-${index}`, value, revealed: false, matched: false })),
    picks: [],
    scores: {},
  }
}

const createMinesweeperPayload = () => {
  const cells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ mine: false, count: 0, revealed: false, flagged: false })))
  const positions = seededShuffle(Array.from({ length: 100 }, (_, index) => index), 1337).slice(0, 14)
  positions.forEach((value) => {
    const x = value % 10
    const y = Math.floor(value / 10)
    cells[y][x].mine = true
  })
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      if (cells[y][x].mine) continue
      let count = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= 10 || ny >= 10) continue
          if (cells[ny][nx].mine) count += 1
        }
      }
      cells[y][x].count = count
    }
  }
  return { cells, exploded: false, cleared: 0 }
}

const create2048Payload = () => {
  const board = [
    [0, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 0],
  ]
  return { board, score: 0, best: 2 }
}

const createMancalaPayload = () => ({ pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0] })

const createSkyDerbyPayload = () => ({
  road: Array.from({ length: 7 }, (_, index) => ({ id: `row-${index}`, lane: (index + 1) % 3 })),
  positions: {},
})

const createTowerPayload = () => ({
  heights: emptyBoard(4, 0),
  owners: emptyBoard(4, null),
  scores: {},
})

const resolveModeMeta = (key) => MODE_META[key] || MODE_META.checkers
const resolveModeEngine = (key) => resolveModeMeta(key).engine || key

const createPayload = (engine) => {
  switch (engine) {
    case 'checkers': return createCheckersPayload()
    case 'reversi': return createReversiPayload()
    case 'gomoku': return createGomokuPayload()
    case 'dots-and-boxes': return createDotsPayload()
    case 'memory-match': return createMemoryPayload()
    case 'minesweeper-party': return createMinesweeperPayload()
    case 'party-2048': return create2048Payload()
    case 'mancala': return createMancalaPayload()
    case 'sky-derby-3d': return createSkyDerbyPayload()
    case 'tower-stack-3d': return createTowerPayload()
    default: return {}
  }
}

const createBaseState = (key) => ({
  key,
  engine: resolveModeEngine(key),
  version: 1,
  phase: 'lobby',
  players: [],
  spectators: [],
  turnPlayerId: null,
  winnerId: null,
  message: 'Join the match to begin.',
  log: [],
  payload: createPayload(resolveModeEngine(key)),
})

const sanitizeState = (incoming, key) => {
  const base = createBaseState(key)
  if (!incoming || typeof incoming !== 'object' || incoming.key !== key) return base
  return {
    ...base,
    engine: resolveModeEngine(key),
    version: Number(incoming.version || 1),
    phase: ['lobby', 'live', 'finished'].includes(incoming.phase) ? incoming.phase : base.phase,
    players: Array.isArray(incoming.players) ? incoming.players.map(sanitizePlayer).filter(Boolean) : [],
    spectators: Array.isArray(incoming.spectators) ? incoming.spectators.map(sanitizePlayer).filter(Boolean) : [],
    turnPlayerId: incoming.turnPlayerId ? String(incoming.turnPlayerId) : null,
    winnerId: incoming.winnerId ? String(incoming.winnerId) : null,
    message: String(incoming.message || base.message),
    log: Array.isArray(incoming.log) ? incoming.log.slice(0, 8) : [],
    payload: incoming.payload && typeof incoming.payload === 'object' ? incoming.payload : base.payload,
  }
}

const getName = (players, id) => players.find((player) => player.id === id)?.username || 'Player'

const buildScoreSummary = (engine, state) => {
  if (['dots-and-boxes', 'memory-match', 'tower-stack-3d'].includes(engine)) return state.payload.scores || {}
  if (engine === 'sky-derby-3d') {
    return Object.fromEntries(state.players.map((player) => [player.id, state.payload.positions?.[player.id]?.score || 0]))
  }
  return {}
}

const buildModeIntel = (engine, state, meta) => {
  const base = {
    featureLabel: meta.kind === '3d' ? '3D Arena Profile' : 'Board Profile',
    headline: meta.subtitle,
    copy: meta.subtitle,
    tags: [meta.kind.toUpperCase(), meta.seats ? `${meta.seats} seats` : 'shared room', engine.replaceAll('-', ' ')],
    metrics: [
      { label: 'Phase', value: state.phase },
      { label: 'Players', value: `${state.players.length}${meta.seats ? `/${meta.seats}` : ''}` },
      { label: 'Spectators', value: String(state.spectators.length) },
    ],
  }

  if (engine === 'checkers') {
    const board = state.payload.board || []
    const pieces = board.flat().filter(Boolean)
    const kings = pieces.filter((piece) => piece === 'bk' || piece === 'rk').length
    return {
      ...base,
      headline: 'Diagonal pressure and crown control.',
      copy: 'This table rewards tempo, forced jumps, and king timing. A bad lane read collapses fast.',
      tags: ['forced captures', 'promotion', 'board duel'],
      metrics: [
        { label: 'Pieces Left', value: String(pieces.length) },
        { label: 'Kings', value: String(kings) },
        { label: 'Turn', value: state.turnPlayerId ? getName(state.players, state.turnPlayerId) : 'waiting' },
      ],
    }
  }
  if (engine === 'reversi') {
    const cells = (state.payload.board || []).flat()
    const dark = cells.filter((cell) => cell === 'd').length
    const light = cells.filter((cell) => cell === 'l').length
    return {
      ...base,
      headline: 'Corners matter more than noise.',
      copy: 'Every move here is about future flips, stable edges, and denying clean corner access.',
      tags: ['disc flips', 'corner fight', 'orbital table'],
      metrics: [
        { label: 'Dark', value: String(dark) },
        { label: 'Light', value: String(light) },
        { label: 'Open Cells', value: String(cells.filter((cell) => !cell).length) },
      ],
    }
  }
  if (engine === 'gomoku') {
    const stones = (state.payload.board || []).flat().filter(Boolean).length
    return {
      ...base,
      headline: 'Quiet board, lethal threat lines.',
      copy: 'The board is calm until it suddenly is not. Build forks early and deny open fours before they exist.',
      tags: ['five-in-row', 'threat reads', 'calm board'],
      metrics: [
        { label: 'Stones', value: String(stones) },
        { label: 'Grid', value: '15 x 15' },
        { label: 'Turn', value: state.turnPlayerId ? getName(state.players, state.turnPlayerId) : 'waiting' },
      ],
    }
  }
  if (engine === 'dots-and-boxes') {
    const claimed = (state.payload.owners || []).flat().filter(Boolean).length
    const edges = [...(state.payload.hLines || []).flat(), ...(state.payload.vLines || []).flat()].filter(Boolean).length
    return {
      ...base,
      headline: 'A drafting board built for traps.',
      copy: 'Loose edges feel harmless until the chain begins. This interface leans into structure and impending punishment.',
      tags: ['chain traps', 'claim loops', 'line economy'],
      metrics: [
        { label: 'Edges Drawn', value: String(edges) },
        { label: 'Boxes Claimed', value: String(claimed) },
        { label: 'Boxes Left', value: String(25 - claimed) },
      ],
    }
  }
  if (engine === 'memory-match') {
    const cards = state.payload.cards || []
    const matched = cards.filter((card) => card.matched).length
    return {
      ...base,
      headline: 'Gold vault, short recall window.',
      copy: 'Fast pattern memory matters more than vibes. Track reveals, deny easy repeats, and keep tempo after every pair.',
      tags: ['pair race', 'artifact deck', 'recall test'],
      metrics: [
        { label: 'Pairs Solved', value: String(matched / 2) },
        { label: 'Cards Left', value: String(cards.length - matched) },
        { label: 'Active Picks', value: String((state.payload.picks || []).length) },
      ],
    }
  }
  if (engine === 'minesweeper-party') {
    const cells = (state.payload.cells || []).flat()
    const revealedSafe = cells.filter((cell) => !cell.mine && cell.revealed).length
    const flags = cells.filter((cell) => cell.flagged).length
    return {
      ...base,
      headline: 'Shared panic in a live hazard room.',
      copy: 'Everyone acts on the same floor. Flags can save the run or waste the room if players get sloppy.',
      tags: ['co-op field', 'flag discipline', 'hazard floor'],
      metrics: [
        { label: 'Safe Open', value: `${revealedSafe}/86` },
        { label: 'Flags', value: String(flags) },
        { label: 'Threat Cells', value: String(cells.filter((cell) => cell.mine).length) },
      ],
    }
  }
  if (engine === 'party-2048') {
    const board = (state.payload.board || []).flat()
    return {
      ...base,
      headline: 'Reactor math with escalating greed.',
      copy: 'This layout treats every merge like an unstable chamber. Small mistakes turn into locked corners quickly.',
      tags: ['merge race', 'reactor board', 'score climb'],
      metrics: [
        { label: 'Score', value: String(state.payload.score || 0) },
        { label: 'Best Tile', value: String(state.payload.best || 2) },
        { label: 'Filled Cells', value: String(board.filter(Boolean).length) },
      ],
    }
  }
  if (engine === 'mancala') {
    return {
      ...base,
      headline: 'Ceremonial bowls, ruthless routing.',
      copy: 'Extra turns and capture windows matter more than raw stones. The shell pushes that ancient-table feel harder now.',
      tags: ['seed routing', 'extra turns', 'capture game'],
      metrics: [
        { label: 'Store A', value: String(state.payload.pits?.[6] || 0) },
        { label: 'Store B', value: String(state.payload.pits?.[13] || 0) },
        { label: 'Stones In Play', value: String((state.payload.pits || []).reduce((sum, count) => sum + count, 0)) },
      ],
    }
  }
  if (engine === 'sky-derby-3d') {
    const scores = state.players.map((player) => state.payload.positions?.[player.id]?.score || 0)
    return {
      ...base,
      headline: 'Tunnel racing with hard lane calls.',
      copy: 'The interface now reads like a velocity chamber: bold, bright, and built around split-second lane commitment.',
      tags: ['lane runner', 'boost reads', 'hazard tunnel'],
      metrics: [
        { label: 'Lead Score', value: String(scores.length ? Math.max(...scores) : 0) },
        { label: 'Rows Ahead', value: String((state.payload.road || []).length) },
        { label: 'Pilots', value: String(state.players.length) },
      ],
    }
  }
  if (engine === 'tower-stack-3d') {
    const heights = (state.payload.heights || []).flat()
    return {
      ...base,
      headline: 'Vertical control with skyline pressure.',
      copy: 'You are not just stacking blocks. You are building territory, adjacency, and a better final silhouette than the other player.',
      tags: ['height duel', 'area scoring', 'voxel skyline'],
      metrics: [
        { label: 'Peak Height', value: String(heights.length ? Math.max(...heights) : 0) },
        { label: 'Tiles Filled', value: String(heights.filter((value) => value > 0).length) },
        { label: 'Grid', value: '4 x 4' },
      ],
    }
  }

  return base
}
const seatColor = (index) => (index === 0 ? 'cyan' : 'pink')
const pushLog = (state, message) => [{ id: `${Date.now()}-${Math.random()}`, message }, ...(state.log || [])].slice(0, 6)

const countPieces = (board, pieceSet) => board.flat().filter((cell) => pieceSet.includes(cell)).length

const hasAnyCheckersMove = (board, side) => {
  const own = side === 'r' ? ['r', 'R'] : ['b', 'B']
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = board[y][x]
      if (!own.includes(piece)) continue
      const dirs = piece === 'R' || piece === 'B'
        ? [[1, 1], [-1, 1], [1, -1], [-1, -1]]
        : side === 'r'
          ? [[1, -1], [-1, -1]]
          : [[1, 1], [-1, 1]]
      for (const [dx, dy] of dirs) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < 8 && ny < 8 && !board[ny][nx]) return true
      }
    }
  }
  return false
}

const applyCheckersMove = (state, player, from, to) => {
  const board = state.payload.board.map((row) => [...row])
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const side = playerIndex === 0 ? 'r' : 'b'
  const piece = board[from.y]?.[from.x]
  if (!piece) return state
  const own = side === 'r' ? ['r', 'R'] : ['b', 'B']
  const enemy = side === 'r' ? ['b', 'B'] : ['r', 'R']
  if (!own.includes(piece) || board[to.y]?.[to.x]) return state
  const dx = to.x - from.x
  const dy = to.y - from.y
  const simpleDir = side === 'r' ? -1 : 1
  const isKing = piece === 'R' || piece === 'B'
  const validSimple = Math.abs(dx) === 1 && (isKing ? Math.abs(dy) === 1 : dy === simpleDir)
  const validCapture = Math.abs(dx) === 2 && (isKing ? Math.abs(dy) === 2 : dy === simpleDir * 2)
  if (!validSimple && !validCapture) return state
  if (validCapture) {
    const midX = from.x + dx / 2
    const midY = from.y + dy / 2
    if (!enemy.includes(board[midY]?.[midX])) return state
    board[midY][midX] = null
  }
  board[from.y][from.x] = null
  let nextPiece = piece
  if (piece === 'r' && to.y === 0) nextPiece = 'R'
  if (piece === 'b' && to.y === 7) nextPiece = 'B'
  board[to.y][to.x] = nextPiece
  const opponentId = state.players[(playerIndex + 1) % 2]?.id || null
  const opponentSide = side === 'r' ? 'b' : 'r'
  const next = {
    ...state,
    version: state.version + 1,
    payload: { board },
    turnPlayerId: opponentId,
    phase: 'live',
    message: `${player.username} moved ${validCapture ? 'with a capture' : 'into position'}.`,
    log: pushLog(state, `${player.username} moved a checker.`),
  }
  if (!countPieces(board, enemy) || !hasAnyCheckersMove(board, opponentSide)) {
    next.phase = 'finished'
    next.winnerId = player.id
    next.message = `${player.username} wins the board.`
  }
  return next
}

const reversiDirections = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

const collectReversiFlips = (board, x, y, token) => {
  if (board[y][x]) return []
  const enemy = token === 'd' ? 'l' : 'd'
  const flips = []
  reversiDirections.forEach(([dx, dy]) => {
    const path = []
    let cx = x + dx
    let cy = y + dy
    while (cx >= 0 && cy >= 0 && cx < 8 && cy < 8 && board[cy][cx] === enemy) {
      path.push([cx, cy])
      cx += dx
      cy += dy
    }
    if (path.length && cx >= 0 && cy >= 0 && cx < 8 && cy < 8 && board[cy][cx] === token) flips.push(...path)
  })
  return flips
}

const countReversiMoves = (board, token) => {
  let count = 0
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) if (collectReversiFlips(board, x, y, token).length) count += 1
  return count
}

const applyReversiMove = (state, player, x, y) => {
  const board = state.payload.board.map((row) => [...row])
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const token = playerIndex === 0 ? 'd' : 'l'
  const flips = collectReversiFlips(board, x, y, token)
  if (!flips.length) return state
  board[y][x] = token
  flips.forEach(([fx, fy]) => { board[fy][fx] = token })
  const opponentIndex = (playerIndex + 1) % 2
  const opponentToken = opponentIndex === 0 ? 'd' : 'l'
  let nextTurn = state.players[opponentIndex]?.id || null
  let message = `${player.username} flipped ${flips.length} discs.`
  const playerMoves = countReversiMoves(board, token)
  const opponentMoves = countReversiMoves(board, opponentToken)
  if (!opponentMoves && playerMoves) {
    nextTurn = player.id
    message = `${player.username} moves again. ${getName(state.players, nextTurn)} has no reply.`
  }
  const next = {
    ...state,
    version: state.version + 1,
    payload: { board },
    turnPlayerId: nextTurn,
    phase: 'live',
    message,
    log: pushLog(state, `${player.username} played Reversi at ${x + 1},${y + 1}.`),
  }
  if (!playerMoves && !opponentMoves) {
    const dark = board.flat().filter((cell) => cell === 'd').length
    const light = board.flat().filter((cell) => cell === 'l').length
    next.phase = 'finished'
    next.winnerId = dark === light ? null : state.players[dark > light ? 0 : 1]?.id || null
    next.message = dark === light ? 'Reversi ends in a draw.' : `${getName(state.players, next.winnerId)} owns the board.`
  }
  return next
}

const applyGomokuMove = (state, player, x, y) => {
  const board = state.payload.board.map((row) => [...row])
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished' || board[y][x]) return state
  const token = playerIndex === 0 ? 'x' : 'o'
  board[y][x] = token
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]
  let winner = null
  dirs.forEach(([dx, dy]) => {
    let count = 1
    ;[-1, 1].forEach((sign) => {
      let cx = x + dx * sign
      let cy = y + dy * sign
      while (cx >= 0 && cy >= 0 && cx < 15 && cy < 15 && board[cy][cx] === token) {
        count += 1
        cx += dx * sign
        cy += dy * sign
      }
    })
    if (count >= 5) winner = player.id
  })
  return {
    ...state,
    version: state.version + 1,
    payload: { board },
    turnPlayerId: winner ? state.turnPlayerId : state.players[(playerIndex + 1) % 2]?.id || null,
    winnerId: winner,
    phase: winner ? 'finished' : 'live',
    message: winner ? `${player.username} found five in a row.` : `${player.username} placed a stone.`,
    log: pushLog(state, `${player.username} placed at ${x + 1},${y + 1}.`),
  }
}

const checkCompletedBoxes = (hLines, vLines, owners, playerId) => {
  let claimed = 0
  const nextOwners = owners.map((row) => [...row])
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      if (nextOwners[y][x]) continue
      if (hLines[y][x] && hLines[y + 1][x] && vLines[y][x] && vLines[y][x + 1]) {
        nextOwners[y][x] = playerId
        claimed += 1
      }
    }
  }
  return { nextOwners, claimed }
}

const applyDotsMove = (state, player, orientation, x, y) => {
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const hLines = state.payload.hLines.map((row) => [...row])
  const vLines = state.payload.vLines.map((row) => [...row])
  if (orientation === 'h') {
    if (hLines[y][x]) return state
    hLines[y][x] = player.id
  } else {
    if (vLines[y][x]) return state
    vLines[y][x] = player.id
  }
  const { nextOwners, claimed } = checkCompletedBoxes(hLines, vLines, state.payload.owners, player.id)
  const scores = { ...(state.payload.scores || {}) }
  scores[player.id] = (scores[player.id] || 0) + claimed
  const boxesTaken = nextOwners.flat().filter(Boolean).length
  const nextTurn = claimed ? player.id : state.players[(playerIndex + 1) % 2]?.id || null
  const next = {
    ...state,
    version: state.version + 1,
    payload: { hLines, vLines, owners: nextOwners, scores },
    turnPlayerId: nextTurn,
    phase: 'live',
    message: claimed ? `${player.username} chained ${claimed} box${claimed > 1 ? 'es' : ''}.` : `${player.username} drew a line.`,
    log: pushLog(state, `${player.username} marked a ${orientation === 'h' ? 'horizontal' : 'vertical'} edge.`),
  }
  if (boxesTaken === 25) {
    next.phase = 'finished'
    const winner = state.players.reduce((best, entry) => ((scores[entry.id] || 0) > (scores[best?.id] || 0) ? entry : best), null)
    next.winnerId = winner?.id || null
    next.message = winner ? `${winner.username} claims the field.` : 'Dots & Boxes ends level.'
  }
  return next
}

const applyMemoryMove = (state, player, index) => {
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const cards = state.payload.cards.map((card) => ({ ...card }))
  const target = cards[index]
  if (!target || target.revealed || target.matched) return state
  target.revealed = true
  const picks = [...state.payload.picks, index]
  const scores = { ...(state.payload.scores || {}) }
  let nextTurn = state.players[(playerIndex + 1) % 2]?.id || null
  let message = `${player.username} flipped ${target.value}.`
  if (picks.length === 2) {
    const [first, second] = picks.map((pickIndex) => cards[pickIndex])
    if (first.value === second.value) {
      cards[picks[0]].matched = true
      cards[picks[1]].matched = true
      scores[player.id] = (scores[player.id] || 0) + 1
      nextTurn = player.id
      message = `${player.username} matched ${first.value}.`
    } else {
      cards[picks[0]].revealed = false
      cards[picks[1]].revealed = false
      message = `${player.username} missed the pair.`
    }
  } else {
    nextTurn = player.id
  }
  const next = {
    ...state,
    version: state.version + 1,
    payload: { cards, picks: picks.length === 2 ? [] : picks, scores },
    turnPlayerId: nextTurn,
    phase: 'live',
    message,
    log: pushLog(state, message),
  }
  if (cards.every((card) => card.matched)) {
    next.phase = 'finished'
    const winner = state.players.reduce((best, entry) => ((scores[entry.id] || 0) > (scores[best?.id] || 0) ? entry : best), null)
    next.winnerId = winner?.id || null
  }
  return next
}

const revealMines = (cells, x, y) => {
  const queue = [[x, y]]
  let cleared = 0
  while (queue.length) {
    const [cx, cy] = queue.pop()
    const cell = cells[cy]?.[cx]
    if (!cell || cell.revealed || cell.flagged) continue
    cell.revealed = true
    cleared += 1
    if (cell.count === 0 && !cell.mine) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx >= 0 && ny >= 0 && nx < 10 && ny < 10) queue.push([nx, ny])
        }
      }
    }
  }
  return cleared
}

const applyMinesAction = (state, player, action, x, y) => {
  if (state.phase === 'finished') return state
  const cells = state.payload.cells.map((row) => row.map((cell) => ({ ...cell })))
  const target = cells[y]?.[x]
  if (!target || target.revealed) return state
  const next = {
    ...state,
    version: state.version + 1,
    payload: { ...state.payload, cells },
    phase: 'live',
  }
  if (action === 'flag') {
    target.flagged = !target.flagged
    next.message = `${player.username} ${target.flagged ? 'flagged' : 'cleared a flag from'} ${x + 1},${y + 1}.`
    next.log = pushLog(state, next.message)
    return next
  }
  if (target.flagged) return state
  if (target.mine) {
    target.revealed = true
    next.phase = 'finished'
    next.payload.exploded = true
    next.message = `${player.username} hit a mine.`
    next.log = pushLog(state, next.message)
    return next
  }
  next.payload.cleared = (state.payload.cleared || 0) + revealMines(cells, x, y)
  next.message = `${player.username} cleared space at ${x + 1},${y + 1}.`
  next.log = pushLog(state, next.message)
  if (cells.flat().filter((cell) => !cell.mine && cell.revealed).length === 86) {
    next.phase = 'finished'
    next.message = 'The whole minefield is clear.'
  }
  return next
}

const slideLine = (line) => {
  const values = line.filter(Boolean)
  const next = []
  let score = 0
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] && values[index] === values[index + 1]) {
      next.push(values[index] * 2)
      score += values[index] * 2
      index += 1
    } else {
      next.push(values[index])
    }
  }
  while (next.length < 4) next.push(0)
  return { line: next, score }
}

const addRandomTile = (board) => {
  const empties = []
  board.forEach((row, y) => row.forEach((value, x) => { if (!value) empties.push([x, y]) }))
  if (!empties.length) return board
  const [x, y] = empties[(board.flat().filter(Boolean).length * 7 + 3) % empties.length]
  board[y][x] = empties.length % 5 === 0 ? 4 : 2
  return board
}

const apply2048Move = (state, player, direction) => {
  const board = state.payload.board.map((row) => [...row])
  let moved = false
  let scoreGain = 0
  const readLine = (index) => {
    switch (direction) {
      case 'left': return [...board[index]]
      case 'right': return [...board[index]].reverse()
      case 'up': return board.map((row) => row[index])
      default: return board.map((row) => row[index]).reverse()
    }
  }
  const writeLine = (index, line) => {
    switch (direction) {
      case 'left': board[index] = line; break
      case 'right': board[index] = [...line].reverse(); break
      case 'up': line.forEach((value, row) => { board[row][index] = value }); break
      default: [...line].reverse().forEach((value, row) => { board[row][index] = value }); break
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const source = readLine(index)
    const { line, score } = slideLine(source)
    if (line.some((value, idx) => value !== source[idx])) moved = true
    scoreGain += score
    writeLine(index, line)
  }
  if (!moved) return state
  addRandomTile(board)
  const best = Math.max(state.payload.best || 2, ...board.flat())
  return {
    ...state,
    version: state.version + 1,
    phase: 'live',
    payload: { board, score: (state.payload.score || 0) + scoreGain, best },
    message: `${player.username} slid ${direction}.`,
    log: pushLog(state, `${player.username} moved ${direction}.`),
  }
}

const applyMancalaMove = (state, player, pitIndex) => {
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const pits = [...state.payload.pits]
  const ownRange = playerIndex === 0 ? [0, 5] : [7, 12]
  const ownStore = playerIndex === 0 ? 6 : 13
  const enemyStore = playerIndex === 0 ? 13 : 6
  if (pitIndex < ownRange[0] || pitIndex > ownRange[1] || !pits[pitIndex]) return state
  let stones = pits[pitIndex]
  pits[pitIndex] = 0
  let cursor = pitIndex
  while (stones > 0) {
    cursor = (cursor + 1) % 14
    if (cursor === enemyStore) continue
    pits[cursor] += 1
    stones -= 1
  }
  const isOwnPit = cursor >= ownRange[0] && cursor <= ownRange[1]
  const opposite = 12 - cursor
  if (isOwnPit && pits[cursor] === 1 && pits[opposite] > 0) {
    pits[ownStore] += pits[opposite] + 1
    pits[cursor] = 0
    pits[opposite] = 0
  }
  const extraTurn = cursor === ownStore
  const nextTurn = extraTurn ? player.id : state.players[(playerIndex + 1) % 2]?.id || null
  const sideAEmpty = pits.slice(0, 6).every((value) => value === 0)
  const sideBEmpty = pits.slice(7, 13).every((value) => value === 0)
  if (sideAEmpty || sideBEmpty) {
    pits[6] += pits.slice(0, 6).reduce((sum, value) => sum + value, 0)
    pits[13] += pits.slice(7, 13).reduce((sum, value) => sum + value, 0)
    for (let index = 0; index < 6; index += 1) pits[index] = 0
    for (let index = 7; index < 13; index += 1) pits[index] = 0
  }
  const winnerId = sideAEmpty || sideBEmpty
    ? (pits[6] === pits[13] ? null : state.players[pits[6] > pits[13] ? 0 : 1]?.id || null)
    : null
  return {
    ...state,
    version: state.version + 1,
    payload: { pits },
    phase: sideAEmpty || sideBEmpty ? 'finished' : 'live',
    turnPlayerId: nextTurn,
    winnerId,
    message: extraTurn ? `${player.username} earns an extra turn.` : `${player.username} sowed the row.`,
    log: pushLog(state, `${player.username} played pit ${pitIndex + 1}.`),
  }
}

const advanceRoad = (road, steps) => {
  const next = [...road]
  for (let index = 0; index < steps; index += 1) {
    next.shift()
    next.push({ id: `row-${Date.now()}-${index}`, lane: (next[next.length - 1]?.lane + index + 1) % 3 })
  }
  return next
}

const applySkyDerbyMove = (state, player, lane, speed) => {
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const positions = { ...(state.payload.positions || {}) }
  const current = positions[player.id] || { lane: 1, score: 0, crashed: false }
  const road = advanceRoad(state.payload.road, speed)
  const hazardLane = road[Math.max(0, 1)]?.lane
  const crashed = hazardLane === lane
  positions[player.id] = { lane, score: current.score + (crashed ? 0 : speed), crashed }
  const next = {
    ...state,
    version: state.version + 1,
    payload: { road, positions },
    turnPlayerId: state.players[(playerIndex + 1) % 2]?.id || null,
    phase: 'live',
    message: crashed ? `${player.username} clipped a hazard.` : `${player.username} surged ${speed} lane${speed > 1 ? 's' : ''}.`,
    log: pushLog(state, `${player.username} picked lane ${lane + 1} at ${speed}x.`),
  }
  if (crashed) {
    next.phase = 'finished'
    next.winnerId = state.players[(playerIndex + 1) % 2]?.id || null
    next.message = `${player.username} crashed out.`
    return next
  }
  const finishLine = positions[player.id].score >= 12
  if (finishLine) {
    next.phase = 'finished'
    next.winnerId = player.id
    next.message = `${player.username} wins the derby.`
  }
  return next
}

const applyTowerMove = (state, player, x, y) => {
  const playerIndex = state.players.findIndex((entry) => entry.id === player.id)
  if (playerIndex < 0 || state.turnPlayerId !== player.id || state.phase === 'finished') return state
  const heights = state.payload.heights.map((row) => [...row])
  const owners = state.payload.owners.map((row) => [...row])
  if (heights[y][x] >= 4) return state
  heights[y][x] += 1
  owners[y][x] = player.id
  const scores = { ...(state.payload.scores || {}) }
  let bonus = 0
  ;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= 4 || ny >= 4) return
    if (owners[ny][nx] === player.id) bonus += 1
  })
  scores[player.id] = (scores[player.id] || 0) + heights[y][x] + bonus
  const next = {
    ...state,
    version: state.version + 1,
    payload: { heights, owners, scores },
    turnPlayerId: state.players[(playerIndex + 1) % 2]?.id || null,
    phase: 'live',
    message: `${player.username} stacked ${(heights[y][x])} high with ${bonus} adjacency.`,
    log: pushLog(state, `${player.username} stacked tower ${x + 1},${y + 1}.`),
  }
  if (heights.flat().every((height) => height >= 4)) {
    next.phase = 'finished'
    const winner = state.players.reduce((best, entry) => ((scores[entry.id] || 0) > (scores[best?.id] || 0) ? entry : best), null)
    next.winnerId = winner?.id || null
    next.message = winner ? `${winner.username} owns the skyline.` : 'Tower Stack 3D ends tied.'
  }
  return next
}

const applyAction = (state, engine, player, action) => {
  switch (engine) {
    case 'checkers': return applyCheckersMove(state, player, action.from, action.to)
    case 'reversi': return applyReversiMove(state, player, action.x, action.y)
    case 'gomoku': return applyGomokuMove(state, player, action.x, action.y)
    case 'dots-and-boxes': return applyDotsMove(state, player, action.orientation, action.x, action.y)
    case 'memory-match': return applyMemoryMove(state, player, action.index)
    case 'minesweeper-party': return applyMinesAction(state, player, action.mode, action.x, action.y)
    case 'party-2048': return apply2048Move(state, player, action.direction)
    case 'mancala': return applyMancalaMove(state, player, action.index)
    case 'sky-derby-3d': return applySkyDerbyMove(state, player, action.lane, action.speed)
    case 'tower-stack-3d': return applyTowerMove(state, player, action.x, action.y)
    default: return state
  }
}

const joinState = (state, player, key) => {
  const next = sanitizeState(state, key)
  if (next.players.some((entry) => entry.id === player.id) || next.spectators.some((entry) => entry.id === player.id)) return next
  const mode = resolveModeMeta(key)
  const seats = mode.seats || 0
  if (!seats || next.players.length < seats) next.players = [...next.players, player]
  else next.spectators = [...next.spectators, player]
  if ((seats === 0 && next.players.length >= 1) || (seats > 0 && next.players.length >= seats)) {
    next.phase = 'live'
    next.turnPlayerId = next.turnPlayerId || next.players[0]?.id || null
    next.message = `${next.players[0]?.username || 'Player'} starts ${mode.name || 'the match'}.`
  }
  next.version += 1
  return next
}

const leaveState = (state, playerId, key) => {
  const next = sanitizeState(state, key)
  const mode = resolveModeMeta(key)
  next.players = next.players.filter((entry) => entry.id !== playerId)
  next.spectators = next.spectators.filter((entry) => entry.id !== playerId)
  if (!next.players.length) return createBaseState(key)
  next.turnPlayerId = next.players.some((entry) => entry.id === next.turnPlayerId) ? next.turnPlayerId : next.players[0]?.id || null
  if (mode.seats && next.players.length < mode.seats) {
    const reset = createBaseState(key)
    reset.players = next.players
    reset.spectators = next.spectators
    if (next.players.length === mode.seats) {
      reset.phase = 'live'
      reset.turnPlayerId = next.players[0]?.id || null
    }
    return reset
  }
  next.version += 1
  return next
}

const renderCheckers = (state, selected, onCellClick) => (
  <div className="board-grid" style={{ gridTemplateColumns: 'repeat(8, 42px)' }}>
    {state.payload.board.flatMap((row, y) => row.map((cell, x) => {
      const isDark = (x + y) % 2 === 1
      const selectedNow = selected?.x === x && selected?.y === y
      return (
        <button
          key={`checkers-${x}-${y}`}
          className={`board-cell${isDark ? '' : ' light'}`}
          style={selectedNow ? { outline: '2px solid rgba(251, 191, 36, 0.8)' } : undefined}
          onClick={() => onCellClick(x, y)}
        >
          {cell ? <span className={`piece ${cell.toLowerCase() === 'r' ? 'red' : 'blue'} ${cell === 'R' || cell === 'B' ? 'king' : ''}`} /> : null}
        </button>
      )
    }))}
  </div>
)

const renderReversi = (state, onCellClick) => (
  <div className="board-grid" style={{ gridTemplateColumns: 'repeat(8, 42px)' }}>
    {state.payload.board.flatMap((row, y) => row.map((cell, x) => (
      <button key={`rev-${x}-${y}`} className="board-cell" onClick={() => onCellClick(x, y)}>
        {cell ? <span className={`disc ${cell === 'd' ? 'dark' : 'light'}`} /> : null}
      </button>
    )))}
  </div>
)

const renderGomoku = (state, onCellClick) => (
  <div className="board-grid" style={{ gridTemplateColumns: 'repeat(15, 28px)', gap: 3 }}>
    {state.payload.board.flatMap((row, y) => row.map((cell, x) => (
      <button key={`gomoku-${x}-${y}`} className="board-cell" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => onCellClick(x, y)}>
        {cell ? <span className={`disc ${cell === 'x' ? 'dark' : 'light'}`} style={{ width: 18, height: 18 }} /> : null}
      </button>
    )))}
  </div>
)

const renderDots = (state, onEdgeClick) => (
  <div className="dot-grid">
    {Array.from({ length: 6 }).map((_, y) => Array.from({ length: 6 }).map((__, x) => (
      <div key={`dot-${x}-${y}`} className="dot" style={{ gridColumn: x + 1, gridRow: y + 1 }} />
    )))}
    {state.payload.hLines.flatMap((row, y) => row.map((owner, x) => (
      <div
        key={`h-${x}-${y}`}
        className={`edge h${owner ? ` active ${state.players[0]?.id === owner ? 'cyan' : 'pink'}` : ''}`}
        style={{ left: x * 42 + 16, top: y * 42 + 18 }}
        onClick={() => onEdgeClick('h', x, y)}
      />
    )))}
    {state.payload.vLines.flatMap((row, y) => row.map((owner, x) => (
      <div
        key={`v-${x}-${y}`}
        className={`edge v${owner ? ` active ${state.players[0]?.id === owner ? 'cyan' : 'pink'}` : ''}`}
        style={{ left: x * 42 + 18, top: y * 42 + 16 }}
        onClick={() => onEdgeClick('v', x, y)}
      />
    )))}
    {state.payload.owners.flatMap((row, y) => row.map((owner, x) => owner ? (
      <div
        key={`box-${x}-${y}`}
        className={`box-owner ${state.players[0]?.id === owner ? 'cyan' : 'pink'}`}
        style={{ left: x * 42 + 24, top: y * 42 + 24 }}
      >
        {getName(state.players, owner).slice(0, 1).toUpperCase()}
      </div>
    ) : null))}
  </div>
)

const renderMemory = (state, onCardClick) => (
  <div className="board-grid" style={{ gridTemplateColumns: 'repeat(4, 74px)', gap: 10 }}>
    {state.payload.cards.map((card, index) => (
      <button key={card.id} className={`memory-card${card.revealed ? ' revealed' : ''}${card.matched ? ' matched' : ''}`} onClick={() => onCardClick(index)}>
        {card.revealed || card.matched ? card.value : '✦'}
      </button>
    ))}
  </div>
)

const renderMines = (state, onCellClick) => (
  <div className="board-grid" style={{ gridTemplateColumns: 'repeat(10, 36px)', gap: 4 }}>
    {state.payload.cells.flatMap((row, y) => row.map((cell, x) => (
      <button
        key={`mine-${x}-${y}`}
        className={`mine-cell${cell.revealed ? ' revealed' : ''}${cell.revealed && cell.mine ? ' mine' : ''}`}
        onClick={() => onCellClick('reveal', x, y)}
        onContextMenu={(event) => {
          event.preventDefault()
          onCellClick('flag', x, y)
        }}
      >
        {cell.revealed ? (cell.mine ? '✹' : cell.count || '') : cell.flagged ? '⚑' : ''}
      </button>
    )))}
  </div>
)

const render2048 = (state, onDirection) => (
  <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
    <div className="slider-board">
      {state.payload.board.flat().map((value, index) => (
        <div key={`2048-${index}`} className="slider-cell" style={{ background: value ? `rgba(251, 191, 36, ${Math.min(0.18 + value / 4096, 0.8)})` : 'rgba(15, 23, 42, 0.76)' }}>
          {value || ''}
        </div>
      ))}
    </div>
    <div className="arcade-pills">
      {['up', 'left', 'right', 'down'].map((direction) => (
        <button key={direction} className="arcade-btn secondary" onClick={() => onDirection(direction)}>{direction}</button>
      ))}
    </div>
  </div>
)

const renderMancala = (state, onPitClick) => {
  const pits = state.payload.pits
  return (
    <div className="mancala">
      <button className="pit store" style={{ gridRow: '1 / span 2', gridColumn: 1 }} disabled>{pits[13]}</button>
      {[12, 11, 10, 9, 8, 7].map((index, offset) => <button key={index} className="pit" style={{ gridColumn: offset + 2, gridRow: 1 }} onClick={() => onPitClick(index)}>{pits[index]}</button>)}
      {[0, 1, 2, 3, 4, 5].map((index, offset) => <button key={index} className="pit" style={{ gridColumn: offset + 2, gridRow: 2 }} onClick={() => onPitClick(index)}>{pits[index]}</button>)}
      <button className="pit store" style={{ gridRow: '1 / span 2', gridColumn: 8 }} disabled>{pits[6]}</button>
    </div>
  )
}

const renderSkyDerby = (state, onMove) => {
  const road = state.payload.road || []
  return (
    <div className="road3d">
      <div className="road3d-stage">
        <div className="road-lane-line" style={{ left: '33.33%' }} />
        <div className="road-lane-line" style={{ left: '66.66%' }} />
        {road.map((row, index) => {
          const top = 28 + index * 48
          const width = 30 + index * 8
          const left = 50 - width / 2
          return (
            <div key={row.id} className="road-row" style={{ top }}>
              <div className="road-hazard" style={{ left: `${left + row.lane * (width / 3)}%`, width: `${width / 3}%` }} />
            </div>
          )
        })}
        {state.players.map((player, index) => {
          const pos = state.payload.positions?.[player.id] || { lane: 1, score: 0 }
          return (
            <div key={player.id} className={`road-car ${seatColor(index)}`} style={{ left: `${6 + pos.lane * 31}%`, transform: `translateZ(${index * 4}px)` }}>
              {player.username.slice(0, 1).toUpperCase()}
            </div>
          )
        })}
      </div>
      <div className="arcade-pills" style={{ justifyContent: 'center', marginTop: 14 }}>
        {[0, 1, 2].map((lane) => (
          <button key={`lane-${lane}`} className="arcade-btn secondary" onClick={() => onMove(lane, 1)}>Lane {lane + 1}</button>
        ))}
        {[0, 1, 2].map((lane) => (
          <button key={`boost-${lane}`} className="arcade-btn pink" onClick={() => onMove(lane, 2)}>Boost {lane + 1}</button>
        ))}
      </div>
    </div>
  )
}

const voxelColors = (owner, height) => {
  if (!owner) return { top: `rgba(148, 163, 184, ${0.22 + height * 0.05})`, left: 'rgba(71, 85, 105, 0.56)', right: 'rgba(51, 65, 85, 0.7)' }
  const cyan = { top: '#67e8f9', left: '#0e7490', right: '#155e75' }
  const pink = { top: '#fda4af', left: '#be123c', right: '#9f1239' }
  return owner === 'cyan' ? cyan : pink
}

const renderTower = (state, onStack) => (
  <div className="iso-grid">
    {state.payload.heights.flatMap((row, y) => row.map((height, x) => {
      const owner = state.payload.owners[y][x]
      const palette = voxelColors(owner === state.players[0]?.id ? 'cyan' : owner ? 'pink' : null, height)
      return (
        <button key={`tower-${x}-${y}`} className="stack-slot" onClick={() => onStack(x, y)}>
          {Array.from({ length: height }).map((_, index) => (
            <div key={`voxel-${x}-${y}-${index}`} className="voxel" style={{ bottom: 10 + index * 28 }}>
              <div className="voxel-top" style={{ background: palette.top }} />
              <div className="voxel-left" style={{ background: palette.left }} />
              <div className="voxel-right" style={{ background: palette.right }} />
            </div>
          ))}
        </button>
      )
    }))}
  </div>
)

const ArcadePartyActivity = ({ sdk, currentUser, activityDefinition }) => {
  const key = activityDefinition?.key || 'checkers'
  const meta = resolveModeMeta(key)
  const engine = meta.engine || key
  const ui = getUiPreset(engine, meta)
  const me = useMemo(() => sanitizePlayer(currentUser), [currentUser])
  const [gameState, setGameState] = useState(() => createBaseState(key))
  const [selected, setSelected] = useState(null)
  const pendingStateRef = useRef(createBaseState(key))

  useEffect(() => {
    const reset = createBaseState(key)
    pendingStateRef.current = reset
    setGameState(reset)
    setSelected(null)
  }, [key])

  useEffect(() => {
    if (!sdk) return undefined
    const offState = sdk.subscribeServerState((state) => {
      const incoming = sanitizeState(state?.arcadeParty || state?.arcadeActivity || createBaseState(key), key)
      pendingStateRef.current = incoming
      setGameState(incoming)
    })
    return () => {
      try { offState?.() } catch {}
    }
  }, [key, sdk])

  const pushState = useCallback((nextState, cue = 'button_click') => {
    if (!sdk) return
    pendingStateRef.current = nextState
    sdk.updateState({ arcadeParty: nextState }, { serverRelay: true, cue })
  }, [sdk])

  const mySeat = gameState.players.find((player) => player.id === me?.id) || null
  const myIndex = gameState.players.findIndex((player) => player.id === me?.id)
  const isMyTurn = !meta.seats || (mySeat && gameState.turnPlayerId === mySeat.id && gameState.phase !== 'finished')

  const handleJoin = useCallback(() => {
    if (!me) return
    pushState(joinState(gameState, me, key), 'player_join')
  }, [gameState, key, me, pushState])

  const handleLeave = useCallback(() => {
    if (!me) return
    pushState(leaveState(gameState, me.id, key), 'player_leave')
  }, [gameState, key, me, pushState])

  const handleReset = useCallback(() => {
    const next = createBaseState(key)
    next.players = gameState.players
    next.spectators = gameState.spectators
    if ((meta.seats === 0 && next.players.length) || (meta.seats > 0 && next.players.length >= meta.seats)) {
      const nextMeta = resolveModeMeta(key)
      next.phase = 'live'
      next.turnPlayerId = next.players[0]?.id || null
      next.message = `${next.players[0]?.username || 'Player'} starts ${nextMeta.name}.`
    }
    pushState(next, 'round_start')
  }, [gameState.players, gameState.spectators, key, meta.seats, pushState])

  const performAction = useCallback((action) => {
    if (!me || (meta.seats && !isMyTurn) || (!meta.seats && !mySeat && !gameState.players.some((entry) => entry.id === me.id))) return
    const next = applyAction(gameState, engine, me, action)
    if (next !== gameState) pushState(next, 'move_valid')
  }, [engine, gameState, isMyTurn, me, meta.seats, mySeat, pushState])

  const board = useMemo(() => {
    const isDisabled = !!meta.seats && (!mySeat || !isMyTurn)
    return (
      <ArcadeParty3DScene
        meta={{ ...meta, id: key }}
        state={gameState}
        selected={selected}
        disabled={isDisabled}
        onAction={(action) => {
          if (engine === 'checkers' && 'x' in action && 'y' in action) {
            if (!mySeat || !isMyTurn) return
            if (!selected) {
              setSelected({ x: action.x, y: action.y })
              return
            }
            performAction({ from: selected, to: { x: action.x, y: action.y } })
            setSelected(null)
            return
          }
          if (selected) setSelected(null)
          performAction(action)
        }}
      />
    )
  }, [engine, gameState, isMyTurn, key, meta, mySeat, performAction, selected])

  const scoreSummary = buildScoreSummary(engine, gameState)
  const intel = buildModeIntel(engine, gameState, meta)
  const seatBadge = gameState.winnerId
    ? { value: getName(gameState.players, gameState.winnerId), label: 'Winner' }
    : meta.seats
      ? { value: myIndex >= 0 ? `Seat ${myIndex + 1}` : 'Spectator', label: 'Your Position' }
      : { value: 'Shared Room', label: 'Interaction Model' }

  return (
    <div
      className={`arcade-party arcade-skin-${ui.skin}`}
      style={{
        '--bg0': ui.bg0,
        '--bg1': ui.bg1,
        '--panel': ui.panel,
        '--text': ui.text,
        '--muted': ui.muted,
        '--line': ui.line,
        '--line-strong': ui.lineStrong,
        '--cyan': ui.glow,
        '--pink': ui.accent2,
        '--gold': ui.accent,
      }}
    >
      <style>{CSS}</style>

      <aside className="arcade-side">
        <div className="arcade-side-header">
          <div className="arcade-kicker">{ui.kicker}</div>
          <h2 className="arcade-title">{meta.name}</h2>
          <p className="arcade-subtitle">{meta.subtitle}</p>
          <div className="arcade-hero-strip">
            <strong>{intel.headline}</strong>
            <span>{ui.hero}</span>
          </div>
        </div>

        <div className="arcade-status">
          <strong>{gameState.phase === 'finished'
            ? gameState.winnerId ? `${getName(gameState.players, gameState.winnerId)} wins` : 'Finished'
            : gameState.turnPlayerId ? `${getName(gameState.players, gameState.turnPlayerId)} to play` : 'Waiting for players'}</strong>
          <div>{gameState.message}</div>
        </div>

        {meta.seats ? ['Player 1', 'Player 2'].map((label, index) => {
          const player = gameState.players[index]
          return (
            <div key={label} className={`arcade-seat${player?.id === gameState.turnPlayerId ? ' active' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="arcade-seat-id">{player?.username?.slice(0, 1)?.toUpperCase() || index + 1}</div>
                <div>
                  <strong>{player?.username || label}</strong>
                  <span>{player ? (index === 0 ? 'Seat one' : 'Seat two') : 'Open seat'}</span>
                </div>
              </div>
              {!player && me && !mySeat ? <button className="arcade-btn" onClick={handleJoin}>Sit</button> : null}
              {player?.id === me?.id ? <button className="arcade-btn secondary" onClick={handleLeave}>Leave</button> : null}
            </div>
          )
        }) : (
          <div className="arcade-card">
            <div className="arcade-stat-label">Participants</div>
            <div className="arcade-spectators" style={{ marginTop: 10 }}>
              {gameState.players.map((player) => <div key={player.id} className="arcade-chip">{player.username}</div>)}
              {!gameState.players.some((player) => player.id === me?.id) ? <button className="arcade-btn" onClick={handleJoin}>Join</button> : <button className="arcade-btn secondary" onClick={handleLeave}>Leave</button>}
            </div>
          </div>
        )}

        <div className="arcade-grid two">
          <div className="arcade-stat">
            <div className="arcade-stat-label">Mode</div>
            <div className="arcade-stat-value">{meta.kind.toUpperCase()}</div>
          </div>
          <div className="arcade-stat">
            <div className="arcade-stat-label">Players</div>
            <div className="arcade-stat-value">{gameState.players.length}{meta.seats ? `/${meta.seats}` : ''}</div>
          </div>
          <div className="arcade-stat">
            <div className="arcade-stat-label">Turn</div>
            <div className="arcade-stat-value">{gameState.turnPlayerId ? getName(gameState.players, gameState.turnPlayerId) : 'Free'}</div>
          </div>
          <div className="arcade-stat">
            <div className="arcade-stat-label">State</div>
            <div className="arcade-stat-value">{gameState.phase}</div>
          </div>
        </div>

        <div className="arcade-card">
          <div className="arcade-pills">
            <button className="arcade-btn secondary" onClick={handleReset}>Reset</button>
            {!meta.seats && !gameState.players.some((player) => player.id === me?.id) ? <button className="arcade-btn" onClick={handleJoin}>Join Action</button> : null}
          </div>
        </div>

        <div className="arcade-card">
          <div className="arcade-stat-label">Spectators</div>
          <div className="arcade-spectators" style={{ marginTop: 10 }}>
            {gameState.spectators.length ? gameState.spectators.map((player) => <div key={player.id} className="arcade-chip">{player.username}</div>) : <div className="arcade-chip">No spectators</div>}
          </div>
        </div>

        <div className="arcade-card">
          <div className="arcade-stat-label">Recent Plays</div>
          <div className="arcade-log" style={{ marginTop: 10 }}>
            {gameState.log.length ? gameState.log.map((entry) => <div key={entry.id} className="arcade-log-entry"><strong>{entry.message}</strong></div>) : <div className="arcade-chip">No moves yet</div>}
          </div>
        </div>
      </aside>

      <section className="arcade-main">
        <div className="arcade-main-top">
          <div>
            <strong>{meta.name}</strong>
            <span>{intel.copy}</span>
          </div>
          <div className="arcade-badge">
            <strong>{seatBadge.value}</strong>
            <span>{seatBadge.label}</span>
          </div>
        </div>

        <div className="arcade-intel">
          <div className="arcade-feature">
            <div className="arcade-feature-label">{intel.featureLabel}</div>
            <div className="arcade-feature-title">{intel.headline}</div>
            <div className="arcade-feature-copy">{gameState.message}</div>
            <div className="arcade-feature-tags">
              {intel.tags.map((tag) => <div key={tag} className="arcade-feature-tag">{tag}</div>)}
            </div>
          </div>
          <div className="arcade-intel-grid">
            {intel.metrics.map((metric) => (
              <div key={metric.label} className="arcade-intel-card">
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`arcade-board${meta.kind === '3d' ? ' game-3d' : ''}`}>
          {board}
        </div>

        <div className="arcade-pills">
          <div className="arcade-pill">Activity: {key}</div>
          <div className="arcade-pill">Phase: {gameState.phase}</div>
          <div className="arcade-pill">Turn: {gameState.turnPlayerId ? getName(gameState.players, gameState.turnPlayerId) : 'open'}</div>
          {Object.entries(scoreSummary).map(([playerId, score]) => (
            <div key={playerId} className="arcade-pill">{getName(gameState.players, playerId)}: {score}</div>
          ))}
          {engine === 'party-2048' ? <div className="arcade-pill">Score: {gameState.payload.score || 0}</div> : null}
          {engine === 'party-2048' ? <div className="arcade-pill">Best: {gameState.payload.best || 2}</div> : null}
          {engine === 'minesweeper-party' ? <div className="arcade-pill">Safe cells open: {gameState.payload.cells?.flat().filter((cell) => !cell.mine && cell.revealed).length || 0}/86</div> : null}
          {engine === 'mancala' ? <div className="arcade-pill">Stores: {gameState.payload.pits?.[6] || 0} / {gameState.payload.pits?.[13] || 0}</div> : null}
        </div>
      </section>
    </div>
  )
}

export default ArcadePartyActivity
