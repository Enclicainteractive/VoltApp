/**
 * VoltCraftActivity.jsx  –  Minecraft-style voxel game (v4)
 *
 * Fixes & improvements:
 *  1. W/S/A/D movement direction corrected
 *  2. Survival mode: no flying, proper gravity, no fly toggle
 *  3. Creative mode: fly with Space/Shift, no gravity
 *  4. P key = pause/settings (not Escape which exits fullscreen)
 *  5. Escape releases pointer lock only
 *  6. Inventory/World menu: releases pointer lock, re-acquires on close
 *  7. Block break: only invalidates the 1 chunk (+ border if on edge), not 9
 *  8. Render distance: VIEW_RADIUS = 4 (9×9 = 81 chunks)
 *  9. Chunk loading: process 3 chunks per tick, parallel requests
 * 10. Procedural canvas textures per block type (not plain colors)
 * 11. Proper fog distance matching render distance
 * 12. Sprint with Ctrl, sneak with Shift
 * 13. OP/gamemode toggle in pause menu
 * 14. Hotbar shows block name on hover
 * 15. Crosshair always visible (not inside 3D scene)
 * 16. Block highlight box only when pointer locked
 * 17. Chunk unload only when > VIEW_RADIUS+2 away
 * 18. Position sampling every 100ms (smoother)
 * 19. Survival: fall damage, hunger affects speed
 * 20. Proper pointer lock handling throughout
 */
import React, {
  useCallback, useEffect, useRef, useState, Suspense, useMemo
} from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { initCollision, setCollisionChanges, resolveAABB, isWaterBlock, raycastVoxel } from './voltcraft/collision'
import { createVoltCraftAudio } from './voltcraft/audio'
import GameCanvasShell from './shared/GameCanvasShell'
import {
  SURVIVAL_RECIPES,
  QUESTS,
  WORLD_HINTS,
  addResources,
  canCraftRecipe,
  createStarterResources,
  formatItemLabel,
  getDropRewards,
  getMissingIngredients,
  getQuestCompletion,
  getTopResources,
  removeResources,
} from './voltcraft/gameplay'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE      = 16
const VIEW_RADIUS     = 4      // 9×9 = 81 chunks
const PLAYER_HEIGHT   = 1.62
const PLAYER_SYNC_MS  = 200
const CREATIVE_SPEED  = 16.0
const SURVIVAL_SPEED  = 5.2
const SPRINT_MULT     = 1.6
const JUMP_VEL        = 7.5
const GRAVITY         = 24
const PLAYER_REACH    = 5.5
const SAVE_KEY_PREFIX = 'voltcraft_world_'
const FOG_NEAR        = (VIEW_RADIUS - 1) * CHUNK_SIZE
const FOG_FAR         = (VIEW_RADIUS + 1) * CHUNK_SIZE
const TNT_FUSE_MS     = 2200
const TNT_RADIUS      = 3
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function getAffectedChunkKeys(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE)
  const cz = Math.floor(z / CHUNK_SIZE)
  const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

  const keys = new Set([`${cx},${cz}`])
  if (localX === 0) keys.add(`${cx - 1},${cz}`)
  if (localX === CHUNK_SIZE - 1) keys.add(`${cx + 1},${cz}`)
  if (localZ === 0) keys.add(`${cx},${cz - 1}`)
  if (localZ === CHUNK_SIZE - 1) keys.add(`${cx},${cz + 1}`)
  if (localX === 0 && localZ === 0) keys.add(`${cx - 1},${cz - 1}`)
  if (localX === 0 && localZ === CHUNK_SIZE - 1) keys.add(`${cx - 1},${cz + 1}`)
  if (localX === CHUNK_SIZE - 1 && localZ === 0) keys.add(`${cx + 1},${cz - 1}`)
  if (localX === CHUNK_SIZE - 1 && localZ === CHUNK_SIZE - 1) keys.add(`${cx + 1},${cz + 1}`)
  return keys
}

function getChangedBlockKeys(prevChanges = {}, nextChanges = {}) {
  const changed = new Set()
  const keys = new Set([...Object.keys(prevChanges), ...Object.keys(nextChanges)])
  keys.forEach((key) => {
    const prev = prevChanges[key]
    const next = nextChanges[key]
    if (prev !== next) changed.add(key)
  })
  return changed
}

function getBreakDurationMs(blockName) {
  if (!blockName) return 400
  if (blockName.includes('glass') || blockName.includes('leaves') || blockName.startsWith('wool')) return 140
  if (blockName.includes('dirt') || blockName.includes('sand') || blockName.includes('gravel') || blockName.includes('snow')) return 280
  if (blockName.includes('log') || blockName.includes('planks') || blockName.includes('wood') || blockName.includes('crafting')) return 520
  if (blockName.includes('stone') || blockName.includes('cobble') || blockName.includes('ore') || blockName.includes('deepslate')) return 760
  return 400
}

// ─── Block color palette (for HUD/inventory display) ─────────────────────────
const BLOCK_COLORS = {
  grass:'#5d8c2e', dirt:'#8b5a2b', stone:'#7a7a7a', cobblestone:'#6b6b6b',
  sand:'#e8d4a8', gravel:'#9e8d7a', oak_log:'#6c4a1a', oak_planks:'#a0824a',
  leaves:'#2f7a2c', water:'#3b82f6', bedrock:'#1a1a1a', coal_ore:'#3d3d3d',
  iron_ore:'#8a6f4e', gold_ore:'#c9a227', diamond_ore:'#4ecca3',
  obsidian:'#1a1a2e', torch:'#ff6b35', glass:'#c8e6ff', brick:'#b94e48',
  tnt:'#e03131', wool:'#f5f5f5', wool_red:'#ef4444', wool_blue:'#3b82f6',
  wool_green:'#22c55e', crafting_table:'#8b6914', furnace:'#4a4a4a',
  chest:'#c8a44a', snow:'#f0f4ff', ice:'#a8d8f0', cactus:'#3d7a2a',
  sandstone:'#d4b483', glowstone:'#f0c040', netherrack:'#6a1a1a',
  lava:'#e05010', lava_source:'#e05010', stone_bricks:'#888',
  mossy_cobblestone:'#5a7a4a', andesite:'#8a8a8a', diorite:'#c0c0c0',
  granite:'#a06040', deepslate:'#555', tuff:'#6a6a5a',
  copper_ore:'#b56b3d', copper_block:'#c67a45', copper_wire:'#f59e5b',
  power_source:'#f7c948', flint_and_steel:'#94a3b8',
}

const CRAFTING_RECIPES = [
  {
    key: 'flint_and_steel',
    output: 'flint_and_steel',
    label: 'Flint & Steel',
    ingredients: ['iron_ore', 'gravel'],
    description: 'Ignites TNT and fire blocks.',
  },
  {
    key: 'tnt',
    output: 'tnt',
    label: 'TNT',
    ingredients: ['sand', 'sand', 'sand', 'sand', 'gunpowder'],
    description: 'Place and ignite for a timed blast.',
  },
  {
    key: 'copper_wire',
    output: 'copper_wire',
    label: 'Copper Wire',
    ingredients: ['copper_block'],
    description: 'Carries power between nearby tech blocks.',
  },
  {
    key: 'power_source',
    output: 'power_source',
    label: 'Power Source',
    ingredients: ['copper_block', 'glowstone'],
    description: 'Feeds connected copper wire networks.',
  },
]

const UI_TO_WORLD_BLOCK = {
  power_source: 'copper_power_source',
}

const WORLD_TO_UI_BLOCK = {
  copper_power_source: 'power_source',
  copper_power_source_on: 'power_source',
  copper_wire_on: 'copper_wire',
}

function toWorldBlockName(blockName) {
  return UI_TO_WORLD_BLOCK[blockName] || blockName
}

function toUiBlockName(blockName) {
  return WORLD_TO_UI_BLOCK[blockName] || blockName
}

// ─── Procedural block textures (canvas-based, 16×16 pixel art) ───────────────
const _texCache = new Map()
function makeBlockTexture(blockName) {
  if (_texCache.has(blockName)) return _texCache.get(blockName)
  const size = 64
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')

  const base = BLOCK_COLORS[blockName] || '#888888'
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  // Add pixel-art detail based on block type
  const draw = (color, rects) => {
    ctx.fillStyle = color
    rects.forEach(([x,y,w,h]) => ctx.fillRect(x,y,w,h))
  }

  if (blockName === 'grass') {
    // Green top stripe
    ctx.fillStyle = '#4a7a20'; ctx.fillRect(0,0,size,size*0.25)
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0,size*0.25,size,size*0.75)
    // Grass tufts
    ctx.fillStyle = '#3d6b18'
    for (let i=0;i<8;i++) ctx.fillRect(i*8,2,3,6)
  } else if (blockName === 'dirt') {
    ctx.fillStyle = '#7a4e24'
    draw('#7a4e24', [[4,4,8,4],[20,12,6,6],[40,8,10,4],[8,32,12,8],[36,28,8,6]])
    draw('#a06030', [[0,0,4,4],[16,8,4,4],[32,4,8,4]])
  } else if (blockName === 'stone') {
    ctx.fillStyle = '#6a6a6a'
    draw('#5a5a5a', [[0,0,size,2],[0,0,2,size],[0,size-2,size,2],[size-2,0,2,size]])
    draw('#888', [[8,8,16,16],[32,24,20,12]])
  } else if (blockName === 'cobblestone') {
    ctx.fillStyle = '#5a5a5a'
    const stones = [[2,2,14,10],[18,4,12,12],[32,2,16,8],[4,16,10,14],[16,18,14,10],[32,14,18,12],[2,32,16,12],[20,30,12,14],[36,28,16,14]]
    stones.forEach(([x,y,w,h]) => { ctx.fillStyle='#6b6b6b'; ctx.fillRect(x,y,w,h); ctx.strokeStyle='#444'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h) })
  } else if (blockName === 'sand') {
    ctx.fillStyle = '#d4c090'
    draw('#c8b880', [[4,4,8,4],[20,8,12,4],[8,20,6,6],[32,16,10,8],[16,32,14,6]])
    draw('#e8d4a8', [[12,12,8,4],[28,4,6,8],[4,28,10,4]])
  } else if (blockName === 'oak_log') {
    // Bark rings
    ctx.fillStyle = '#5a3a10'
    for (let i=0;i<4;i++) { ctx.fillStyle=i%2?'#6c4a1a':'#5a3a10'; ctx.fillRect(0,i*16,size,16) }
    draw('#4a2a08', [[0,0,4,size],[size-4,0,4,size]])
  } else if (blockName === 'oak_planks') {
    for (let i=0;i<4;i++) { ctx.fillStyle=i%2?'#a0824a':'#8a6c38'; ctx.fillRect(0,i*16,size,16) }
    draw('#6a4a20', [[0,0,size,2],[0,16,size,2],[0,32,size,2],[0,48,size,2]])
  } else if (blockName === 'leaves') {
    ctx.fillStyle = '#1a5a18'
    draw('#2f7a2c', [[4,4,8,8],[20,2,10,6],[36,8,12,8],[2,20,6,10],[16,18,14,10],[34,16,12,12],[4,34,10,8],[22,32,8,12],[38,30,14,10]])
    draw('#3a9a38', [[8,8,4,4],[24,6,4,4],[40,12,4,4]])
  } else if (blockName === 'glass') {
    ctx.clearRect(0,0,size,size)
    ctx.fillStyle = 'rgba(180,220,255,0.3)'; ctx.fillRect(0,0,size,size)
    ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth=2
    ctx.strokeRect(1,1,size-2,size-2)
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(size,size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(size,0); ctx.lineTo(0,size); ctx.stroke()
  } else if (blockName === 'brick') {
    const rows = 4, cols = 2
    for (let r=0;r<rows;r++) {
      const offset = r%2 ? size/cols/2 : 0
      for (let c=-1;c<=cols;c++) {
        ctx.fillStyle = r%2===c%2 ? '#b94e48' : '#a03c38'
        ctx.fillRect(c*(size/cols)+offset+1, r*(size/rows)+1, size/cols-2, size/rows-2)
      }
    }
    ctx.fillStyle = '#8a6a5a'
    for (let r=0;r<=rows;r++) ctx.fillRect(0,r*(size/rows),size,2)
  } else if (blockName === 'tnt') {
    ctx.fillStyle = '#e03131'
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(8,8,48,48)
    ctx.fillStyle = '#e03131'; ctx.fillRect(0,0,size,16); ctx.fillRect(0,48,size,16)
    ctx.fillStyle = '#1a1a1a'; ctx.font='bold 20px monospace'; ctx.textAlign='center'
    ctx.fillText('TNT',size/2,38)
  } else if (blockName === 'glowstone') {
    ctx.fillStyle = '#e0b020'
    draw('#f0c040', [[8,8,16,16],[32,4,20,12],[4,32,12,20],[36,32,16,16]])
    draw('#fff8c0', [[12,12,8,8],[36,8,8,6]])
  } else if (blockName === 'coal_ore') {
    ctx.fillStyle = '#6a6a6a'
    draw('#1a1a1a', [[8,8,12,10],[28,12,10,12],[16,28,14,10]])
  } else if (blockName === 'iron_ore') {
    ctx.fillStyle = '#7a7a7a'
    draw('#c8a878', [[8,8,12,10],[28,12,10,12],[16,28,14,10]])
  } else if (blockName === 'gold_ore') {
    ctx.fillStyle = '#7a7a7a'
    draw('#f0c020', [[8,8,12,10],[28,12,10,12],[16,28,14,10]])
  } else if (blockName === 'diamond_ore') {
    ctx.fillStyle = '#7a7a7a'
    draw('#40e0c0', [[8,8,12,10],[28,12,10,12],[16,28,14,10]])
  } else if (blockName === 'obsidian') {
    ctx.fillStyle = '#1a1a2e'
    draw('#2a2a4e', [[4,4,12,12],[24,8,16,8],[8,28,20,12],[36,20,16,16]])
    draw('#3a3a6e', [[8,8,4,4],[28,12,4,4]])
  } else if (blockName === 'bedrock') {
    ctx.fillStyle = '#1a1a1a'
    draw('#2a2a2a', [[4,4,10,10],[20,8,12,8],[36,4,16,12],[4,24,14,12],[24,20,16,16],[8,40,20,12],[36,36,16,16]])
  } else if (blockName === 'water') {
    ctx.fillStyle = 'rgba(30,100,200,0.7)'
    ctx.fillRect(0,0,size,size)
    ctx.fillStyle = 'rgba(80,160,255,0.4)'
    for (let i=0;i<4;i++) ctx.fillRect(0,i*16+4,size,6)
  } else if (blockName === 'lava' || blockName === 'lava_source') {
    ctx.fillStyle = '#c03000'
    draw('#e05010', [[0,0,size,16],[0,32,size,16]])
    draw('#ff8020', [[8,8,16,8],[32,4,20,8],[4,24,24,8],[36,20,16,12]])
    draw('#ffcc00', [[12,10,8,4],[36,6,8,4]])
  } else if (blockName === 'snow') {
    ctx.fillStyle = '#e8eeff'
    draw('#d0d8f0', [[4,4,8,4],[20,8,12,4],[36,4,16,4],[8,20,10,6],[28,16,14,8]])
  } else if (blockName === 'sandstone') {
    ctx.fillStyle = '#c8a860'
    draw('#b89848', [[0,0,size,4],[0,20,size,4],[0,40,size,4]])
    draw('#d8b870', [[4,8,16,8],[28,12,20,6],[8,28,12,8],[32,24,16,12]])
  } else if (blockName === 'netherrack') {
    ctx.fillStyle = '#5a1010'
    draw('#7a2020', [[4,4,12,10],[24,8,14,12],[8,24,16,10],[32,20,18,14]])
    draw('#3a0808', [[8,8,4,4],[28,12,4,4],[12,28,4,4]])
  } else if (blockName === 'crafting_table') {
    ctx.fillStyle = '#8b6914'
    draw('#6a4a10', [[0,0,size,4],[0,size-4,size,4],[0,0,4,size],[size-4,0,4,size]])
    draw('#c8a030', [[8,8,20,20],[36,8,16,16],[8,36,16,16]])
    draw('#e0c050', [[12,12,12,12]])
  } else if (blockName === 'furnace') {
    ctx.fillStyle = '#4a4a4a'
    draw('#2a2a2a', [[16,16,32,32]])
    draw('#e05010', [[20,20,24,24]])
    draw('#ff8020', [[24,24,16,16]])
  } else if (blockName === 'copper_ore') {
    ctx.fillStyle = '#6e6e6e'
    draw('#c67a45', [[8,8,10,8],[28,14,12,10],[18,30,12,8]])
  } else if (blockName === 'copper_block') {
    ctx.fillStyle = '#c67a45'
    draw('#e7a06b', [[0,0,size,4],[0,0,4,size],[10,10,18,18]])
    draw('#8c4f2f', [[0,size-4,size,4],[size-4,0,4,size]])
  } else if (blockName === 'copper_wire') {
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(0,0,size,size)
    draw('#f59e5b', [[28,4,8,56],[8,28,48,8],[10,10,10,10],[44,10,10,10],[10,44,10,10],[44,44,10,10]])
    draw('#fff0b3', [[30,6,4,52],[10,30,44,4]])
  } else if (blockName === 'power_source') {
    ctx.fillStyle = '#5a3d18'
    draw('#f7c948', [[8,8,48,48],[18,18,28,28]])
    draw('#fff5bf', [[24,24,16,16]])
  } else if (blockName === 'flint_and_steel') {
    ctx.clearRect(0,0,size,size)
    draw('#94a3b8', [[14,14,18,10],[24,20,10,24],[34,34,12,10]])
    draw('#f97316', [[36,10,8,12],[42,14,6,10],[30,18,8,8]])
  } else if (blockName.startsWith('wool')) {
    const wc = BLOCK_COLORS[blockName] || '#f5f5f5'
    ctx.fillStyle = wc
    // Wool texture - slightly lighter/darker patches
    const r = parseInt(wc.slice(1,3),16), g = parseInt(wc.slice(3,5),16), b = parseInt(wc.slice(5,7),16)
    const lighter = `rgb(${Math.min(255,r+30)},${Math.min(255,g+30)},${Math.min(255,b+30)})`
    const darker = `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`
    draw(lighter, [[0,0,16,16],[32,0,16,16],[16,16,16,16],[48,16,16,16],[0,32,16,16],[32,32,16,16],[16,48,16,16],[48,48,16,16]])
    draw(darker, [[16,0,16,16],[48,0,16,16],[0,16,16,16],[32,16,16,16],[16,32,16,16],[48,32,16,16],[0,48,16,16],[32,48,16,16]])
  } else if (blockName === 'stone_bricks') {
    ctx.fillStyle = '#888'
    draw('#666', [[0,0,size,2],[0,size/2,size,2],[0,0,2,size/2],[size/2,size/2,2,size/2]])
    draw('#aaa', [[4,4,size/2-6,size/2-6],[size/2+4,size/2+4,size/2-6,size/2-6]])
  } else {
    // Generic: base color + subtle grid
    ctx.fillStyle = base
    ctx.fillRect(0,0,size,size)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth=1
    for (let i=0;i<size;i+=16) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke() }
    for (let i=0;i<size;i+=16) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke() }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  _texCache.set(blockName, tex)
  return tex
}

// ─── Hotbar presets ───────────────────────────────────────────────────────────
const DEFAULT_HOTBAR = [
  'dirt','cobblestone','stone','copper_block','copper_wire',
  'power_source','flint_and_steel','glass','tnt','torch'
]

// ─── Inventory categories ─────────────────────────────────────────────────────
const INVENTORY_CATEGORIES = {
  'Natural': ['grass','dirt','stone','cobblestone','sand','gravel'],
  'Wood': ['oak_log','oak_planks','crafting_table','chest'],
  'Stone': ['stone_bricks','cobblestone','mossy_cobblestone','smooth_stone','andesite','diorite','granite'],
  'Ores': ['coal_ore','iron_ore','gold_ore','diamond_ore','copper_ore'],
  'Minerals': ['obsidian','bedrock','glowstone','sandstone'],
  'Tech': ['copper_block','copper_wire','power_source','flint_and_steel'],
  'Wool': ['wool','wool_red','wool_blue','wool_green'],
  'Nether': ['netherrack','lava_source','obsidian'],
  'Misc': ['glass','brick','tnt','furnace','snow','ice','water'],
}

// ─── Shared chunk material (vertex colors) ────────────────────────────────────
const CHUNK_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  side: THREE.FrontSide,
  roughness: 0.96,
  metalness: 0.02,
})

const SKY_TIMELINE = [
  { minute: 0, skyTop: '#07111f', skyBottom: '#16243d', fog: '#29415b', horizon: '#ffe3b3', sun: '#f3f4f6' },
  { minute: 360, skyTop: '#f59e0b', skyBottom: '#fed7aa', fog: '#fdba74', horizon: '#fff1c7', sun: '#ffd27a' },
  { minute: 480, skyTop: '#7dd3fc', skyBottom: '#cfeeff', fog: '#a7d8ff', horizon: '#f8fafc', sun: '#fff3c4' },
  { minute: 720, skyTop: '#60a5fa', skyBottom: '#d7f0ff', fog: '#9fd2ff', horizon: '#eef8ff', sun: '#fff0ae' },
  { minute: 1080, skyTop: '#fb7185', skyBottom: '#fda4af', fog: '#f59e9e', horizon: '#ffe7c2', sun: '#ffd1a1' },
  { minute: 1200, skyTop: '#091223', skyBottom: '#1f355c', fog: '#304663', horizon: '#b8d9ff', sun: '#dbeafe' },
  { minute: 1440, skyTop: '#07111f', skyBottom: '#16243d', fog: '#29415b', horizon: '#ffe3b3', sun: '#f3f4f6' },
]

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  const int = parseInt(value, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function mixHex(a, b, t) {
  const from = hexToRgb(a)
  const to = hexToRgb(b)
  const blend = (x, y) => Math.round(x + (y - x) * t)
  return `#${[blend(from.r, to.r), blend(from.g, to.g), blend(from.b, to.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function getSkyPalette(time = 720) {
  const minute = ((Number(time) || 0) % 1440 + 1440) % 1440
  let nextIndex = SKY_TIMELINE.findIndex((entry) => minute < entry.minute)
  if (nextIndex <= 0) nextIndex = 1
  const prev = SKY_TIMELINE[nextIndex - 1]
  const next = SKY_TIMELINE[nextIndex]
  const range = Math.max(next.minute - prev.minute, 1)
  const t = (minute - prev.minute) / range
  return {
    skyTop: mixHex(prev.skyTop, next.skyTop, t),
    skyBottom: mixHex(prev.skyBottom, next.skyBottom, t),
    fog: mixHex(prev.fog, next.fog, t),
    horizon: mixHex(prev.horizon, next.horizon, t),
    sun: mixHex(prev.sun, next.sun, t),
  }
}

function getThreatLevel(time, weather) {
  if (weather === '🌧️' && (time >= 1080 || time < 420)) return 'High'
  if (time >= 1200 || time < 360) return 'Elevated'
  if (weather === '🌧️') return 'Medium'
  return 'Low'
}

function EnvironmentShell({ time, weather }) {
  const palette = useMemo(() => getSkyPalette(time), [time])
  const cloudData = useMemo(() => ([
    { x: -64, y: 54, z: -40, s: [18, 5, 8] },
    { x: -18, y: 60, z: 26, s: [15, 4, 7] },
    { x: 34, y: 58, z: -18, s: [16, 5, 7] },
    { x: 70, y: 62, z: 34, s: [22, 6, 9] },
  ]), [])
  const cloudGroupRef = useRef(null)
  const weatherBoost = weather === '🌧️' ? 0.18 : 0

  useFrame((state) => {
    if (!cloudGroupRef.current) return
    cloudGroupRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.02) * 10
  })

  return (
    <>
      <fog attach="fog" args={[palette.fog, FOG_NEAR * 0.72, FOG_FAR * 1.08]} />
      <ambientLight intensity={0.48 + weatherBoost * 0.3} color={palette.horizon} />
      <hemisphereLight args={[palette.skyTop, '#355e3b', 0.7]} />
      <directionalLight position={[24, 34, 10]} intensity={1.15 - weatherBoost * 0.18} color={palette.sun} castShadow={false} />
      <directionalLight position={[-16, 12, -20]} intensity={0.28} color={palette.horizon} castShadow={false} />

      <mesh position={[0, 0, 0]} scale={1}>
        <sphereGeometry args={[FOG_FAR * 0.72, 32, 32]} />
        <meshBasicMaterial color={palette.skyBottom} side={THREE.BackSide} fog={false} />
      </mesh>

      <mesh position={[0, 22, -FOG_FAR * 0.15]} rotation={[-Math.PI / 2.12, 0, 0]}>
        <planeGeometry args={[FOG_FAR * 1.25, FOG_FAR * 0.7]} />
        <meshBasicMaterial color={palette.horizon} transparent opacity={0.18} fog={false} depthWrite={false} />
      </mesh>

      <group ref={cloudGroupRef}>
        {cloudData.map((cloud, index) => (
          <mesh key={`${cloud.x}-${cloud.z}`} position={[cloud.x, cloud.y + index * 0.6, cloud.z]}>
            <sphereGeometry args={[4.6, 12, 12]} />
            <meshStandardMaterial color="#f8fbff" transparent opacity={0.16 + weatherBoost * 0.08} emissive="#ffffff" emissiveIntensity={0.05} />
          </mesh>
        ))}
        {cloudData.map((cloud, index) => (
          <mesh key={`trail-${cloud.x}-${cloud.z}`} position={[cloud.x + 5, cloud.y - 0.8, cloud.z + 2]}>
            <boxGeometry args={cloud.s} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.11 + weatherBoost * 0.06} />
          </mesh>
        ))}
      </group>
    </>
  )
}

// ─── Worker bridge ────────────────────────────────────────────────────────────
class VCWorker {
  constructor() { this._w = null; this._p = new Map(); this._n = 0 }
  init(seed) {
    return new Promise((res, rej) => {
      try {
        this._w = new Worker('/voltcraft-worker.js')
        this._w.onmessage = e => {
          const { id } = e.data
          if (this._p.has(id)) { this._p.get(id).resolve(e.data); this._p.delete(id) }
        }
        this._w.onerror = e => rej(e)
        this._send('init', { seed }).then(res)
      } catch(e) { rej(e) }
    })
  }
  _send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._n
      this._p.set(id, { resolve, reject })
      this._w.postMessage({ type, id, ...payload })
    })
  }
  getChunkGeometry(cx, cz) { return this._send('getChunkGeometry', { cx, cz }) }
  breakBlock(x, y, z)      { return this._send('breakBlock', { x, y, z }) }
  placeBlock(x, y, z, blockName) { return this._send('placeBlock', { x, y, z, blockName }) }
  explodeTNT(x, y, z, radius) { return this._send('explodeTNT', { x, y, z, radius }) }
  getTerrainHeight(x, z)   { return this._send('getTerrainHeight', { x, z }) }
  getSurfaceAnchor(x, z)   { return this._send('getSurfaceAnchor', { x, z }) }
  setWorldChanges(changes)  { return this._send('setWorldChanges', { changes }) }
  terminate() { this._w?.terminate(); this._w = null; this._p.clear() }
}

// ─── LocalStorage world persistence ──────────────────────────────────────────
function listSavedWorlds() {
  const worlds = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(SAVE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(k))
        worlds.push({ id: k.slice(SAVE_KEY_PREFIX.length), name: data.name, seed: data.seed, savedAt: data.savedAt, changeCount: Object.keys(data.changes || {}).length })
      } catch {}
    }
  }
  return worlds.sort((a, b) => b.savedAt - a.savedAt)
}
function saveWorld(worldId, payload) {
  localStorage.setItem(SAVE_KEY_PREFIX + worldId, JSON.stringify({
    ...payload,
    savedAt: Date.now(),
  }))
}
function loadWorld(worldId) {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY_PREFIX + worldId)) } catch { return null }
}
function deleteWorld(worldId) { localStorage.removeItem(SAVE_KEY_PREFIX + worldId) }

// ─── WebGL Error Boundary ─────────────────────────────────────────────────────
class WebGLErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'#1a1a2e', color:'#fff', gap:12, padding:24, fontFamily:'monospace' }}>
        <div style={{ fontSize:28 }}>⚡</div>
        <div style={{ fontSize:18, fontWeight:'bold' }}>VoltCraft – WebGL Error</div>
        <div style={{ fontSize:13, color:'#9ca3af', textAlign:'center', maxWidth:320 }}>
          {this.state.err?.message || 'WebGL context could not be created.'}
        </div>
        <button onClick={() => this.setState({ err: null })} style={{ padding:'8px 20px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, cursor:'pointer' }}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ─── Block highlight box ──────────────────────────────────────────────────────
const HighlightBox = React.memo(({ position }) => {
  if (!position) return null
  return (
    <mesh position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} />
    </mesh>
  )
})

const ArmedTNTMarkers = React.memo(({ armedTnt }) => {
  const blinkOn = (Math.floor(Date.now() / 140) % 2) === 0
  return (
    <>
      {Object.values(armedTnt).map(({ x, y, z }) => (
        <mesh key={`${x},${y},${z}`} position={[x + 0.5, y + 0.5, z + 0.5]}>
          <boxGeometry args={[1.08, 1.08, 1.08]} />
          <meshBasicMaterial color={blinkOn ? '#ffdc5c' : '#ff5f36'} wireframe transparent opacity={0.9} />
        </mesh>
      ))}
    </>
  )
})

// ─── Player markers ───────────────────────────────────────────────────────────
const PlayerMarkers = React.memo(({ players, localId }) => (
  <>
    {Object.values(players).filter(p => p.userId !== localId).map(p => (
      <group key={p.userId} position={p.position || [0,10,0]}>
        <mesh castShadow>
          <boxGeometry args={[0.6, 1.8, 0.6]} />
          <meshStandardMaterial color={p.color || '#f472b6'} />
        </mesh>
      </group>
    ))}
  </>
))

// ─── Chunk mesh wrapper ───────────────────────────────────────────────────────
function ChunkMeshWrapper({ chunk, renderOrder = 0 }) {
  const meshRef = useRef(null)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !chunk?.positions) return
    const geo = mesh.geometry
    geo.getAttribute('position')?.dispose?.()
    geo.getAttribute('color')?.dispose?.()
    geo.getIndex()?.dispose?.()
    geo.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(chunk.colors, 3))
    geo.setIndex(new THREE.BufferAttribute(chunk.indices, 1))
    if (chunk?.bounds?.min && chunk?.bounds?.max) {
      geo.boundingBox = new THREE.Box3(
        new THREE.Vector3(...chunk.bounds.min),
        new THREE.Vector3(...chunk.bounds.max)
      )
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere())
    } else {
      geo.computeBoundingSphere()
      geo.computeBoundingBox()
    }
    mesh.userData.isChunk = true
  }, [chunk])

  useEffect(() => {
    if (meshRef.current) meshRef.current.renderOrder = renderOrder
  }, [renderOrder])

  // Cleanup geometry on unmount
  useEffect(() => {
    const mesh = meshRef.current
    return () => {
      mesh?.geometry?.dispose()
    }
  }, [])

  return (
    <mesh ref={meshRef} frustumCulled receiveShadow material={CHUNK_MAT}>
      <bufferGeometry />
    </mesh>
  )
}

// ─── World scene (3D only, no HTML) ──────────────────────────────────────────
function WorldScene({
  chunks, players, localId, armedTnt,
  localPosRef, chunkRef, setChunkState, setPosSample,
  selectedSlot,
  time, weather,
  mode, paused, setPaused, setPointerLocked,
  onInteract, onSelectSlot, onToggleInventory, onToggleWorldMenu,
  showInventory, showWorldMenu, hoveredRef, isOp, setBreakProgress,
  onJump,
}) {
  const keys      = useRef({})
  const selectedSlotRef = useRef(0)
  const yaw       = useRef(0)
  const pitch     = useRef(-0.2)
  const velY      = useRef(0)
  const onGround  = useRef(false)
  const lastSample = useRef(0)
  const lastVisibilitySample = useRef(0)
  const visibleChunkKeysRef = useRef([])
  const forwardDir = useRef(new THREE.Vector3())
  const rightDir   = useRef(new THREE.Vector3())
  const chunkToCamera = useRef(new THREE.Vector3())
  const chunkCenter = useRef(new THREE.Vector3())
  const viewDir    = useRef(new THREE.Vector3())
  const breakStateRef = useRef(null)
  const leftMouseHeldRef = useRef(false)
  const creativeFlightEnabled = useRef(false)
  const lastJumpTapAt = useRef(0)
  const jumpHeld = useRef(false)
  const { camera, gl } = useThree()
  const isCreative = mode === 'creative'
  const [visibleChunkKeys, setVisibleChunkKeys] = useState(() => Object.keys(chunks))

  useEffect(() => {
    camera.position.set(...localPosRef.current)
    camera.rotation.order = 'YXZ'
  }, [camera, localPosRef])

  useEffect(() => {
    const chunkKeys = Object.keys(chunks)
    visibleChunkKeysRef.current = chunkKeys
    setVisibleChunkKeys(chunkKeys)
  }, [chunks])

  useEffect(() => {
    selectedSlotRef.current = selectedSlot
  }, [selectedSlot])

  useEffect(() => {
    if (mode !== 'creative') {
      creativeFlightEnabled.current = false
      lastJumpTapAt.current = 0
      jumpHeld.current = false
    }
  }, [mode])

  // ── Input handlers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const blocked = () => showInventory || showWorldMenu || paused
    const clearKeys = () => {
      keys.current = {}
      breakStateRef.current = null
      leftMouseHeldRef.current = false
      jumpHeld.current = false
      setBreakProgress(null)
    }
    const startBreaking = (block) => {
      if (!block || mode !== 'survival') return
      breakStateRef.current = {
        key: `${block.x},${block.y},${block.z}`,
        block,
        startedAt: performance.now(),
        durationMs: getBreakDurationMs(block.name),
      }
      setBreakProgress({
        block,
        progress: 0,
        durationMs: getBreakDurationMs(block.name),
      })
    }
    const selectSlot = nextSlot => {
      selectedSlotRef.current = nextSlot
      onSelectSlot(nextSlot)
    }

    const kd = e => {
      if (shouldIgnoreActivityHotkey(e)) return
      if (e.repeat && ['KeyP', 'KeyE', 'KeyM'].includes(e.code)) return
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.current.fwd = true; break
        case 'KeyS': case 'ArrowDown':  keys.current.bwd = true; break
        case 'KeyA': case 'ArrowLeft':  keys.current.lft = true; break
        case 'KeyD': case 'ArrowRight': keys.current.rgt = true; break
        case 'Space': {
          const now = performance.now()
          if (mode === 'creative' && !jumpHeld.current) {
            if (now - lastJumpTapAt.current < 250) {
              creativeFlightEnabled.current = !creativeFlightEnabled.current
              velY.current = 0
            }
            lastJumpTapAt.current = now
            jumpHeld.current = true
          }
          if (document.pointerLockElement === gl.domElement) onJump?.()
          keys.current.jmp = true
          e.preventDefault()
          break
        }
        case 'ShiftLeft': case 'ShiftRight': keys.current.snk = true; break
        case 'ControlLeft': case 'ControlRight': keys.current.spr = true; break
        case 'Escape':
          // Escape only releases pointer lock (browser fullscreen exit)
          if (document.pointerLockElement) document.exitPointerLock()
          break
        case 'KeyP':
          // P = pause/settings toggle
          setPaused(p => !p)
          if (!paused) document.exitPointerLock?.()
          break
        case 'KeyE':
          if (!blocked()) onToggleInventory()
          break
        case 'KeyM':
          if (!blocked()) onToggleWorldMenu()
          break
        case 'Digit1': case 'Numpad1': selectSlot(0); break
        case 'Digit2': case 'Numpad2': selectSlot(1); break
        case 'Digit3': case 'Numpad3': selectSlot(2); break
        case 'Digit4': case 'Numpad4': selectSlot(3); break
        case 'Digit5': case 'Numpad5': selectSlot(4); break
        case 'Digit6': case 'Numpad6': selectSlot(5); break
        case 'Digit7': case 'Numpad7': selectSlot(6); break
        case 'Digit8': case 'Numpad8': selectSlot(7); break
        case 'Digit9': case 'Numpad9': selectSlot(8); break
        case 'Digit0': case 'Numpad0': selectSlot(9); break
      }
    }
    const ku = e => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.current.fwd = false; break
        case 'KeyS': case 'ArrowDown':  keys.current.bwd = false; break
        case 'KeyA': case 'ArrowLeft':  keys.current.lft = false; break
        case 'KeyD': case 'ArrowRight': keys.current.rgt = false; break
        case 'Space':
          keys.current.jmp = false
          jumpHeld.current = false
          break
        case 'ShiftLeft': case 'ShiftRight': keys.current.snk = false; break
        case 'ControlLeft': case 'ControlRight': keys.current.spr = false; break
      }
    }
    const mm = e => {
      if (document.pointerLockElement !== gl.domElement) return
      if (paused || showInventory || showWorldMenu) return
      yaw.current   -= e.movementX * 0.002
      pitch.current  = clamp(pitch.current - e.movementY * 0.002, -1.5, 1.5)
    }
    const md = e => {
      if (e.button === 0) leftMouseHeldRef.current = true
      if (document.pointerLockElement !== gl.domElement) {
        if (!paused && !showInventory && !showWorldMenu) {
          gl.domElement.requestPointerLock()
        }
        return
      }
      if (paused || showInventory || showWorldMenu) return
      if (!hoveredRef.current) return
      if (e.button === 0 && mode === 'survival') {
        startBreaking(hoveredRef.current)
        return
      }
      onInteract({ block: hoveredRef.current, button: e.button })
    }
    const mu = e => {
      if (e.button !== 0) return
      leftMouseHeldRef.current = false
      breakStateRef.current = null
      setBreakProgress(null)
    }
    const lc = () => {
      const locked = document.pointerLockElement === gl.domElement
      if (!locked) clearKeys()
      setPointerLocked(locked)
    }
    const wheel = e => {
      if (paused || showInventory || showWorldMenu) return
      const nextSlot = (selectedSlotRef.current + (e.deltaY > 0 ? 1 : -1) + 10) % 10
      selectSlot(nextSlot)
    }
    const preventContextMenu = e => e.preventDefault()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', clearKeys)
    window.addEventListener('mouseup', mu)
    gl.domElement.addEventListener('mousemove', mm)
    gl.domElement.addEventListener('mousedown', md)
    gl.domElement.addEventListener('wheel', wheel, { passive: true })
    gl.domElement.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('pointerlockchange', lc)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', clearKeys)
      window.removeEventListener('mouseup', mu)
      gl.domElement.removeEventListener('mousemove', mm)
      gl.domElement.removeEventListener('mousedown', md)
      gl.domElement.removeEventListener('wheel', wheel)
      gl.domElement.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('pointerlockchange', lc)
    }
  }, [gl.domElement, mode, paused, showInventory, showWorldMenu, onInteract, setBreakProgress, setPaused, setPointerLocked, onSelectSlot, onToggleInventory, onToggleWorldMenu, hoveredRef, onJump])

  // ── Game loop ───────────────────────────────────────────────────────────────
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05) // cap delta to avoid spiral of death
    const pos = localPosRef.current

    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    if (!paused && !showInventory && !showWorldMenu) {
      const spd = (isCreative ? CREATIVE_SPEED : SURVIVAL_SPEED) * (keys.current.spr ? SPRINT_MULT : 1)

      // Use the camera basis directly so movement always matches what the
      // player is looking at, independent of yaw sign conventions.
      camera.getWorldDirection(viewDir.current)
      viewDir.current.y = 0
      if (viewDir.current.lengthSq() > 0) {
        viewDir.current.normalize()
      } else {
        viewDir.current.set(0, 0, -1)
      }
      forwardDir.current.copy(viewDir.current)
      rightDir.current.set(
        -forwardDir.current.z,
        0,
        forwardDir.current.x
      )

      let moveX = 0, moveZ = 0
      if (keys.current.fwd) { moveX += forwardDir.current.x; moveZ += forwardDir.current.z }
      if (keys.current.bwd) { moveX -= forwardDir.current.x; moveZ -= forwardDir.current.z }
      if (keys.current.lft) { moveX -= rightDir.current.x; moveZ -= rightDir.current.z }
      if (keys.current.rgt) { moveX += rightDir.current.x; moveZ += rightDir.current.z }

      const len = Math.hypot(moveX, moveZ)
      const normX = len > 0 ? moveX / len : 0
      const normZ = len > 0 ? moveZ / len : 0

      const canFly = isCreative && creativeFlightEnabled.current
      if (canFly) {
        // ── Creative: no gravity, free fly ──────────────────────────────────
        const vert = (keys.current.jmp ? 1 : 0) - (keys.current.snk ? 1 : 0)
        pos[0] += normX * spd * dt
        pos[2] += normZ * spd * dt
        pos[1] = clamp(pos[1] + vert * spd * 0.7 * dt, 1, 256)
        velY.current = 0
        onGround.current = false
      } else {
        // ── Survival: AABB collision + gravity + swimming ────────────────────
        // Check water at current position
        const feetY = Math.floor(pos[1] - PLAYER_HEIGHT + 0.1)
        const midY  = Math.floor(pos[1] - PLAYER_HEIGHT * 0.5)
        const bx = Math.floor(pos[0])
        const bz = Math.floor(pos[2])
        const inWater = isWaterBlock(bx, feetY, bz) || isWaterBlock(bx, midY, bz)

        if (inWater) {
          // Swimming physics
          velY.current *= 0.82
          const swimVert = (keys.current.jmp ? 1 : 0) - (keys.current.snk ? 1 : 0)
          velY.current += swimVert * 18 * dt
          velY.current -= GRAVITY * 0.18 * dt
          velY.current = clamp(velY.current, -4.5, 4.5)

          const vel = [normX * spd * 0.6, velY.current, normZ * spd * 0.6]
          const result = resolveAABB(pos, vel, dt)

          pos[0] = result.pos[0]
          pos[1] = Math.max(1, result.pos[1])
          pos[2] = result.pos[2]
          velY.current = result.vel[1]
          onGround.current = result.onGround
        } else {
          // Gravity
          if (onGround.current) {
            velY.current = 0
            if (keys.current.jmp) {
              velY.current = JUMP_VEL
              onGround.current = false
            }
          } else {
            velY.current -= GRAVITY * dt
          }

          // Resolve AABB collision (handles X, Y, Z separately)
          const vel = [normX * spd, velY.current, normZ * spd]
          const result = resolveAABB(pos, vel, dt)

          pos[0] = result.pos[0]
          pos[1] = result.pos[1]
          pos[2] = result.pos[2]
          velY.current = result.vel[1]
          onGround.current = result.onGround

          // Safety floor
          pos[1] = Math.max(1, pos[1])
        }
      }
    }

    camera.position.set(pos[0], pos[1], pos[2])

    // ── Raycasting for block highlight ──
    if (document.pointerLockElement === gl.domElement && !paused && !showInventory && !showWorldMenu) {
      camera.getWorldDirection(viewDir.current)
      hoveredRef.current = raycastVoxel(
        { x: pos[0], y: pos[1], z: pos[2] },
        viewDir.current,
        isOp ? 20 : PLAYER_REACH
      )
    } else {
      hoveredRef.current = null
    }

    const activeBreak = breakStateRef.current
    if (!activeBreak && leftMouseHeldRef.current && mode === 'survival' && !paused && !showInventory && !showWorldMenu) {
      const hovered = hoveredRef.current
      const reach = isOp ? 20 : PLAYER_REACH
      const dist = hovered ? Math.sqrt((hovered.x + 0.5 - pos[0]) ** 2 + (hovered.y + 0.5 - pos[1]) ** 2 + (hovered.z + 0.5 - pos[2]) ** 2) : Infinity
      if (hovered && dist <= reach) {
        startBreaking(hovered)
      }
    } else if (activeBreak && mode === 'survival' && !paused && !showInventory && !showWorldMenu) {
      const hovered = hoveredRef.current
      const sameTarget = hovered && `${hovered.x},${hovered.y},${hovered.z}` === activeBreak.key
      const reach = isOp ? 20 : PLAYER_REACH
      const dist = hovered ? Math.sqrt((hovered.x + 0.5 - pos[0]) ** 2 + (hovered.y + 0.5 - pos[1]) ** 2 + (hovered.z + 0.5 - pos[2]) ** 2) : Infinity

      if (!sameTarget || dist > reach || document.pointerLockElement !== gl.domElement) {
        breakStateRef.current = null
        setBreakProgress(null)
      } else {
        const progress = clamp((performance.now() - activeBreak.startedAt) / activeBreak.durationMs, 0, 1)
        setBreakProgress({
          block: hovered,
          progress,
          durationMs: activeBreak.durationMs,
        })
        if (progress >= 1) {
          breakStateRef.current = null
          setBreakProgress(null)
          onInteract({ block: hovered, button: 0 })
        }
      }
    }

    // ── Position sampling + ground height update ──
    const now = performance.now()
    if (now - lastSample.current >= 100) {
      lastSample.current = now
      setPosSample([...pos])
      const cx = Math.floor(pos[0] / CHUNK_SIZE)
      const cz = Math.floor(pos[2] / CHUNK_SIZE)
      if (cx !== chunkRef.current.x || cz !== chunkRef.current.z) {
        chunkRef.current = { ...chunkRef.current, x: cx, z: cz }
        setChunkState({ x: cx, z: cz })
      }
    }

    if (now - lastVisibilitySample.current >= 120) {
      lastVisibilitySample.current = now
      const farCullSq = (FOG_FAR + CHUNK_SIZE * 2) * (FOG_FAR + CHUNK_SIZE * 2)
      const visible = []

      Object.entries(chunks).forEach(([key, chunk]) => {
        const bounds = chunk?.bounds
        if (!bounds?.min || !bounds?.max) {
          visible.push({ key, distSq: 0 })
          return
        }

        chunkCenter.current.set(
          (bounds.min[0] + bounds.max[0]) * 0.5,
          (bounds.min[1] + bounds.max[1]) * 0.5,
          (bounds.min[2] + bounds.max[2]) * 0.5
        )
        chunkToCamera.current.subVectors(chunkCenter.current, camera.position)
        const distSq = chunkToCamera.current.lengthSq()
        if (distSq > farCullSq) return

        visible.push({ key, distSq })
      })

      visible.sort((a, b) => a.distSq - b.distSq)
      const nextKeys = visible.length > 0
        ? visible.map(({ key }) => key)
        : Object.keys(chunks)
      const prevKeys = visibleChunkKeysRef.current
      const changed = nextKeys.length !== prevKeys.length || nextKeys.some((key, index) => key !== prevKeys[index])
      if (changed) {
        visibleChunkKeysRef.current = nextKeys
        setVisibleChunkKeys(nextKeys)
      }
    }

    // ── Ground height + water detection (every 200ms) ──
    // We use a simple inline approximation here since we can't call async from useFrame.
    // The worker is queried via a side-channel ref updated by a separate interval.
    // (See groundUpdateRef below – updated outside useFrame)
  })

  const pointerLocked = document.pointerLockElement === gl.domElement

  return (
    <>
      <EnvironmentShell time={time} weather={weather} />

      {visibleChunkKeys.map((key, index) => {
        const chunk = chunks[key]
        if (!chunk) return null
        return <ChunkMeshWrapper key={key} chunk={chunk} renderOrder={index} />
      })}
      <ArmedTNTMarkers armedTnt={armedTnt} />

      {pointerLocked && !paused && !showInventory && !showWorldMenu && (
        <HighlightBox position={hoveredRef.current} />
      )}
      <PlayerMarkers players={players} localId={localId} />
    </>
  )
}

// ─── HUD – rendered OUTSIDE Canvas via React portal ──────────────────────────
function VoltCraftHUD({
  mode, health, maxHealth, hunger, xp, level,
  currentChunk, pos, statusMsg,
  selectedSlot, hotbar, onSelectSlot,
  paused, onResume, onTogglePause,
  showInventory, onToggleInventory,
  inventoryCategory, onSetCategory, onPickBlock, onCraftRecipe,
  hoveredBlock, breakProgress, time, weather,
  worldName, savedAt, onSave,
  showWorldMenu, onToggleWorldMenu,
  savedWorlds, onLoadWorld, onNewWorld, onDeleteWorld,
  containerRef, isOp, onToggleOp, onSetMode,
  pointerLocked,
  resources, biomeInfo, discoveredBiomes,
  activeQuest, questCompletion,
  audioEnabled, onToggleAudio,
  questBanner,
}) {
  const [hotbarHover, setHotbarHover] = useState(-1)
  const hpPct = health / maxHealth
  const hpColor = hpPct > 0.6 ? '#4ade80' : hpPct > 0.3 ? '#fbbf24' : '#ef4444'
  const hungerPct = hunger / 20
  const h = Math.floor(time / 60), m = time % 60
  const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  const isDay = h >= 6 && h < 20
  const skyColor = isDay ? '#87ceeb' : '#0a0a2e'
  const isSurvivalMode = mode === 'survival'
  const survivalFieldKit = [...new Set([
    ...hotbar.filter(Boolean),
    'torch', 'oak_planks', 'cobblestone', 'crafting_table', 'furnace',
    'glass', 'tnt', 'copper_wire', 'power_source',
  ])].slice(0, 14)
  const survivalCrafts = SURVIVAL_RECIPES
  const trackedResources = getTopResources(resources, 12)
  const activeQuestObjectives = questCompletion?.objectives || []
  const threatLevel = getThreatLevel(time, weather)

  if (!containerRef.current) return null

  const hud = (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:10, overflow:'hidden', fontFamily:'system-ui,-apple-system,sans-serif' }}>

      {/* ── Crosshair (always visible when playing) ── */}
      {!paused && !showInventory && !showWorldMenu && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
          <div style={{ position:'absolute', width:20, height:2, background:'rgba(255,255,255,0.9)', top:'50%', left:'50%', transform:'translate(-50%,-50%)', boxShadow:'0 0 2px rgba(0,0,0,0.8)' }} />
          <div style={{ position:'absolute', width:2, height:20, background:'rgba(255,255,255,0.9)', top:'50%', left:'50%', transform:'translate(-50%,-50%)', boxShadow:'0 0 2px rgba(0,0,0,0.8)' }} />
        </div>
      )}

      {/* ── Click to play prompt ── */}
      {!paused && !showInventory && !showWorldMenu && !pointerLocked && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'rgba(0,0,0,0.7)', color:'#fff', padding:'12px 24px', borderRadius:8, fontSize:15, textAlign:'center', pointerEvents:'none', marginTop:40 }}>
          Click to play · P = pause
        </div>
      )}

      {/* ── Stats panel (top-left) ── */}
      {!paused && !showInventory && !showWorldMenu && (
        <div style={{ position:'absolute', top:12, left:12, width:210, background:'rgba(13,17,23,0.88)', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', color:'#f9fafb', pointerEvents:'auto' }}>
          <div style={{ fontSize:14, color:'#38bdf8', fontWeight:'bold', marginBottom:4 }}>⚡ VoltCraft {isOp && <span style={{color:'#fbbf24',fontSize:11}}>OP</span>}</div>
          <div style={{ height:1, background:'#1f2937', margin:'4px 0 6px' }} />
          {/* HP */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
            <span style={{ fontSize:11, color:'#9ca3af', width:32 }}>❤</span>
            <div style={{ flex:1, height:7, background:'#1f2937', borderRadius:2, overflow:'hidden' }}>
              <div style={{ width:`${hpPct*100}%`, height:'100%', background:hpColor, transition:'width 0.3s' }} />
            </div>
            <span style={{ fontSize:10, color:hpColor, width:28, textAlign:'right' }}>{health}/{maxHealth}</span>
          </div>
          {/* Hunger (survival only) */}
          {mode === 'survival' && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:11, color:'#9ca3af', width:32 }}>🍖</span>
              <div style={{ flex:1, height:7, background:'#1f2937', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:`${hungerPct*100}%`, height:'100%', background:'#f97316', transition:'width 0.3s' }} />
              </div>
              <span style={{ fontSize:10, color:'#f97316', width:28, textAlign:'right' }}>{Math.round(hunger)}/20</span>
            </div>
          )}
          {/* XP */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
            <span style={{ fontSize:11, color:'#9ca3af', width:32 }}>✨</span>
            <div style={{ flex:1, height:7, background:'#1f2937', borderRadius:2, overflow:'hidden' }}>
              <div style={{ width:`${xp}%`, height:'100%', background:'#a855f7', transition:'width 0.3s' }} />
            </div>
            <span style={{ fontSize:10, color:'#a855f7', width:28, textAlign:'right' }}>Lv{level}</span>
          </div>
          <div style={{ height:1, background:'#1f2937', margin:'4px 0 6px' }} />
          <div style={{ fontSize:10, color:'#e5e7eb', lineHeight:1.8 }}>
            <div>Mode: <span style={{color:'#38bdf8'}}>{mode}</span></div>
            <div>Pos: {pos.map(v=>Math.round(v)).join(', ')}</div>
            <div>Chunk: {currentChunk.x},{currentChunk.z}</div>
            <div style={{ color: isDay ? '#fbbf24' : '#818cf8' }}>{timeStr} {weather}</div>
            {biomeInfo?.biome && <div>Biome: <span style={{ color:'#86efac' }}>{formatItemLabel(biomeInfo.biome)}</span></div>}
            <div>Threat: <span style={{ color: threatLevel === 'High' ? '#f87171' : threatLevel === 'Elevated' ? '#fbbf24' : '#93c5fd' }}>{threatLevel}</span></div>
          </div>
          <div style={{ height:1, background:'#1f2937', margin:'4px 0 4px' }} />
          <div style={{ fontSize:10, color:'#6b7280', minHeight:14 }}>{statusMsg}</div>
        </div>
      )}

      {/* ── World name + save (top-right) ── */}
      {!paused && !showInventory && !showWorldMenu && (
        <div style={{ position:'absolute', top:12, right:12, width:170, background:'rgba(13,17,23,0.88)', border:'1px solid #1f2937', borderRadius:8, padding:'10px 12px', color:'#f9fafb', pointerEvents:'auto' }}>
          <div style={{ fontSize:12, fontWeight:'bold', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{worldName}</div>
          <div style={{ fontSize:10, color:'#6b7280', marginBottom:8 }}>{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Unsaved'}</div>
          {biomeInfo?.biome && (
            <div style={{ fontSize:10, color:'#93c5fd', marginBottom:6 }}>
              {formatItemLabel(biomeInfo.biome)} · {WORLD_HINTS[biomeInfo.biome] || 'Chart the area and keep moving.'}
            </div>
          )}
          <button onClick={onSave} style={{ width:'100%', padding:'5px 0', background:'#14532d', color:'#fff', border:'none', borderRadius:4, fontSize:11, cursor:'pointer', marginBottom:4 }}>💾 Save</button>
          <button onClick={onToggleWorldMenu} style={{ width:'100%', padding:'5px 0', background:'#1f2937', color:'#9ca3af', border:'none', borderRadius:4, fontSize:11, cursor:'pointer' }}>🌍 Worlds (M)</button>
        </div>
      )}

      {/* ── Hovered block tooltip ── */}
      {!paused && !showInventory && !showWorldMenu && hoveredBlock && (
        <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(13,17,23,0.9)', border:'1px solid #374151', borderRadius:6, padding:'5px 14px', color:'#f9fafb', textAlign:'center', whiteSpace:'nowrap', pointerEvents:'none' }}>
          <div style={{ fontSize:12, fontWeight:'bold' }}>{(hoveredBlock.name || '').replace(/_/g,' ')}</div>
          <div style={{ fontSize:10, color:'#6b7280' }}>{hoveredBlock.x}, {hoveredBlock.y}, {hoveredBlock.z}</div>
          {breakProgress && breakProgress.block && `${breakProgress.block.x},${breakProgress.block.y},${breakProgress.block.z}` === `${hoveredBlock.x},${hoveredBlock.y},${hoveredBlock.z}` && (
            <div style={{ marginTop:6, width:120, height:6, background:'rgba(31,41,55,0.9)', borderRadius:999, overflow:'hidden' }}>
              <div style={{ width:`${Math.round(breakProgress.progress * 100)}%`, height:'100%', background:'linear-gradient(90deg,#f59e0b,#ef4444)', transition:'width 0.05s linear' }} />
            </div>
          )}
        </div>
      )}

      {!paused && !showInventory && !showWorldMenu && questBanner && (
        <div style={{ position:'absolute', top:72, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(90deg, rgba(30,41,59,0.92), rgba(22,101,52,0.92))', border:'1px solid rgba(134,239,172,0.35)', borderRadius:999, padding:'8px 16px', color:'#f8fafc', fontSize:12, pointerEvents:'none', boxShadow:'0 10px 28px rgba(0,0,0,0.25)' }}>
          {questBanner}
        </div>
      )}

      {!paused && !showInventory && !showWorldMenu && activeQuest && (
        <div style={{ position:'absolute', right:12, bottom:92, width:260, background:'rgba(13,17,23,0.9)', border:'1px solid #263244', borderRadius:10, padding:'10px 12px', color:'#f9fafb', pointerEvents:'auto' }}>
          <div style={{ fontSize:11, color:'#93c5fd', letterSpacing:0.4, textTransform:'uppercase' }}>Expedition Journal</div>
          <div style={{ fontSize:15, fontWeight:'bold', margin:'3px 0 4px' }}>{activeQuest.title}</div>
          <div style={{ fontSize:10, color:'#94a3b8', lineHeight:1.5, marginBottom:8 }}>{activeQuest.description}</div>
          <div style={{ display:'grid', gap:6 }}>
            {activeQuestObjectives.map((objective) => (
              <div key={`${activeQuest.id}-${objective.label}`} style={{ padding:'6px 8px', borderRadius:8, background:'rgba(15,23,42,0.7)', border:'1px solid rgba(148,163,184,0.12)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:11 }}>
                  <span style={{ color: objective.done ? '#86efac' : '#e5e7eb' }}>{objective.label}</span>
                  <strong style={{ color: objective.done ? '#86efac' : '#fbbf24' }}>{Math.min(objective.value, objective.target)}/{objective.target}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!paused && !showInventory && !showWorldMenu && isSurvivalMode && trackedResources.length > 0 && (
        <div style={{ position:'absolute', left:12, bottom:110, width:220, background:'rgba(13,17,23,0.9)', border:'1px solid #263244', borderRadius:10, padding:'10px 12px', color:'#f9fafb', pointerEvents:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, color:'#fbbf24', letterSpacing:0.4, textTransform:'uppercase' }}>Satchel</div>
            <div style={{ fontSize:10, color:'#6b7280' }}>{discoveredBiomes.length} biomes</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:6 }}>
            {trackedResources.map(([item, count]) => (
              <div key={item} style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:10, padding:'5px 6px', borderRadius:6, background:'rgba(15,23,42,0.65)' }}>
                <span style={{ color:'#cbd5e1' }}>{formatItemLabel(item)}</span>
                <strong style={{ color:'#f8fafc' }}>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hotbar (bottom-center) ── */}
      {!paused && !showInventory && !showWorldMenu && (
        <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          {/* Block name tooltip */}
          {hotbarHover >= 0 && hotbar[hotbarHover] && (
            <div style={{ background:'rgba(13,17,23,0.9)', color:'#f9fafb', fontSize:11, padding:'3px 10px', borderRadius:4, border:'1px solid #374151' }}>
              {hotbar[hotbarHover].replace(/_/g,' ')}
            </div>
          )}
          <div style={{ display:'flex', gap:3, background:'rgba(13,17,23,0.92)', border:'1px solid #374151', borderRadius:8, padding:4, pointerEvents:'auto' }}>
            {hotbar.map((item, i) => (
              <button
                key={i}
                onClick={() => onSelectSlot(i)}
                onMouseEnter={() => setHotbarHover(i)}
                onMouseLeave={() => setHotbarHover(-1)}
                style={{
                  width:44, height:46,
                  background: selectedSlot === i ? 'rgba(29,78,216,0.6)' : 'rgba(31,41,55,0.6)',
                  border: selectedSlot === i ? '2px solid #60a5fa' : '2px solid rgba(55,65,81,0.5)',
                  borderRadius:4, cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
                  position:'relative',
                }}
              >
                <div style={{
                  width:24, height:24,
                  background: BLOCK_COLORS[item] || '#555',
                  borderRadius:2,
                  border:'1px solid rgba(255,255,255,0.2)',
                  imageRendering:'pixelated',
                }} />
                <span style={{ fontSize:9, color: selectedSlot===i ? '#fff' : '#6b7280' }}>{i+1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Inventory panel ── */}
      {showInventory && !paused && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', pointerEvents:'auto' }}>
          {isSurvivalMode ? (
            <div style={{
              width: Math.min(window.innerWidth - 40, 760),
              maxHeight: Math.min(window.innerHeight - 40, 620),
              background: 'linear-gradient(180deg, rgba(43,28,18,0.96), rgba(18,12,9,0.98))',
              border: '1px solid rgba(180,120,62,0.35)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
              borderRadius: 18,
              padding: 18,
              overflow: 'auto',
              color: '#f6ead9',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:20, color:'#f7d7a8', fontWeight:'bold', letterSpacing:0.4 }}>Survival Satchel</div>
                  <div style={{ fontSize:11, color:'rgba(246,234,217,0.72)', marginTop:3 }}>
                    Loadout, field kit, and quick crafting without the creative catalog.
                  </div>
                </div>
                <button onClick={onToggleInventory} style={{ padding:'6px 12px', background:'#7c2d12', color:'#fff7ed', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, cursor:'pointer', fontSize:12 }}>Close (E)</button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.45fr) minmax(260px,1fr)', gap:14 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ padding:14, borderRadius:14, background:'rgba(120,74,37,0.22)', border:'1px solid rgba(214,164,107,0.22)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ fontSize:13, fontWeight:'bold', color:'#fde7c3' }}>Hotbar Loadout</div>
                      <div style={{ fontSize:10, color:'rgba(246,234,217,0.62)' }}>Slot {selectedSlot + 1} active</div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,minmax(0,1fr))', gap:8 }}>
                      {hotbar.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => onSelectSlot(i)}
                          style={{
                            padding:'10px 6px',
                            minHeight:78,
                            background: selectedSlot === i ? 'rgba(217,119,6,0.28)' : 'rgba(17,24,39,0.42)',
                            border: selectedSlot === i ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius:10,
                            color:'#f8fafc',
                            cursor:'pointer',
                            display:'flex',
                            flexDirection:'column',
                            alignItems:'center',
                            justifyContent:'center',
                            gap:6,
                          }}
                        >
                          <div style={{ width:30, height:30, background: BLOCK_COLORS[item] || '#555', borderRadius:6, border:'1px solid rgba(255,255,255,0.16)' }} />
                          <div style={{ fontSize:10, lineHeight:1.2 }}>{(item || 'empty').replace(/_/g,' ')}</div>
                          <div style={{ fontSize:9, color: selectedSlot === i ? '#fde68a' : 'rgba(246,234,217,0.55)' }}>{i + 1}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:14, borderRadius:14, background:'rgba(17,24,39,0.35)', border:'1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:'bold', color:'#fde7c3', marginBottom:10 }}>Field Kit</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(88px,1fr))', gap:8 }}>
                      {survivalFieldKit.map(block => {
                        const count = resources?.[block] || 0
                        const unavailable = count <= 0
                        return (
                        <button
                          key={block}
                          onClick={() => onPickBlock(block)}
                          disabled={unavailable}
                          style={{
                            padding:'9px 6px',
                            background: unavailable ? 'rgba(12,18,28,0.28)' : 'rgba(12,18,28,0.54)',
                            border:'1px solid rgba(255,255,255,0.08)',
                            borderRadius:10,
                            color: unavailable ? 'rgba(246,234,217,0.42)' : '#f6ead9',
                            fontSize:10,
                            cursor: unavailable ? 'not-allowed' : 'pointer',
                            textAlign:'center',
                            display:'flex',
                            flexDirection:'column',
                            alignItems:'center',
                            gap:5,
                          }}
                        >
                          <div style={{ width:28, height:28, background: BLOCK_COLORS[block] || '#555', borderRadius:6, border:'1px solid rgba(255,255,255,0.12)' }} />
                          <span>{block.replace(/_/g,' ')}</span>
                          <strong style={{ fontSize:9, color: unavailable ? 'rgba(246,234,217,0.35)' : '#fbbf24' }}>x{count}</strong>
                        </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ padding:14, borderRadius:14, background:'rgba(17,24,39,0.36)', border:'1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:'bold', color:'#fde7c3', marginBottom:10 }}>Camp Crafting</div>
                    <div style={{ display:'grid', gap:8 }}>
                      {survivalCrafts.map(recipe => {
                        const craftable = canCraftRecipe(recipe, resources)
                        const missing = getMissingIngredients(recipe, resources)
                        return (
                        <button
                          key={recipe.key}
                          onClick={() => onCraftRecipe(recipe)}
                          disabled={!craftable}
                          style={{
                            padding:'10px 11px',
                            background: craftable ? 'rgba(12,18,28,0.58)' : 'rgba(12,18,28,0.34)',
                            border:'1px solid rgba(255,255,255,0.08)',
                            borderRadius:10,
                            color:'#f8fafc',
                            textAlign:'left',
                            cursor: craftable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                            <div style={{ width:18, height:18, borderRadius:5, background: BLOCK_COLORS[recipe.output] || '#555', border:'1px solid rgba(255,255,255,0.12)' }} />
                            <span style={{ fontSize:11, fontWeight:'bold' }}>{recipe.label}</span>
                          </div>
                          <div style={{ fontSize:9, color:'rgba(246,234,217,0.64)', lineHeight:1.45 }}>{recipe.description}</div>
                          <div style={{ fontSize:9, color:'#fbbf24', marginTop:6 }}>
                            {recipe.ingredients.map(({ item, count }) => `${count} ${formatItemLabel(item)}`).join(' + ')}
                          </div>
                          <div style={{ fontSize:9, color: craftable ? '#86efac' : '#fca5a5', marginTop:6 }}>
                            {craftable ? `Ready · yields ${recipe.outputCount || 1}` : `Missing ${missing.join(', ')}`}
                          </div>
                        </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ padding:14, borderRadius:14, background:'rgba(120,74,37,0.22)', border:'1px solid rgba(214,164,107,0.22)' }}>
                    <div style={{ fontSize:13, fontWeight:'bold', color:'#fde7c3', marginBottom:10 }}>Field Status</div>
                    <div style={{ display:'grid', gap:8, fontSize:11, color:'#f6ead9' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span>Health</span>
                        <strong style={{ color: hpColor }}>{health}/{maxHealth}</strong>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span>Hunger</span>
                        <strong style={{ color:'#fb923c' }}>{Math.round(hunger)}/20</strong>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span>Level</span>
                        <strong style={{ color:'#c084fc' }}>Lv {level}</strong>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span>Time</span>
                        <strong style={{ color:'#93c5fd' }}>{timeStr} {weather}</strong>
                      </div>
                    </div>
                    <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'12px 0' }} />
                    <div style={{ fontSize:10, color:'rgba(246,234,217,0.68)', lineHeight:1.6 }}>
                      Survival is now supply-driven: salvage blocks, keep your satchel stocked, and only slot what you actually carry.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ width:Math.min(window.innerWidth-40,660), maxHeight:Math.min(window.innerHeight-40,540), background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:16, overflow:'auto', color:'#f9fafb' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:18, color:'#38bdf8', fontWeight:'bold' }}>⚡ Inventory</div>
                <button onClick={onToggleInventory} style={{ padding:'4px 12px', background:'#7f1d1d', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:12 }}>✕ Close (E)</button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                {Object.keys(INVENTORY_CATEGORIES).map(cat => (
                  <button key={cat} onClick={() => onSetCategory(cat)} style={{ padding:'4px 10px', background: inventoryCategory===cat ? '#1d4ed8' : '#1f2937', color:'#e5e7eb', border:'none', borderRadius:4, fontSize:11, cursor:'pointer' }}>{cat}</button>
                ))}
              </div>
              <div style={{ height:1, background:'#1f2937', marginBottom:10 }} />
              <div style={{ marginBottom:12, padding:'10px 12px', background:'rgba(17,24,39,0.82)', border:'1px solid #243244', borderRadius:8 }}>
                <div style={{ fontSize:12, fontWeight:'bold', color:'#f9fafb', marginBottom:8 }}>Crafting Bench</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(146px,1fr))', gap:8 }}>
                  {CRAFTING_RECIPES.map(recipe => (
                    <button
                      key={recipe.key}
                      onClick={() => onCraftRecipe(recipe)}
                      style={{
                        padding:'10px 10px 9px',
                        background:'rgba(15,23,42,0.92)',
                        border:'1px solid #334155',
                        borderRadius:8,
                        color:'#e5e7eb',
                        textAlign:'left',
                        cursor:'pointer',
                      }}
                    >
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <div style={{ width:18, height:18, borderRadius:4, background: BLOCK_COLORS[recipe.output] || '#555', border:'1px solid rgba(255,255,255,0.15)' }} />
                        <span style={{ fontSize:11, fontWeight:'bold', color:'#f8fafc' }}>{recipe.label}</span>
                      </div>
                      <div style={{ fontSize:9, color:'#94a3b8', lineHeight:1.4, minHeight:26 }}>{recipe.description}</div>
                      <div style={{ fontSize:9, color:'#fbbf24', margin:'6px 0 8px' }}>
                        {recipe.ingredients.join(' + ').replaceAll('_', ' ')}
                      </div>
                      <div style={{ fontSize:10, color:'#38bdf8' }}>Load into selected slot</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(72px,1fr))', gap:6 }}>
                {(INVENTORY_CATEGORIES[inventoryCategory]||[]).map(block => (
                  <button key={block} onClick={() => onPickBlock(block)} style={{
                    padding:'8px 4px', background: BLOCK_COLORS[block] ? BLOCK_COLORS[block]+'33' : '#1f2937',
                    border:'1px solid #374151', borderRadius:6, color:'#e5e7eb', fontSize:10, cursor:'pointer', textAlign:'center', lineHeight:1.4,
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                  }}>
                    <div style={{ width:28, height:28, background: BLOCK_COLORS[block]||'#555', borderRadius:3, border:'1px solid rgba(255,255,255,0.15)', imageRendering:'pixelated' }} />
                    <span style={{ fontSize:9 }}>{block.replace(/_/g,' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── World menu ── */}
      {showWorldMenu && !paused && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', pointerEvents:'auto' }}>
          <div style={{ width:520, maxHeight:500, background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:16, overflow:'auto', color:'#f9fafb' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:18, color:'#38bdf8', fontWeight:'bold' }}>🌍 Worlds</div>
              <button onClick={onToggleWorldMenu} style={{ padding:'4px 12px', background:'#374151', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:12 }}>✕ Close (M)</button>
            </div>
            <button onClick={onNewWorld} style={{ padding:'8px 20px', background:'#14532d', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', marginBottom:12, fontSize:13 }}>+ New World</button>
            {discoveredBiomes.length > 0 && (
              <div style={{ marginBottom:12, padding:'10px 12px', background:'rgba(15,23,42,0.72)', border:'1px solid #243244', borderRadius:8 }}>
                <div style={{ fontSize:12, fontWeight:'bold', color:'#f8fafc', marginBottom:6 }}>Surveyed Biomes</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {discoveredBiomes.map((biome) => (
                    <span key={biome} style={{ fontSize:10, color:'#86efac', padding:'4px 8px', borderRadius:999, background:'rgba(20,83,45,0.32)' }}>
                      {formatItemLabel(biome)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {savedWorlds.length === 0 && <div style={{ color:'#6b7280', fontSize:13, marginBottom:12 }}>No saved worlds yet. Start playing and save!</div>}
            {savedWorlds.map(w => (
              <div key={w.id} style={{ display:'flex', alignItems:'center', background:'#1f2937', borderRadius:6, padding:'10px 12px', marginBottom:6, gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:'bold' }}>{w.name}</div>
                  <div style={{ fontSize:11, color:'#6b7280' }}>{w.changeCount} changes · {new Date(w.savedAt).toLocaleDateString()}</div>
                </div>
                <button onClick={() => onLoadWorld(w.id)} style={{ padding:'5px 12px', background:'#1d4ed8', color:'#fff', border:'none', borderRadius:4, fontSize:12, cursor:'pointer' }}>Load</button>
                <button onClick={() => onDeleteWorld(w.id)} style={{ padding:'5px 12px', background:'#7f1d1d', color:'#fff', border:'none', borderRadius:4, fontSize:12, cursor:'pointer' }}>Del</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pause / Settings menu ── */}
      {paused && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.65)', pointerEvents:'auto' }}>
          <div style={{ width:360, background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:24, color:'#f9fafb' }}>
            <div style={{ fontSize:22, color:'#38bdf8', fontWeight:'bold', marginBottom:4 }}>⚡ VoltCraft</div>
            <div style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>Paused · Press P to resume</div>
            <div style={{ height:1, background:'#1f2937', marginBottom:14 }} />

            {/* Controls reference */}
            <div style={{ fontSize:12, color:'#9ca3af', lineHeight:2, marginBottom:12 }}>
              {[
                ['WASD / Arrows','Move'],
                ['Mouse','Look around'],
                ['Left Click','Break block'],
                ['Right Click','Place block'],
                ['Space','Jump / double-tap in Creative to toggle flight'],
                ['Shift','Sneak / Fly down when flight is on'],
                ['Ctrl','Sprint'],
                ['1–0','Hotbar slots'],
                ['Scroll','Cycle hotbar'],
                ['E','Inventory'],
                ['M','World menu'],
                ['P','Pause / Settings'],
                ['Esc','Release mouse'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', gap:8 }}>
                  <span style={{ color:'#60a5fa', minWidth:120 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ height:1, background:'#1f2937', marginBottom:14 }} />

            {/* Game mode toggle */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>Game Mode</div>
              <div style={{ display:'flex', gap:6 }}>
                {['creative','survival'].map(m => (
                  <button key={m} onClick={() => onSetMode(m)} style={{
                    flex:1, padding:'7px 0', background: mode===m ? '#1d4ed8' : '#1f2937',
                    color: mode===m ? '#fff' : '#9ca3af', border:'none', borderRadius:4, fontSize:12, cursor:'pointer', fontWeight: mode===m ? 'bold' : 'normal',
                  }}>{m.charAt(0).toUpperCase()+m.slice(1)}</button>
                ))}
              </div>
            </div>

            {/* OP toggle */}
            <div style={{ marginBottom:14 }}>
              <button onClick={onToggleOp} style={{
                width:'100%', padding:'7px 0',
                background: isOp ? '#78350f' : '#1f2937',
                color: isOp ? '#fbbf24' : '#9ca3af',
                border:'none', borderRadius:4, fontSize:12, cursor:'pointer',
              }}>
                {isOp ? '⭐ OP Mode: ON (unlimited reach)' : '☆ Enable OP Mode'}
              </button>
            </div>

            <div style={{ marginBottom:14 }}>
              <button onClick={onToggleAudio} style={{
                width:'100%', padding:'7px 0',
                background: audioEnabled ? '#14532d' : '#1f2937',
                color: audioEnabled ? '#86efac' : '#9ca3af',
                border:'none', borderRadius:4, fontSize:12, cursor:'pointer',
              }}>
                {audioEnabled ? '🔊 Synth Audio: ON' : '🔈 Synth Audio: OFF'}
              </button>
            </div>

            <div style={{ height:1, background:'#1f2937', marginBottom:14 }} />
            <button onClick={onResume} style={{ width:'100%', padding:'12px 0', background:'#1d4ed8', color:'#fff', border:'none', borderRadius:6, fontSize:15, fontWeight:'bold', cursor:'pointer' }}>
              ▶  Resume (P)
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(hud, containerRef.current)
}

// ─── Main component ───────────────────────────────────────────────────────────
const VoltCraftActivity = ({ sdk, currentUser }) => {
  const userId    = currentUser?.id       || 'guest'
  const username  = currentUser?.username || 'Guest'
  const userColor = currentUser?.color    || '#38bdf8'

  const localPosRef   = useRef([0, 16, 0])
  const chunkRef      = useRef({ x: 0, z: 0, groundY: 14 })
  const workerRef     = useRef(null)
  const changesRef    = useRef({})
  const hoveredRef    = useRef(null)
  const worldIdRef    = useRef(`world_${Date.now()}`)
  const worldSeedRef  = useRef(Math.floor(Math.random() * 999999))
  const containerRef  = useRef(null)
  const loadQueueRef  = useRef([])
  const loadingRef    = useRef(false)
  const chunksRef     = useRef({})  // mirror of chunks state for sync access
  const lastServerChangesRef = useRef({})
  const queuedKeysRef = useRef(new Set())
  const inflightKeysRef = useRef(new Set())
  const dirtyChunkKeysRef = useRef(new Set())
  const audioRef      = useRef(null)
  const lastTravelSampleRef = useRef([0, 16, 0])
  const deathLockRef = useRef(false)
  const playersRef = useRef({})

  const [chunks,        setChunks]        = useState({})
  const [players,       setPlayers]       = useState({})
  const [isLoading,     setIsLoading]     = useState(true)
  const [loadingPct,    setLoadingPct]    = useState(0)
  const [loadingMsg,    setLoadingMsg]    = useState('Starting worker...')
  const [mode,          setMode]          = useState('creative')
  const [isOp,          setIsOp]          = useState(false)
  const [selectedSlot,  setSelectedSlot]  = useState(0)
  const [hotbar,        setHotbar]        = useState(DEFAULT_HOTBAR)
  const [statusMsg,     setStatusMsg]     = useState('Welcome to VoltCraft! Click to play.')
  const [health,        setHealth]        = useState(20)
  const [hunger,        setHunger]        = useState(20)
  const [xp,            setXp]            = useState(0)
  const [level,         setLevel]         = useState(1)
  const [currentChunk,  setCurrentChunk]  = useState({ x: 0, z: 0 })
  const [posSample,     setPosSample]     = useState([0, 16, 0])
  const [paused,        setPaused]        = useState(true)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [workerReady,   setWorkerReady]   = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showWorldMenu, setShowWorldMenu] = useState(false)
  const [invCategory,   setInvCategory]   = useState('Natural')
  const [savedWorlds,   setSavedWorlds]   = useState([])
  const [worldName,     setWorldName]     = useState('New World')
  const [savedAt,       setSavedAt]       = useState(null)
  const [time,          setTime]          = useState(480)
  const [weather,       setWeather]       = useState('☀️')
  const [hoveredBlock,  setHoveredBlock]  = useState(null)
  const [breakProgress, setBreakProgress] = useState(null)
  const [armedTnt,      setArmedTnt]      = useState({})
  const [resources,     setResources]     = useState(() => createStarterResources())
  const [careerStats,   setCareerStats]   = useState(() => ({
    collected: {},
    crafted: {},
    placed: {},
    maxHeight: 16,
    travelDistance: 0,
  }))
  const [biomeInfo,     setBiomeInfo]     = useState(null)
  const [discoveredBiomes, setDiscoveredBiomes] = useState([])
  const [questIndex,    setQuestIndex]    = useState(0)
  const [questBanner,   setQuestBanner]   = useState('')

  useEffect(() => {
    playersRef.current = players
  }, [players])
  const [audioEnabled,  setAudioEnabled]  = useState(true)
  const armedTntTimersRef = useRef(new Map())

  const discoveredBiomeSet = useMemo(() => new Set(discoveredBiomes), [discoveredBiomes])
  const questStats = useMemo(() => ({
    ...careerStats,
    discoveredBiomes: discoveredBiomeSet,
  }), [careerStats, discoveredBiomeSet])
  const activeQuest = QUESTS[questIndex] || null
  const questCompletion = useMemo(() => (
    activeQuest ? getQuestCompletion(activeQuest, questStats) : null
  ), [activeQuest, questStats])
  const activeQuestDone = !!questCompletion?.done

  const findSafeSpawn = useCallback(async (worker) => {
    const tryCandidate = async (x, z) => {
      const res = await worker.getSurfaceAnchor(x, z)
      const height = res.groundY ?? res.terrainHeight ?? 14
      return { x, z, height, submerged: !!res.submerged }
    }

    for (let radius = 0; radius <= 12; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue
          const candidate = await tryCandidate(dx * 16, dz * 16)
          if (!candidate.submerged && candidate.height > 12) return candidate
        }
      }
    }

    return tryCandidate(0, 0)
  }, [])

  const applySpawn = useCallback((x, z, groundY) => {
    const safeY = groundY + PLAYER_HEIGHT + 1.75
    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkZ = Math.floor(z / CHUNK_SIZE)
    localPosRef.current = [x + 0.5, safeY, z + 0.5]
    lastTravelSampleRef.current = [x + 0.5, safeY, z + 0.5]
    chunkRef.current = { x: chunkX, z: chunkZ, groundY, isWater: false }
    setCurrentChunk({ x: chunkX, z: chunkZ })
    setPosSample([x + 0.5, safeY, z + 0.5])
  }, [])

  const bumpCareerCounter = useCallback((bucket, item, amount = 1) => {
    if (!item || amount <= 0) return
    setCareerStats(prev => ({
      ...prev,
      [bucket]: {
        ...(prev[bucket] || {}),
        [item]: (prev[bucket]?.[item] || 0) + amount,
      },
    }))
  }, [])

  const awardResources = useCallback((rewardMap, sourceLabel = '') => {
    if (!rewardMap || Object.keys(rewardMap).length === 0) return
    setResources(prev => addResources(prev, rewardMap))
    Object.entries(rewardMap).forEach(([item, amount]) => {
      bumpCareerCounter('collected', item, amount)
    })
    if (sourceLabel) {
      setStatusMsg(`${sourceLabel}: ${Object.entries(rewardMap).map(([item, amount]) => `${amount} ${formatItemLabel(item)}`).join(', ')}`)
    }
  }, [bumpCareerCounter])

  // Keep chunksRef in sync
  useEffect(() => { chunksRef.current = chunks }, [chunks])

  useEffect(() => {
    audioRef.current = createVoltCraftAudio()
    audioRef.current.setEnabled(audioEnabled)
    return () => {
      audioRef.current = null
    }
  }, [audioEnabled])

  useEffect(() => {
    audioRef.current?.setEnabled(audioEnabled)
  }, [audioEnabled])

  // ── Time cycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      setTime(t => {
        const next = (t + 1) % 1440
        if (next === 360) setWeather('🌅')
        if (next === 480) setWeather('☀️')
        if (next === 720) setWeather(Math.random() > 0.7 ? '🌧️' : '☀️')
        if (next === 1080) setWeather('🌆')
        if (next === 1200) setWeather('🌙')
        return next
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Hunger drain (survival) ──────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'survival') return
    const iv = setInterval(() => setHunger(h => Math.max(0, h - 0.25)), 4000)
    return () => clearInterval(iv)
  }, [mode])

  useEffect(() => {
    if (!activeQuest || !activeQuestDone) return
    const rewardMap = activeQuest.rewards || {}
    setQuestBanner(`Quest complete: ${activeQuest.title}`)
    setTimeout(() => setQuestBanner(''), 3200)
    awardResources(rewardMap)
    setXp(prev => {
      const next = prev + (activeQuest.xpReward || 0)
      if (next >= 100) {
        setLevel(levelPrev => levelPrev + Math.floor(next / 100))
      }
      return next % 100
    })
    audioRef.current?.resume()
    audioRef.current?.playQuest()
    setStatusMsg(`Completed ${activeQuest.title}`)
    setQuestIndex(index => Math.min(index + 1, QUESTS.length))
  }, [activeQuest, activeQuestDone, awardResources])

  useEffect(() => {
    if (mode !== 'survival') return
    const iv = setInterval(() => {
      if (paused || showInventory || showWorldMenu) return
      const healthRatio = health / 20
      audioRef.current?.playAmbient(time, weather, healthRatio)

      const starving = hunger <= 0
      const roughNight = (time >= 1200 || time < 360) && weather === '🌧️'
      if (starving || roughNight) {
        setHealth(prev => Math.max(0, prev - (starving ? 1 : 0.5)))
        if (starving) setStatusMsg('Starving. Eat or get back to camp supplies.')
        if (roughNight && !starving) setStatusMsg('Cold rain and darkness are wearing you down.')
        audioRef.current?.resume()
        audioRef.current?.playDamage()
      } else if (hunger > 14) {
        setHealth(prev => Math.min(20, prev + 0.5))
      }
    }, 6000)
    return () => clearInterval(iv)
  }, [health, hunger, mode, paused, showInventory, showWorldMenu, time, weather])

  // ── Init worker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new VCWorker()
    workerRef.current = worker
    setSavedWorlds(listSavedWorlds())

    let pct = 0
    const ticker = setInterval(() => {
      pct = Math.min(pct + Math.random() * 10 + 3, 88)
      setLoadingPct(Math.round(pct))
    }, 60)

    setLoadingMsg('Initialising terrain worker...')
    // Initialize client-side collision with the same seed
    initCollision(worldSeedRef.current)

    worker.init(worldSeedRef.current).then(async () => {
      setLoadingMsg('Finding spawn point...')
      setWorkerReady(true)
      return findSafeSpawn(worker)
    }).then(({ x, z, height }) => {
      const gy = height ?? 14
      applySpawn(x, z, gy)
      clearInterval(ticker)
      setLoadingPct(100)
      setLoadingMsg('Done!')
      setTimeout(() => setIsLoading(false), 200)
    }).catch(err => {
      console.error('[VoltCraft] Worker init failed:', err)
      clearInterval(ticker)
      localPosRef.current = [0, 20, 0]
      setLoadingPct(100)
      setTimeout(() => setIsLoading(false), 200)
    })

    return () => { worker.terminate(); workerRef.current = null }
  }, [applySpawn, findSafeSpawn])

  // ── Chunk loading ────────────────────────────────────────────────────────────
  const enqueueChunkRequests = useCallback((requests) => {
    if (!requests?.length) return
    const merged = new Map()

    for (const existing of loadQueueRef.current) {
      if (!existing?.key) continue
      merged.set(existing.key, existing)
    }
    for (const request of requests) {
      if (!request?.key) continue
      const current = merged.get(request.key)
      if (!current || (request.dist ?? Infinity) < (current.dist ?? Infinity)) {
        merged.set(request.key, request)
      }
    }

    const nextQueue = [...merged.values()].sort((a, b) => {
      const distDelta = (a.dist ?? Infinity) - (b.dist ?? Infinity)
      if (distDelta !== 0) return distDelta
      const ax = Math.abs(a.cx - chunkRef.current.x) + Math.abs(a.cz - chunkRef.current.z)
      const bx = Math.abs(b.cx - chunkRef.current.x) + Math.abs(b.cz - chunkRef.current.z)
      return ax - bx
    })

    loadQueueRef.current = nextQueue
    queuedKeysRef.current = new Set(nextQueue.map(item => item.key))
  }, [])

  const enqueueChunks = useCallback((cx, cz) => {
    const needed = []
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const kcx = cx + dx
        const kcz = cz + dz
        const key = `${kcx},${kcz}`
        if ((chunksRef.current[key] && !dirtyChunkKeysRef.current.has(key)) || inflightKeysRef.current.has(key)) continue
        needed.push({ cx: kcx, cz: kcz, key, dist: dx * dx + dz * dz })
      }
    }
    enqueueChunkRequests(needed)
  }, [enqueueChunkRequests])

  const invalidateChunkKeys = useCallback((keys) => {
    if (!keys?.size) return

    const playerCx = chunkRef.current.x
    const playerCz = chunkRef.current.z
    const queued = loadQueueRef.current.filter(item => !keys.has(item.key))
    loadQueueRef.current = queued
    queuedKeysRef.current = new Set(queued.map(item => item.key))

    const requests = []
    keys.forEach(key => {
      dirtyChunkKeysRef.current.add(key)
      inflightKeysRef.current.delete(key)
      const [cx, cz] = key.split(',').map(Number)
      requests.push({
        cx,
        cz,
        key,
        dist: (cx - playerCx) * (cx - playerCx) + (cz - playerCz) * (cz - playerCz),
      })
    })

    enqueueChunkRequests(requests)
  }, [enqueueChunkRequests])

  const triggerExplosion = useCallback(async (x, y, z) => {
    const w = workerRef.current
    if (!w) return
    const res = await w.explodeTNT(x, y, z, TNT_RADIUS)
    if (res.type !== 'explodeTNT:done') return

    changesRef.current = res.changes
    lastServerChangesRef.current = res.changes
    setCollisionChanges(res.changes)
    setStatusMsg(`Boom at ${x},${y},${z}`)

    const dirtyChunks = new Set()
    getAffectedChunkKeys(x, z).forEach(key => dirtyChunks.add(key))
    ;(res.removedBlocks || []).forEach(({ x: bx, z: bz }) => {
      getAffectedChunkKeys(bx, bz).forEach(key => dirtyChunks.add(key))
    })
    invalidateChunkKeys(dirtyChunks)

    ;(res.triggeredTnt || []).forEach(({ x: tx, y: ty, z: tz }) => {
      const key = `${tx},${ty},${tz}`
      if (armedTntTimersRef.current.has(key)) return
      setArmedTnt(prev => ({ ...prev, [key]: { x: tx, y: ty, z: tz, armedAt: Date.now() } }))
      const timeoutId = setTimeout(() => {
        armedTntTimersRef.current.delete(key)
        setArmedTnt(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        triggerExplosion(tx, ty, tz)
      }, Math.max(350, Math.floor(TNT_FUSE_MS * 0.45)))
      armedTntTimersRef.current.set(key, timeoutId)
    })
  }, [invalidateChunkKeys])

  const igniteTnt = useCallback((x, y, z, shouldBroadcast = true) => {
    const key = `${x},${y},${z}`
    if (armedTntTimersRef.current.has(key)) return

    setArmedTnt(prev => ({ ...prev, [key]: { x, y, z, armedAt: Date.now() } }))
    setStatusMsg(`Ignited TNT at ${x},${y},${z}`)

    const timeoutId = setTimeout(() => {
      armedTntTimersRef.current.delete(key)
      setArmedTnt(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      triggerExplosion(x, y, z)
    }, TNT_FUSE_MS)

    armedTntTimersRef.current.set(key, timeoutId)
    if (shouldBroadcast) {
      sdk?.emitEvent?.('voltcraft:tnt-ignite', { userId, x, y, z }, { serverRelay:true })
    }
  }, [sdk, triggerExplosion, userId])

  const persistVoltCraftState = useCallback((next = {}) => {
    if (!sdk?.updateState) return
    sdk.updateState({
      voltCraft: {
        changes: changesRef.current,
        players: playersRef.current,
        ...next
      }
    }, { serverRelay: true })
  }, [sdk])

  // Process up to 3 chunks per tick
  useEffect(() => {
    if (!workerReady) return
    let cancelled = false

    const processNext = async () => {
      if (cancelled || loadingRef.current) return
      const queue = loadQueueRef.current
      if (queue.length === 0) return

      // Take up to 3 chunks
      const batch = []
      while (batch.length < 3 && queue.length > 0) {
        const item = queue.shift()
        if (!item) continue
        queuedKeysRef.current.delete(item.key)
        if ((chunksRef.current[item.key] && !dirtyChunkKeysRef.current.has(item.key)) || inflightKeysRef.current.has(item.key)) continue
        inflightKeysRef.current.add(item.key)
        batch.push(item)
      }
      if (batch.length === 0) return

      loadingRef.current = true
      try {
        const results = await Promise.all(
          batch.map(({ cx, cz }) => workerRef.current.getChunkGeometry(cx, cz))
        )
        if (!cancelled) {
          const updates = {}
          results.forEach((res, i) => {
            if (res.type === 'chunkGeometry') {
              dirtyChunkKeysRef.current.delete(batch[i].key)
              updates[batch[i].key] = { positions: res.positions, colors: res.colors, indices: res.indices, bounds: res.bounds }
            }
          })
          if (Object.keys(updates).length > 0) {
            setChunks(prev => ({ ...prev, ...updates }))
          }
        }
      } catch(e) {
        console.warn('[VoltCraft] chunk load error:', e)
        batch.forEach(item => {
          if (!queuedKeysRef.current.has(item.key)) {
            loadQueueRef.current.push(item)
            queuedKeysRef.current.add(item.key)
          }
        })
        loadQueueRef.current.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))
      } finally {
        batch.forEach(item => inflightKeysRef.current.delete(item.key))
        loadingRef.current = false
      }
    }

    const iv = setInterval(processNext, 40)
    return () => { cancelled = true; clearInterval(iv) }
  }, [workerReady])

  // When player chunk changes, enqueue new chunks and unload very distant ones
  useEffect(() => {
    if (!workerReady) return
    const { x: cx, z: cz } = currentChunk
    enqueueChunks(cx, cz)

    // Only unload chunks that are very far away (VIEW_RADIUS + 3)
    const UNLOAD_DIST = VIEW_RADIUS + 3
    loadQueueRef.current = loadQueueRef.current.filter(({ cx: qx, cz: qz }) => (
      Math.abs(qx - cx) <= UNLOAD_DIST && Math.abs(qz - cz) <= UNLOAD_DIST
    ))
    queuedKeysRef.current = new Set(loadQueueRef.current.map(item => item.key))
    setChunks(prev => {
      const next = {}
      for (const [key, val] of Object.entries(prev)) {
        const [kcx, kcz] = key.split(',').map(Number)
        if (Math.abs(kcx - cx) <= UNLOAD_DIST && Math.abs(kcz - cz) <= UNLOAD_DIST) {
          next[key] = val
        }
      }
      return next
    })
  }, [currentChunk, workerReady, enqueueChunks])

  // ── Ground height + water detection polling ──────────────────────────────────
  // Poll the worker every 250ms to get the terrain height at the player's
  // current XZ position. This keeps chunkRef.groundY accurate as the player
  // moves, preventing fall-through and enabling proper water detection.
  useEffect(() => {
    if (!workerReady) return
    const iv = setInterval(async () => {
      const w = workerRef.current
      if (!w) return
      const pos = localPosRef.current
      try {
        const res = await w.getSurfaceAnchor(Math.floor(pos[0]), Math.floor(pos[2]))
        const gy = res.groundY ?? res.terrainHeight ?? chunkRef.current.groundY ?? 14
        const isWater = !!res.submerged
        chunkRef.current = { ...chunkRef.current, groundY: gy, isWater }
        setBiomeInfo({
          biome: res.biome || null,
          terrainHeight: res.terrainHeight ?? gy,
          blockName: res.blockName || null,
          submerged: !!res.submerged,
        })
        if (res.biome) {
          setDiscoveredBiomes(prev => {
            if (prev.includes(res.biome)) return prev
            audioRef.current?.resume()
            audioRef.current?.playBiome()
            setQuestBanner(`Discovered ${formatItemLabel(res.biome)}`)
            setTimeout(() => setQuestBanner(''), 2600)
            return [...prev, res.biome]
          })
        }
        setCareerStats(prev => ({
          ...prev,
          maxHeight: Math.max(prev.maxHeight || 0, Math.floor(pos[1])),
        }))
      } catch {}
    }, 250)
    return () => clearInterval(iv)
  }, [workerReady])

  // ── Hovered block sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const hovered = hoveredRef.current
      if (!hovered) {
        setHoveredBlock(null)
        return
      }
      setHoveredBlock({ ...hovered, name: toUiBlockName(hovered.name) })
    }, 80)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const prev = lastTravelSampleRef.current
    const dx = posSample[0] - prev[0]
    const dy = posSample[1] - prev[1]
    const dz = posSample[2] - prev[2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (Number.isFinite(dist) && dist > 0.25) {
      setCareerStats(prevStats => ({
        ...prevStats,
        travelDistance: (prevStats.travelDistance || 0) + dist,
        maxHeight: Math.max(prevStats.maxHeight || 0, Math.floor(posSample[1])),
      }))
      lastTravelSampleRef.current = [...posSample]
    }
  }, [posSample])

  useEffect(() => {
    const timers = armedTntTimersRef.current
    return () => {
      timers.forEach(timeoutId => clearTimeout(timeoutId))
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (health > 0 || deathLockRef.current) return
    deathLockRef.current = true
    setStatusMsg('You were downed. Respawning at a safe anchor...')
    setPaused(true)
    setShowInventory(false)
    setShowWorldMenu(false)
    ;(async () => {
      const worker = workerRef.current
      if (!worker) return
      const spawn = await findSafeSpawn(worker)
      applySpawn(spawn.x, spawn.z, spawn.height ?? 14)
      setHealth(20)
      setHunger(16)
      setPaused(false)
      setTimeout(() => {
        deathLockRef.current = false
      }, 300)
    })()
  }, [applySpawn, findSafeSpawn, health])

  // ── Block interaction ────────────────────────────────────────────────────────
  const handleInteract = useCallback(async ({ block, button }) => {
    const w = workerRef.current
    if (!w || !block) return
    const pos = localPosRef.current
    const reach = isOp ? 20 : PLAYER_REACH
    const dist = Math.sqrt((block.x+0.5-pos[0])**2 + (block.y+0.5-pos[1])**2 + (block.z+0.5-pos[2])**2)
    if (dist > reach) return
    const selectedItem = hotbar[selectedSlot]

    if (button === 2 && selectedItem === 'flint_and_steel') {
      if (block.name === 'tnt') {
        audioRef.current?.resume()
        audioRef.current?.playIgnite()
        igniteTnt(block.x, block.y, block.z)
      } else {
        setStatusMsg('Flint & steel only ignites TNT right now.')
      }
      return
    }

    if (button === 0) {
      // Break block
      const res = await w.breakBlock(block.x, block.y, block.z)
      if (res.type === 'breakBlock:done') {
        changesRef.current = res.changes
        lastServerChangesRef.current = res.changes
        setCollisionChanges(res.changes)  // keep collision in sync
        persistVoltCraftState()
        setStatusMsg(`Broke block at ${block.x},${block.y},${block.z}`)
        setXp(x => { const nx = x + 2; if (nx >= 100) { setLevel(l => l+1); return 0 } return nx })
        if (mode === 'survival') {
          const drops = getDropRewards(toUiBlockName(block.name))
          if (Object.keys(drops).length > 0) {
            awardResources(drops, 'Salvaged')
          }
          setHunger(prev => Math.max(0, prev - 0.08))
        }
        audioRef.current?.resume()
        audioRef.current?.playBreak(block.name)
        sdk?.emitEvent?.('voltcraft:block', { userId, action:'break', x:block.x, y:block.y, z:block.z }, { serverRelay:true })
        invalidateChunkKeys(getAffectedChunkKeys(block.x, block.z))
      }
    } else if (button === 2) {
      // Place block
      const blockName = selectedItem
      const worldBlockName = toWorldBlockName(selectedItem)
      if (!worldBlockName) return
      if (mode === 'survival' && selectedItem !== 'flint_and_steel') {
        if ((resources[selectedItem] || 0) <= 0) {
          setStatusMsg(`Out of ${formatItemLabel(selectedItem)}.`)
          return
        }
      }
      const fx = block.faceX ?? block.x
      const fy = block.faceY ?? block.y
      const fz = block.faceZ ?? block.z
      const res = await w.placeBlock(fx, fy, fz, worldBlockName)
      if (res.type === 'placeBlock:done') {
        changesRef.current = res.changes
        lastServerChangesRef.current = res.changes
        setCollisionChanges(res.changes)  // keep collision in sync
        persistVoltCraftState()
        setStatusMsg(`Placed ${blockName.replace(/_/g,' ')}`)
        if (mode === 'survival' && selectedItem !== 'flint_and_steel') {
          setResources(prev => removeResources(prev, { [selectedItem]: 1 }))
          bumpCareerCounter('placed', selectedItem, 1)
        }
        audioRef.current?.resume()
        audioRef.current?.playPlace(blockName)
        sdk?.emitEvent?.('voltcraft:block', { userId, action:'place', x:fx, y:fy, z:fz, blockName: worldBlockName }, { serverRelay:true })
        invalidateChunkKeys(getAffectedChunkKeys(fx, fz))
      }
    }
  }, [sdk, userId, hotbar, selectedSlot, isOp, igniteTnt, invalidateChunkKeys, mode, resources, awardResources, bumpCareerCounter, persistVoltCraftState])

  // ── Save / Load / New / Delete world ─────────────────────────────────────────
  const handleSave = useCallback(() => {
    saveWorld(worldIdRef.current, {
      name: worldName,
      seed: worldSeedRef.current,
      changes: changesRef.current,
      resources,
      careerStats,
      discoveredBiomes,
      questIndex,
      mode,
    })
    setSavedAt(Date.now()); setSavedWorlds(listSavedWorlds()); setStatusMsg('World saved!')
  }, [careerStats, discoveredBiomes, mode, questIndex, resources, worldName])

  const handleLoadWorld = useCallback(async (wid) => {
    const data = loadWorld(wid)
    if (!data) return
    worldIdRef.current = wid; worldSeedRef.current = data.seed
    changesRef.current = data.changes || {}
    lastServerChangesRef.current = data.changes || {}
    armedTntTimersRef.current.forEach(timeoutId => clearTimeout(timeoutId))
    armedTntTimersRef.current.clear()
    setArmedTnt({})
    setBreakProgress(null)
    setWorldName(data.name); setSavedAt(data.savedAt)
    setResources(data.resources || createStarterResources())
    setCareerStats(data.careerStats || {
      collected: {},
      crafted: {},
      placed: {},
      maxHeight: 16,
      travelDistance: 0,
    })
    setDiscoveredBiomes(data.discoveredBiomes || [])
    setQuestIndex(data.questIndex || 0)
    setMode(data.mode || 'creative')
    setHealth(20)
    setHunger(20)
    setBiomeInfo(null)
    setQuestBanner('')
    setShowWorldMenu(false); setIsLoading(true); setLoadingPct(0); setLoadingMsg('Loading world...')
    const w = workerRef.current; if (!w) return
    let pct = 0
    const ticker = setInterval(() => { pct = Math.min(pct+12,85); setLoadingPct(Math.round(pct)) }, 80)
    await w.init(data.seed); await w.setWorldChanges(data.changes||{})
    initCollision(data.seed)  // re-init collision with loaded world seed
    setCollisionChanges(data.changes || {})
    const spawn = await findSafeSpawn(w)
    applySpawn(spawn.x, spawn.z, spawn.height ?? 14)
    clearInterval(ticker); setLoadingPct(100); setWorkerReady(true)
    setChunks({}); chunksRef.current = {}; loadQueueRef.current = []
    queuedKeysRef.current = new Set(); inflightKeysRef.current = new Set(); dirtyChunkKeysRef.current = new Set()
    setTimeout(() => setIsLoading(false), 200)
    setStatusMsg(`Loaded: ${data.name}`)
  }, [applySpawn, findSafeSpawn])

  const handleNewWorld = useCallback(async () => {
    const newSeed = Math.floor(Math.random() * 999999)
    worldIdRef.current = `world_${Date.now()}`; worldSeedRef.current = newSeed
    changesRef.current = {}
    lastServerChangesRef.current = {}
    armedTntTimersRef.current.forEach(timeoutId => clearTimeout(timeoutId))
    armedTntTimersRef.current.clear()
    setArmedTnt({})
    setBreakProgress(null)
    setWorldName(`World ${new Date().toLocaleDateString()}`); setSavedAt(null)
    setResources(createStarterResources())
    setCareerStats({
      collected: {},
      crafted: {},
      placed: {},
      maxHeight: 16,
      travelDistance: 0,
    })
    setDiscoveredBiomes([])
    setQuestIndex(0)
    setHealth(20)
    setHunger(20)
    setBiomeInfo(null)
    setQuestBanner('')
    setShowWorldMenu(false); setIsLoading(true); setLoadingPct(0); setLoadingMsg('Generating new world...')
    const w = workerRef.current; if (!w) return
    let pct = 0
    const ticker = setInterval(() => { pct = Math.min(pct+12,85); setLoadingPct(Math.round(pct)) }, 80)
    await w.init(newSeed)
    initCollision(newSeed)  // re-init collision with new seed
    setCollisionChanges({})
    const spawn = await findSafeSpawn(w)
    applySpawn(spawn.x, spawn.z, spawn.height ?? 14)
    clearInterval(ticker); setLoadingPct(100); setWorkerReady(true)
    setChunks({}); chunksRef.current = {}; loadQueueRef.current = []
    queuedKeysRef.current = new Set(); inflightKeysRef.current = new Set(); dirtyChunkKeysRef.current = new Set()
    setTimeout(() => setIsLoading(false), 200)
    setStatusMsg('New world generated!')
  }, [applySpawn, findSafeSpawn])

  const handleDeleteWorld = useCallback((wid) => {
    deleteWorld(wid); setSavedWorlds(listSavedWorlds())
  }, [])

  const handlePickBlock = useCallback((block) => {
    const uiBlock = toUiBlockName(block)
    if (mode === 'survival' && (resources[uiBlock] || 0) <= 0) {
      setStatusMsg(`No ${formatItemLabel(uiBlock)} in your satchel.`)
      return
    }
    setHotbar(prev => { const n=[...prev]; n[selectedSlot]=uiBlock; return n })
    setStatusMsg(`Selected: ${uiBlock.replace(/_/g,' ')}`)
    setShowInventory(false)
  }, [mode, resources, selectedSlot])

  const handleCraftRecipe = useCallback((recipe) => {
    if (!recipe?.output) return
    if (mode === 'survival') {
      if (!canCraftRecipe(recipe, resources)) {
        setStatusMsg(`Missing ${getMissingIngredients(recipe, resources).join(', ')}`)
        return
      }
      const costs = {}
      recipe.ingredients.forEach(({ item, count }) => {
        costs[item] = (costs[item] || 0) + count
      })
      setResources(prev => addResources(removeResources(prev, costs), { [recipe.output]: recipe.outputCount || 1 }))
      bumpCareerCounter('crafted', recipe.output, 1)
      audioRef.current?.resume()
      audioRef.current?.playCraft()
    }
    setHotbar(prev => {
      const next = [...prev]
      next[selectedSlot] = recipe.output
      return next
    })
    setStatusMsg(`Crafted ${recipe.label} into slot ${selectedSlot + 1}`)
  }, [bumpCareerCounter, mode, resources, selectedSlot])

  // ── Pointer lock management for menus ────────────────────────────────────────
  const toggleInventory = useCallback(() => {
    setShowInventory(v => {
      const next = !v
      if (next) {
        // Opening inventory: release pointer lock
        document.exitPointerLock?.()
        setShowWorldMenu(false)
      } else {
        // Closing inventory: re-acquire pointer lock
        setTimeout(() => document.querySelector('canvas')?.requestPointerLock(), 50)
      }
      return next
    })
  }, [])

  const toggleWorldMenu = useCallback(() => {
    setShowWorldMenu(v => {
      const next = !v
      if (next) {
        document.exitPointerLock?.()
        setShowInventory(false)
        setSavedWorlds(listSavedWorlds())
      } else {
        setTimeout(() => document.querySelector('canvas')?.requestPointerLock(), 50)
      }
      return next
    })
  }, [])

  const resumeGame = useCallback(() => {
    setPaused(false)
    setShowInventory(false)
    setShowWorldMenu(false)
    setTimeout(() => document.querySelector('canvas')?.requestPointerLock(), 50)
  }, [])


  useEffect(() => {
    if (!sdk) return
    const offState = sdk.subscribeServerState?.((state) => {
      const changes = state?.voltCraft?.changes
      const remotePlayers = state?.voltCraft?.players
      if (changes && workerRef.current) {
        const changedBlocks = getChangedBlockKeys(lastServerChangesRef.current, changes)
        if (changedBlocks.size > 0) {
          changesRef.current = changes
          lastServerChangesRef.current = changes
          setCollisionChanges(changes)  // keep collision in sync with server state
          workerRef.current.setWorldChanges(changes).then(() => {
            const dirtyChunks = new Set()
            changedBlocks.forEach((key) => {
              const [x, , z] = key.split(',').map(Number)
              getAffectedChunkKeys(x, z).forEach(chunkKey => dirtyChunks.add(chunkKey))
            })
            invalidateChunkKeys(dirtyChunks)
          })
        }
      }
      if (remotePlayers && typeof remotePlayers === 'object') {
        setPlayers((prev) => ({
          ...prev,
          ...remotePlayers
        }))
      }
    })
    const offEvent = sdk.on?.('event', (evt) => {
      const p = evt.payload || {}
      if (p.userId === userId) return
      if (evt.eventType === 'voltcraft:player') {
        setPlayers(prev => ({ ...prev, [p.userId]: { userId:p.userId, username:p.username||'Guest', position:p.position||[0,10,0], color:p.color||'#f472b6' } }))
      } else if (evt.eventType === 'voltcraft:leave') {
        setPlayers(prev => { const n={...prev}; delete n[p.userId]; return n })
      } else if (evt.eventType === 'voltcraft:tnt-ignite') {
        igniteTnt(p.x, p.y, p.z, false)
      }
    })
    setPlayers((prev) => {
      const next = { ...prev, [userId]: { userId, username, position:localPosRef.current, color:userColor, mode } }
      playersRef.current = next
      return next
    })
    persistVoltCraftState()
    sdk.emitEvent?.('voltcraft:player', { userId, username, position:localPosRef.current, color:userColor }, { serverRelay:true })
    return () => {
      setPlayers((prev) => {
        const next = { ...prev }
        delete next[userId]
        playersRef.current = next
        return next
      })
      persistVoltCraftState()
      sdk.emitEvent?.('voltcraft:leave', { userId }, { serverRelay:true })
      offState?.()
      offEvent?.()
    }
  }, [sdk, userId, username, userColor, igniteTnt, invalidateChunkKeys, mode, persistVoltCraftState])

  useEffect(() => {
    if (!sdk) return
    const iv = setInterval(() => {
      setPlayers((prev) => {
        const next = { ...prev, [userId]: { userId, username, position:localPosRef.current, color:userColor, mode } }
        playersRef.current = next
        return next
      })
      persistVoltCraftState()
      sdk.emitEvent?.('voltcraft:player', { userId, username, position:localPosRef.current, color:userColor, mode }, { serverRelay:true })
    }, PLAYER_SYNC_MS)
    return () => clearInterval(iv)
  }, [sdk, userId, username, userColor, mode, persistVoltCraftState])

  useEffect(() => {
    setPlayers(prev => {
      const next = { ...prev, [userId]: { userId, username, position:posSample, color:userColor, mode } }
      playersRef.current = next
      return next
    })
  }, [userId, username, posSample, userColor, mode])

  // ── Loading screen ───────────────────────────────────────────────────────────
  if (isLoading) return (
    <GameCanvasShell
      title="VoltCraft"
      subtitle="Loading World"
      status={loadingMsg}
      skin="sport"
      musicEnabled={false}
    >
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:'100%', maxWidth:360, color:'#fff', gap:20, fontFamily:'monospace' }}>
        <div style={{ fontSize:36, fontWeight:'bold', letterSpacing:2 }}>⚡ VoltCraft</div>
        <div style={{ fontSize:14, opacity:0.7 }}>{loadingMsg}</div>
        <div style={{ width:280, height:12, background:'#333', borderRadius:6, overflow:'hidden' }}>
          <div style={{ width:`${loadingPct}%`, height:'100%', background:'linear-gradient(90deg,#3b82f6,#38bdf8)', transition:'width 0.15s ease', borderRadius:6 }} />
        </div>
        <div style={{ fontSize:12, opacity:0.5 }}>{loadingPct}%</div>
      </div>
    </GameCanvasShell>
  )

  return (
    <GameCanvasShell
      title="VoltCraft"
      subtitle="Voxel Sandbox"
      status="Pointer-lock world canvas preserved; shared shell only standardizes the outer stage."
      skin="sport"
      musicEnabled={false}
      header={false}
      layout="stretch"
    >
      <div
        ref={containerRef}
        style={{ width:'100%', height:'100%', background:'linear-gradient(180deg, #8bd7ff 0%, #cfeeff 45%, #eff9ff 100%)', position:'relative' }}
        onContextMenu={e => e.preventDefault()}
      >
        <WebGLErrorBoundary>
          <Canvas
            shadows={false}
            gl={{ antialias: true, powerPreference:'high-performance', failIfMajorPerformanceCaveat:false }}
            camera={{ fov:75, near:0.08, far: FOG_FAR + 28 }}
            dpr={[1, 2]}
            frameloop="always"
            style={{ position:'absolute', inset:0 }}
          >
            <color attach="background" args={[getSkyPalette(time).skyTop]} />
            <Suspense fallback={null}>
              <WorldScene
                chunks={chunks}
                players={players}
                localId={userId}
                armedTnt={armedTnt}
                localPosRef={localPosRef}
                chunkRef={chunkRef}
                setChunkState={setCurrentChunk}
                setPosSample={setPosSample}
                selectedSlot={selectedSlot}
                time={time}
                weather={weather}
                mode={mode}
                paused={paused}
                setPaused={setPaused}
                setPointerLocked={setPointerLocked}
                onInteract={handleInteract}
                onSelectSlot={setSelectedSlot}
                onToggleInventory={toggleInventory}
                onToggleWorldMenu={toggleWorldMenu}
                showInventory={showInventory}
                showWorldMenu={showWorldMenu}
                hoveredRef={hoveredRef}
                isOp={isOp}
                setBreakProgress={setBreakProgress}
                onJump={() => {
                  audioRef.current?.resume()
                  audioRef.current?.playJump()
                }}
              />
            </Suspense>
          </Canvas>
        </WebGLErrorBoundary>

        <VoltCraftHUD
          mode={mode} health={health} maxHealth={20} hunger={hunger}
          xp={xp} level={level} currentChunk={currentChunk} pos={posSample}
          statusMsg={statusMsg} selectedSlot={selectedSlot} hotbar={hotbar}
          onSelectSlot={setSelectedSlot} paused={paused} onResume={resumeGame}
          onTogglePause={() => { setPaused(p => !p); if (!paused) document.exitPointerLock?.() }}
          showInventory={showInventory} onToggleInventory={toggleInventory}
          inventoryCategory={invCategory} onSetCategory={setInvCategory}
          onPickBlock={handlePickBlock} onCraftRecipe={handleCraftRecipe}
          hoveredBlock={hoveredBlock} breakProgress={breakProgress}
          time={time} weather={weather} worldName={worldName} savedAt={savedAt}
          onSave={handleSave} showWorldMenu={showWorldMenu}
          onToggleWorldMenu={toggleWorldMenu} savedWorlds={savedWorlds}
          onLoadWorld={handleLoadWorld} onNewWorld={handleNewWorld}
          onDeleteWorld={handleDeleteWorld} containerRef={containerRef}
          isOp={isOp} onToggleOp={() => setIsOp(v => !v)}
          onSetMode={setMode} pointerLocked={pointerLocked}
          resources={resources} biomeInfo={biomeInfo} discoveredBiomes={discoveredBiomes}
          activeQuest={activeQuest} questCompletion={questCompletion}
          audioEnabled={audioEnabled} onToggleAudio={() => setAudioEnabled(v => !v)}
          questBanner={questBanner}
        />
      </div>
    </GameCanvasShell>
  )
}

export default VoltCraftActivity
