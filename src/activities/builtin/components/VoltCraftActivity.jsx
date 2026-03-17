/**
 * VoltCraftActivity.jsx  –  Full-featured Minecraft-style voxel game
 *
 * Features:
 *  • 128+ block types with biome-aware terrain (plains/desert/tundra/mountains)
 *  • Ore generation (coal, iron, gold, diamond, lapis, redstone, emerald)
 *  • Tree generation, cacti, snow, water
 *  • Web Worker for ALL terrain/chunk work (never blocks main thread)
 *  • InstancedMesh per block type → 1 draw call per type
 *  • localStorage world persistence (save/load/new world)
 *  • Multiplayer: player positions + block changes synced via SDK
 *  • Full 3D HUD inside Three.js Canvas (no HTML overlays during gameplay)
 *  • Inventory system with 128+ blocks, hotbar, creative/survival modes
 *  • Block highlight on hover
 *  • Pointer lock FPS controls
 *  • WebGL error boundary
 *  • Proper geometry/material disposal
 */
import React, {
  useCallback, useEffect, useLayoutEffect, useMemo,
  useRef, useState, Suspense
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { HtmlOverlay, HtmlPanel, HtmlText, HtmlBar, HtmlButton, HtmlColorSwatch, HtmlDivider } from './shared/HtmlOverlay'
import * as THREE from 'three'

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE       = 16
const VIEW_RADIUS      = 2   // reduced from 3 – fewer draw calls, less GC pressure
const PLAYER_HEIGHT    = 1.62
const PLAYER_SYNC_MS   = 250 // slightly less frequent position sync
const CREATIVE_SPEED   = 14.0
const SURVIVAL_SPEED   = 4.8
const SPRINT_MULT      = 1.65
const JUMP_VEL         = 7.2
const GRAVITY          = 22
const PLAYER_REACH     = 5.5
const SAVE_KEY_PREFIX  = 'voltcraft_world_'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ─── Block color palette (128+ blocks) ───────────────────────────────────────
const BLOCK_COLORS = {
  grass:'#5d8c2e', dirt:'#8b5a2b', stone:'#7a7a7a', cobblestone:'#6b6b6b',
  sand:'#e8d4a8', gravel:'#9e8d7a', oak_log:'#6c4a1a', oak_planks:'#a0824a',
  leaves:'#2f7a2c', water:'#3b82f6', bedrock:'#1a1a1a', coal_ore:'#3d3d3d',
  iron_ore:'#8a6f4e', gold_ore:'#c9a227', diamond_ore:'#4ecca3',
  obsidian:'#1a1a2e', torch:'#ff6b35', glass:'#c8e6ff', brick:'#b94e48',
  tnt:'#e03131', wool:'#f5f5f5', wool_red:'#ef4444', wool_blue:'#3b82f6',
  wool_green:'#22c55e', crafting_table:'#8b6914', furnace:'#4a4a4a',
  chest:'#c8a44a', snow:'#f0f4ff', ice:'#a8d8f0', cactus:'#3d7a2a',
  sandstone:'#d4b483', mossy_cobblestone:'#5a7a4a', bookshelf:'#8b6914',
  sponge:'#d4c44a', lapis_ore:'#2a4a8a', emerald_ore:'#2a8a4a',
  redstone_ore:'#8a1a1a', glowstone:'#f0c040', netherrack:'#6a1a1a',
  soul_sand:'#4a3a2a', pumpkin:'#d4740a', melon:'#5a9a2a',
  hay_bale:'#c8a020', clay:'#8a9aaa', gravel_path:'#9a8a6a',
  oak_slab:'#a0824a', stone_slab:'#7a7a7a', oak_stairs:'#a0824a',
  stone_stairs:'#7a7a7a', fence:'#a0824a', fence_gate:'#a0824a',
  door:'#a0824a', trapdoor:'#a0824a', ladder:'#a0824a', sign:'#a0824a',
  flower_red:'#e03131', flower_yellow:'#f0c040', mushroom:'#c87a4a',
  tall_grass:'#4a8a2a', dead_bush:'#8a6a2a', sapling:'#2a6a1a',
  wheat:'#c8a020', farmland:'#6a4a1a', water_source:'#2a62d6',
  lava:'#e05010', lava_source:'#e05010',
  wool_yellow:'#f0c040', wool_orange:'#e07020', wool_purple:'#7a2a8a',
  wool_cyan:'#2a8a8a', wool_magenta:'#c02a8a', wool_pink:'#f08aaa',
  wool_lime:'#6ad020', wool_gray:'#6a6a6a', wool_light_gray:'#9a9a9a',
  wool_brown:'#6a3a1a', wool_black:'#1a1a1a',
  concrete_white:'#e0e0e0', concrete_red:'#c02020', concrete_blue:'#2040c0',
  concrete_green:'#208020', concrete_yellow:'#c0a020', concrete_orange:'#c06020',
  concrete_purple:'#602090', terracotta:'#a05030', terracotta_red:'#902020',
  terracotta_blue:'#204060', terracotta_yellow:'#a08020',
  quartz:'#f0ece8', quartz_pillar:'#e8e4e0', prismarine:'#2a8a7a',
  sea_lantern:'#a0d8d0', end_stone:'#d8d4a0', purpur:'#8a4a8a',
  nether_brick:'#2a1010', red_sandstone:'#c05020',
  andesite:'#8a8a8a', diorite:'#c0c0c0', granite:'#a06040',
  polished_andesite:'#909090', polished_diorite:'#c8c8c8', polished_granite:'#a86848',
  smooth_stone:'#808080', cut_sandstone:'#d0b870', chiseled_sandstone:'#c8b060',
  chiseled_stone_bricks:'#707070', stone_bricks:'#787878',
  cracked_stone_bricks:'#6a6a6a', mossy_stone_bricks:'#5a7a5a',
  infested_stone:'#7a7a6a', mycelium:'#7a5a7a', podzol:'#6a4a2a',
  coarse_dirt:'#7a5030', rooted_dirt:'#7a5030', mud:'#5a4a3a',
  packed_mud:'#6a5040', mud_bricks:'#7a5a4a',
  deepslate:'#4a4a5a', cobbled_deepslate:'#505060', polished_deepslate:'#484858',
  deepslate_bricks:'#484858', deepslate_tiles:'#404050',
  reinforced_deepslate:'#383848', tuff:'#6a6a5a', calcite:'#d8d8d0',
  dripstone:'#8a7a6a', pointed_dripstone:'#8a7a6a',
}

const TRANSPARENT_BLOCKS = new Set(['water','water_source','glass','leaves','lava','lava_source'])
const EMISSIVE_BLOCKS    = new Set(['torch','glowstone','sea_lantern','lava','lava_source','redstone_ore'])
const EMISSIVE_INTENSITY = { torch:0.9, glowstone:1.2, sea_lantern:0.8, lava:0.7, lava_source:0.7, redstone_ore:0.4 }

// ─── Hotbar presets ───────────────────────────────────────────────────────────
const DEFAULT_HOTBAR = [
  'dirt','cobblestone','stone','sand','oak_planks',
  'oak_log','glass','brick','tnt','torch'
]

// ─── Inventory categories ─────────────────────────────────────────────────────
const INVENTORY_CATEGORIES = {
  'Natural': ['grass','dirt','stone','cobblestone','sand','gravel','clay','mud','podzol','mycelium','coarse_dirt','rooted_dirt','packed_mud','mud_bricks'],
  'Wood': ['oak_log','oak_planks','oak_slab','oak_stairs','fence','fence_gate','door','trapdoor','ladder','bookshelf','crafting_table','chest'],
  'Stone': ['stone_bricks','cobblestone','mossy_cobblestone','mossy_stone_bricks','cracked_stone_bricks','chiseled_stone_bricks','smooth_stone','stone_slab','stone_stairs','andesite','diorite','granite','polished_andesite','polished_diorite','polished_granite'],
  'Ores': ['coal_ore','iron_ore','gold_ore','diamond_ore','lapis_ore','redstone_ore','emerald_ore'],
  'Minerals': ['obsidian','bedrock','glowstone','sea_lantern','quartz','quartz_pillar','prismarine'],
  'Sand': ['sand','sandstone','cut_sandstone','chiseled_sandstone','red_sandstone','gravel'],
  'Wool': ['wool','wool_red','wool_blue','wool_green','wool_yellow','wool_orange','wool_purple','wool_cyan','wool_magenta','wool_pink','wool_lime','wool_gray','wool_light_gray','wool_brown','wool_black'],
  'Concrete': ['concrete_white','concrete_red','concrete_blue','concrete_green','concrete_yellow','concrete_orange','concrete_purple'],
  'Terracotta': ['terracotta','terracotta_red','terracotta_blue','terracotta_yellow'],
  'Nether': ['netherrack','soul_sand','nether_brick','purpur','end_stone'],
  'Deepslate': ['deepslate','cobbled_deepslate','polished_deepslate','deepslate_bricks','deepslate_tiles','reinforced_deepslate','tuff','calcite','dripstone'],
  'Misc': ['glass','brick','tnt','torch','furnace','hay_bale','sponge','pumpkin','melon','ice','snow'],
}

// ─── Shared geometry pool ─────────────────────────────────────────────────────
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1)

// ─── Material pool ────────────────────────────────────────────────────────────
const matPool = new Map()
function getBlockMat(name) {
  if (matPool.has(name)) return matPool.get(name)
  const color = BLOCK_COLORS[name] || '#ff00ff'
  const isTrans = TRANSPARENT_BLOCKS.has(name)
  const isEmit  = EMISSIVE_BLOCKS.has(name)
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.88, metalness: 0.04,
    transparent: isTrans,
    opacity: isTrans ? (name.includes('water') ? 0.6 : name.includes('lava') ? 0.85 : 0.5) : 1,
    emissive: isEmit ? color : '#000',
    emissiveIntensity: EMISSIVE_INTENSITY[name] || 0,
    depthWrite: !isTrans,
  })
  matPool.set(name, mat)
  return mat
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
  getVisibleBlocks(cx, cz, radius) { return this._send('getVisibleBlocks', { cx, cz, radius }) }
  breakBlock(x, y, z)              { return this._send('breakBlock', { x, y, z }) }
  placeBlock(x, y, z, blockName)   { return this._send('placeBlock', { x, y, z, blockName }) }
  getTerrainHeight(x, z)           { return this._send('getTerrainHeight', { x, z }) }
  setWorldChanges(changes)         { return this._send('setWorldChanges', { changes }) }
  raycast(origin, direction, maxDist) { return this._send('raycast', { origin, direction, maxDist }) }
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

function saveWorld(worldId, name, seed, changes) {
  const data = { name, seed, changes, savedAt: Date.now() }
  localStorage.setItem(SAVE_KEY_PREFIX + worldId, JSON.stringify(data))
}

function loadWorld(worldId) {
  try {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + worldId)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function deleteWorld(worldId) {
  localStorage.removeItem(SAVE_KEY_PREFIX + worldId)
}

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

// ─── InstancedVoxelLayer ──────────────────────────────────────────────────────
const InstancedVoxelLayer = React.memo(({ type, buf, count, onMeshReady }) => {
  const ref   = useRef(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const mat   = useMemo(() => getBlockMat(type), [type])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || !buf || count === 0) return
    // buf may be a plain Array (from worker clone) or Int16Array – both support index access
    for (let i = 0; i < count; i++) {
      const bx = buf[i*3], by = buf[i*3+1], bz = buf[i*3+2]
      if (bx === undefined) break
      dummy.position.set(bx + 0.5, by + 0.5, bz + 0.5)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = count
    // Tag the mesh with its block type for hit identification
    mesh.userData.blockType = type
    // Register this mesh for targeted raycasting
    onMeshReady?.(type, mesh)
  }, [buf, count, dummy, type, onMeshReady])

  if (!buf || count === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[BOX_GEO, mat, count]}
      frustumCulled
      castShadow={!TRANSPARENT_BLOCKS.has(type)}
      receiveShadow
    />
  )
})

// ─── Block highlight box ──────────────────────────────────────────────────────
const HighlightBox = React.memo(({ position }) => {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color:'#ffffff', wireframe:true, transparent:true, opacity:0.5 }), [])
  if (!position) return null
  return (
    <mesh position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <primitive object={mat} attach="material" />
    </mesh>
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

// ─── HUD (ScreenUI – Unity-style screen-space overlay) ────────────────────────
function VoltCraftHUD({
  mode, health, maxHealth, hunger, xp, level,
  currentChunk, pos, statusMsg,
  selectedSlot, hotbar, onSelectSlot,
  paused, onResume,
  showInventory, onToggleInventory,
  inventoryCategory, onSetCategory,
  onPickBlock,
  hoveredBlock, time, weather,
  worldName, savedAt, onSave,
  showWorldMenu, onToggleWorldMenu,
  savedWorlds, onLoadWorld, onNewWorld, onDeleteWorld,
}) {
  const hpPct = health / maxHealth
  const hpColor = hpPct > 0.6 ? '#4ade80' : hpPct > 0.3 ? '#fbbf24' : '#ef4444'
  const hungerPct = hunger / 20
  const timeStr = `${String(Math.floor(time / 60)).padStart(2,'0')}:${String(time % 60).padStart(2,'0')}`
  const { size } = useThree()
  const sw = size.width, sh = size.height

  // Crosshair – rendered directly in 3D scene (not ScreenUI) so it stays at screen center
  const crossMat = useMemo(() => new THREE.MeshBasicMaterial({ color:'#fff', transparent:true, opacity:0.9, depthTest:false }), [])

  return (
    <>
      {/* Crosshair – tiny 3D planes at fixed distance, always centered */}
      {!paused && !showInventory && !showWorldMenu && (
        <group>
          <mesh renderOrder={500} position={[0,0,-1.5]}>
            <planeGeometry args={[0.018,0.003]} />
            <primitive object={crossMat} attach="material" />
          </mesh>
          <mesh renderOrder={500} position={[0,0,-1.5]}>
            <planeGeometry args={[0.003,0.018]} />
            <primitive object={crossMat} attach="material" />
          </mesh>
        </group>
      )}

      {/* All 2D UI via ScreenUI orthographic overlay */}
      <HtmlOverlay>
        {/* ── Stats panel (top-left) ── */}
        {!paused && (
          <HtmlPanel x={12} y={12} w={220} h={200} anchor="top-left" color="#0d1117" opacity={0.88} borderColor="#1f2937">
            <HtmlText x={12} y={10} text="⚡ VoltCraft" fontSize={15} color="#38bdf8" fontWeight="bold" />
            <HtmlDivider x={8} y={30} w={204} />
            <HtmlText x={12} y={38} text="❤ HP" fontSize={12} color="#9ca3af" />
            <HtmlBar x={50} y={40} w={158} h={10} value={hpPct} color={hpColor} />
            <HtmlText x={12} y={56} text="🍖 Food" fontSize={12} color="#9ca3af" />
            <HtmlBar x={50} y={58} w={158} h={10} value={hungerPct} color="#f97316" />
            <HtmlText x={12} y={74} text="✨ XP" fontSize={12} color="#9ca3af" />
            <HtmlBar x={50} y={76} w={158} h={10} value={xp / 100} color="#a855f7" />
            <HtmlText x={170} y={74} text={`Lv ${level}`} fontSize={11} color="#e5e7eb" />
            <HtmlDivider x={8} y={92} w={204} />
            <HtmlText x={12} y={98} text={`Mode: ${mode}`} fontSize={12} color="#e5e7eb" />
            <HtmlText x={12} y={114} text={`Chunk: ${currentChunk.x},${currentChunk.z}`} fontSize={12} color="#e5e7eb" />
            <HtmlText x={12} y={130} text={`Pos: ${pos.map(v=>Math.round(v)).join(', ')}`} fontSize={11} color="#e5e7eb" />
            <HtmlText x={12} y={146} text={`${timeStr} ${weather}`} fontSize={12} color="#fbbf24" />
            <HtmlDivider x={8} y={162} w={204} />
            <HtmlText x={12} y={168} text={statusMsg} fontSize={11} color="#6b7280" maxWidth={200} />
          </HtmlPanel>
        )}

        {/* ── World name + save (top-right) ── */}
        {!paused && (
          <HtmlPanel x={12} y={12} w={180} h={80} anchor="top-right" color="#0d1117" opacity={0.88} borderColor="#1f2937">
            <HtmlText x={12} y={10} text={worldName} fontSize={13} color="#e5e7eb" fontWeight="bold" />
            <HtmlText x={12} y={28} text={savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Unsaved'} fontSize={11} color="#6b7280" />
            <HtmlButton x={12} y={46} w={156} h={26} label="💾 Save World" color="#14532d" hoverColor="#166534" onClick={onSave} />
          </HtmlPanel>
        )}

        {/* ── Hovered block tooltip (top-center) ── */}
        {!paused && hoveredBlock && (
          <HtmlPanel x={0} y={12} w={200} h={44} anchor="top-center" color="#0d1117" opacity={0.88} borderColor="#374151">
            <HtmlText x={12} y={8} text={hoveredBlock.name?.replace(/_/g,' ') || ''} fontSize={13} color="#e5e7eb" fontWeight="bold" />
            <HtmlText x={12} y={26} text={`${hoveredBlock.x}, ${hoveredBlock.y}, ${hoveredBlock.z}`} fontSize={11} color="#6b7280" />
          </HtmlPanel>
        )}

        {/* ── Hotbar (bottom-center) ── */}
        {!paused && (
          <HtmlPanel x={0} y={12} w={hotbar.length * 46 + 8} h={52} anchor="bottom-center" color="#0d1117" opacity={0.92} borderColor="#1f2937">
            {hotbar.map((item, i) => (
              <ScreenButton
                key={i}
                x={4 + i * 46} y={4} w={42} h={44}
                label={`${i+1}`}
                color={selectedSlot === i ? '#1d4ed8' : BLOCK_COLORS[item] ? BLOCK_COLORS[item] + '44' : '#1f2937'}
                hoverColor={selectedSlot === i ? '#2563eb' : '#374151'}
                textColor={selectedSlot === i ? '#fff' : '#9ca3af'}
                fontSize={11}
                onClick={() => onSelectSlot(i)}
              />
            ))}
          </HtmlPanel>
        )}

        {/* ── Inventory panel (center) ── */}
        {showInventory && !paused && (
          <HtmlPanel x={0} y={0} w={Math.min(sw - 40, 640)} h={Math.min(sh - 40, 480)} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
            <HtmlText x={12} y={10} text="⚡ Inventory" fontSize={18} color="#38bdf8" fontWeight="bold" />
            <HtmlDivider x={8} y={34} w={Math.min(sw - 56, 624)} />
            {/* Category tabs */}
            {Object.keys(INVENTORY_CATEGORIES).map((cat, ci) => {
              const cols = 6
              const tabW = 96, tabH = 26, gap = 4
              const tx = 8 + (ci % cols) * (tabW + gap)
              const ty = 40 + Math.floor(ci / cols) * (tabH + gap)
              return (
                <HtmlButton key={cat} x={tx} y={ty} w={tabW} h={tabH}
                  label={cat} fontSize={11}
                  color={inventoryCategory === cat ? '#1d4ed8' : '#1f2937'}
                  hoverColor={inventoryCategory === cat ? '#2563eb' : '#374151'}
                  onClick={() => onSetCategory(cat)}
                />
              )
            })}
            <HtmlDivider x={8} y={100} w={Math.min(sw - 56, 624)} />
            {/* Block grid */}
            {(INVENTORY_CATEGORIES[inventoryCategory] || []).slice(0, 48).map((block, bi) => {
              const cols = 8, cellW = 72, cellH = 56, gap = 4
              const bx = 8 + (bi % cols) * (cellW + gap)
              const by = 108 + Math.floor(bi / cols) * (cellH + gap)
              return (
                <HtmlButton key={block} x={bx} y={by} w={cellW} h={cellH}
                  label={block.replace(/_/g,' ').slice(0,10)}
                  fontSize={10}
                  color={BLOCK_COLORS[block] ? BLOCK_COLORS[block] + '55' : '#1f2937'}
                  hoverColor={BLOCK_COLORS[block] ? BLOCK_COLORS[block] + '99' : '#374151'}
                  onClick={() => onPickBlock(block)}
                />
              )
            })}
            <HtmlButton x={8} y={Math.min(sh - 40, 480) - 40} w={100} h={28}
              label="✕ Close" color="#7f1d1d" hoverColor="#991b1b" onClick={onToggleInventory} />
          </HtmlPanel>
        )}

        {/* ── World menu (center) ── */}
        {showWorldMenu && !paused && (
          <HtmlPanel x={0} y={0} w={500} h={420} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
            <HtmlText x={12} y={10} text="🌍 Worlds" fontSize={18} color="#38bdf8" fontWeight="bold" />
            <HtmlDivider x={8} y={34} w={484} />
            <HtmlButton x={8} y={40} w={200} h={30} label="+ New World" color="#14532d" hoverColor="#166534" onClick={onNewWorld} />
            {savedWorlds.slice(0, 6).map((w, wi) => (
              <HtmlPanel key={w.id} x={8} y={78 + wi * 52} w={484} h={46} anchor="top-left" color="#1f2937" opacity={0.9}>
                <HtmlText x={8} y={6} text={w.name} fontSize={13} color="#e5e7eb" fontWeight="bold" />
                <HtmlText x={8} y={24} text={`${w.changeCount} changes • ${new Date(w.savedAt).toLocaleDateString()}`} fontSize={11} color="#6b7280" />
                <HtmlButton x={340} y={8} w={60} h={26} label="Load" color="#1d4ed8" hoverColor="#1e40af" onClick={() => onLoadWorld(w.id)} />
                <HtmlButton x={408} y={8} w={60} h={26} label="Del" color="#7f1d1d" hoverColor="#991b1b" onClick={() => onDeleteWorld(w.id)} />
              </HtmlPanel>
            ))}
            {savedWorlds.length === 0 && (
              <HtmlText x={12} y={90} text="No saved worlds yet" fontSize={14} color="#6b7280" />
            )}
            <HtmlButton x={8} y={380} w={100} h={28} label="✕ Close" color="#374151" hoverColor="#4b5563" onClick={onToggleWorldMenu} />
          </HtmlPanel>
        )}

        {/* ── Pause / controls menu (center) ── */}
        {paused && (
          <HtmlPanel x={0} y={0} w={340} h={380} anchor="center" color="#0d1117" opacity={0.97} borderColor="#1f2937">
            <HtmlText x={12} y={10} text="⚡ VoltCraft" fontSize={22} color="#38bdf8" fontWeight="bold" />
            <HtmlDivider x={8} y={38} w={324} />
            {[
              'WASD / Arrows – Move',
              'Mouse – Look around',
              'Left Click – Break block',
              'Right Click – Place block',
              'Space – Jump / Fly up',
              'Shift – Sneak / Fly down',
              '1–0 – Hotbar slots',
              'E – Inventory',
              'M – World menu',
              'Esc – Pause / Resume',
            ].map((line, i) => (
              <HtmlText key={i} x={16} y={46 + i * 22} text={line} fontSize={13} color="#9ca3af" />
            ))}
            <HtmlDivider x={8} y={270} w={324} />
            <HtmlButton x={70} y={282} w={200} h={36} label="▶  Resume" color="#1d4ed8" hoverColor="#1e40af" onClick={onResume} />
          </HtmlPanel>
        )}
      </HtmlOverlay>
    </>
  )
}

// ─── World scene ──────────────────────────────────────────────────────────────
function WorldScene({
  blockGroups, players, localId,
  localPosRef, chunkRef, setChunkState, setPosSample,
  mode, paused, setPaused, setPointerLocked,
  onInteract, onResume,
  onSelectSlot, onToggleInventory, onToggleSave, onToggleWorldMenu,
  showInventory, showWorldMenu,
  hoveredRef,
  voxelMeshesRef,  // ref to array of instanced meshes for raycasting
}) {
  const keys    = useRef({})
  const yaw     = useRef(-Math.PI / 4)
  const pitch   = useRef(-0.25)
  const velY    = useRef(0)
  const onGround = useRef(false)
  const lastSample = useRef(0)
  const raycaster = useRef(new THREE.Raycaster())
  raycaster.current.far = PLAYER_REACH + 1  // limit raycast distance
  const center    = useRef(new THREE.Vector2(0, 0))
  const { camera, gl } = useThree()

  useEffect(() => {
    camera.position.set(...localPosRef.current)
    camera.rotation.order = 'YXZ'
  }, [camera, localPosRef])

  useEffect(() => {
    const kd = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.current.fwd  = true; break
        case 'KeyS': case 'ArrowDown':  keys.current.bwd  = true; break
        case 'KeyA': case 'ArrowLeft':  keys.current.lft  = true; break
        case 'KeyD': case 'ArrowRight': keys.current.rgt  = true; break
        case 'Space':    keys.current.jmp  = true; e.preventDefault(); break
        case 'ShiftLeft':keys.current.snk  = true; break
        case 'ControlLeft': keys.current.spr = true; break
        case 'Escape':   setPaused(p => !p); if (!paused) document.exitPointerLock?.(); break
        case 'KeyE':     if (!paused) onToggleInventory(); break
        case 'KeyM':     if (!paused) onToggleWorldMenu(); break
        case 'KeyF':     keys.current.fly = !keys.current.fly; break
        case 'Digit1': case 'Numpad1': onSelectSlot(0); break
        case 'Digit2': case 'Numpad2': onSelectSlot(1); break
        case 'Digit3': case 'Numpad3': onSelectSlot(2); break
        case 'Digit4': case 'Numpad4': onSelectSlot(3); break
        case 'Digit5': case 'Numpad5': onSelectSlot(4); break
        case 'Digit6': case 'Numpad6': onSelectSlot(5); break
        case 'Digit7': case 'Numpad7': onSelectSlot(6); break
        case 'Digit8': case 'Numpad8': onSelectSlot(7); break
        case 'Digit9': case 'Numpad9': onSelectSlot(8); break
        case 'Digit0': case 'Numpad0': onSelectSlot(9); break
      }
    }
    const ku = e => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.current.fwd  = false; break
        case 'KeyS': case 'ArrowDown':  keys.current.bwd  = false; break
        case 'KeyA': case 'ArrowLeft':  keys.current.lft  = false; break
        case 'KeyD': case 'ArrowRight': keys.current.rgt  = false; break
        case 'Space':    keys.current.jmp  = false; break
        case 'ShiftLeft':keys.current.snk  = false; break
        case 'ControlLeft': keys.current.spr = false; break
      }
    }
    const mm = e => {
      if (document.pointerLockElement !== gl.domElement || paused) return
      yaw.current   -= e.movementX * 0.0022
      pitch.current  = clamp(pitch.current - e.movementY * 0.0022, -1.45, 1.45)
    }
    const md = e => {
      if (document.pointerLockElement !== gl.domElement) {
        // Request pointer lock on any click when not locked
        gl.domElement.requestPointerLock()
        return
      }
      if (paused) return
      if (hoveredRef.current) onInteract({ block: hoveredRef.current, button: e.button })
    }
    const lc = () => {
      const locked = document.pointerLockElement === gl.domElement
      setPointerLocked(locked)
      if (!locked && !paused) setPaused(true)
    }
    const wheel = e => {
      if (paused) return
      onSelectSlot(s => (s + (e.deltaY > 0 ? 1 : -1) + 10) % 10)
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    gl.domElement.addEventListener('mousemove', mm)
    gl.domElement.addEventListener('mousedown', md)
    gl.domElement.addEventListener('wheel', wheel, { passive: true })
    document.addEventListener('pointerlockchange', lc)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      gl.domElement.removeEventListener('mousemove', mm)
      gl.domElement.removeEventListener('mousedown', md)
      gl.domElement.removeEventListener('wheel', wheel)
      document.removeEventListener('pointerlockchange', lc)
    }
  }, [gl.domElement, paused, onInteract, onResume, setPaused, setPointerLocked, onSelectSlot, onToggleInventory, onToggleWorldMenu])

  useFrame((state, delta) => {
    const pos = localPosRef.current
    const isCreative = mode === 'creative'
    const spd = (isCreative ? CREATIVE_SPEED : SURVIVAL_SPEED) * (keys.current.spr ? SPRINT_MULT : 1)

    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    if (!paused && !showInventory && !showWorldMenu) {
      let dx = 0, dz = 0
      if (keys.current.fwd) dz -= 1
      if (keys.current.bwd) dz += 1
      if (keys.current.lft) dx -= 1
      if (keys.current.rgt) dx += 1
      if (dx !== 0 || dz !== 0) {
        const cos = Math.cos(yaw.current), sin = Math.sin(yaw.current)
        pos[0] += (-dz*sin - dx*cos) * spd * delta
        pos[2] += (-dz*cos + dx*sin) * spd * delta
      }
      if (isCreative || keys.current.fly) {
        const vert = (keys.current.jmp ? 1 : 0) - (keys.current.snk ? 1 : 0)
        pos[1] = clamp(pos[1] + vert * spd * 0.75 * delta, 1, 80)
        velY.current = 0
      } else {
        const groundY = (chunkRef.current.groundY ?? 14) + PLAYER_HEIGHT
        if (pos[1] <= groundY + 0.05) {
          pos[1] = groundY; velY.current = 0; onGround.current = true
          if (keys.current.jmp) { velY.current = JUMP_VEL; onGround.current = false }
        } else {
          onGround.current = false
          velY.current -= GRAVITY * delta
        }
        pos[1] += velY.current * delta
        if (pos[1] < groundY) { pos[1] = groundY; velY.current = 0 }
      }
    }

    camera.position.set(pos[0], pos[1], pos[2])

    // Raycasting (throttled) – only against voxel instanced meshes, NOT full scene
    if (state.clock.elapsedTime % 0.06 < delta) {
      raycaster.current.setFromCamera(center.current, camera)
      const meshList = voxelMeshesRef ? Object.values(voxelMeshesRef.current) : []
      let hit = null
      if (meshList.length > 0) {
        const hits = raycaster.current.intersectObjects(meshList, false)
        hit = hits[0] || null
      }
      if (hit) {
        // Block being looked at: step slightly INTO the block from the hit point
        const bx = Math.floor(hit.point.x - hit.face.normal.x * 0.5)
        const by = Math.floor(hit.point.y - hit.face.normal.y * 0.5)
        const bz = Math.floor(hit.point.z - hit.face.normal.z * 0.5)
        // Adjacent face position for placement: step OUT from the block along the normal
        const fx = Math.floor(hit.point.x + hit.face.normal.x * 0.5)
        const fy = Math.floor(hit.point.y + hit.face.normal.y * 0.5)
        const fz = Math.floor(hit.point.z + hit.face.normal.z * 0.5)
        hoveredRef.current = { x: bx, y: by, z: bz, faceX: fx, faceY: fy, faceZ: fz, name: hit.object.userData?.blockType }
      } else {
        hoveredRef.current = null
      }
    }

    // Position sampling
    const now = performance.now()
    if (now - lastSample.current >= 180) {
      lastSample.current = now
      setPosSample([...pos])
      const cx = Math.floor(pos[0] / CHUNK_SIZE), cz = Math.floor(pos[2] / CHUNK_SIZE)
      if (cx !== chunkRef.current.x || cz !== chunkRef.current.z) {
        chunkRef.current = { ...chunkRef.current, x: cx, z: cz }
        setChunkState({ x: cx, z: cz })
      }
    }
  })

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[12, 22, 10]} intensity={1.1} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.5} shadow-camera-far={80}
        shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40} />
      <hemisphereLight args={['#87ceeb', '#2d6a43', 0.5]} />
      <fog attach="fog" args={['#9fd2ff', 28, 72]} />

      {Object.entries(blockGroups).map(([type, data]) => (
        <InstancedVoxelLayer
          key={type}
          type={type}
          buf={data.buf}
          count={data.count}
          onMeshReady={voxelMeshesRef ? (t, mesh) => { voxelMeshesRef.current[t] = mesh } : undefined}
        />
      ))}

      <HighlightBox position={hoveredRef.current} />
      <PlayerMarkers players={players} localId={localId} />
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const VoltCraftActivity = ({ sdk, currentUser }) => {
  const userId   = currentUser?.id       || 'guest'
  const username = currentUser?.username || 'Guest'
  const userColor = currentUser?.color   || '#38bdf8'

  const localPosRef    = useRef([0, 16, 0])
  const chunkRef       = useRef({ x: 0, z: 0, groundY: 14 })
  const workerRef      = useRef(null)
  const changesRef     = useRef({})
  const hoveredRef     = useRef(null)
  const worldIdRef     = useRef(`world_${Date.now()}`)
  const worldSeedRef   = useRef(Math.floor(Math.random() * 999999))
  // Map of blockType → InstancedMesh for targeted raycasting (avoids full scene traversal)
  const voxelMeshesRef = useRef({})

  const [blockGroups,    setBlockGroups]    = useState({})
  const [players,        setPlayers]        = useState({})
  const [isLoading,      setIsLoading]      = useState(true)
  const [loadingPct,     setLoadingPct]     = useState(0)
  const [loadingMsg,     setLoadingMsg]     = useState('Starting worker...')
  const [mode,           setMode]           = useState('creative')
  const [selectedSlot,   setSelectedSlot]   = useState(0)
  const [hotbar,         setHotbar]         = useState(DEFAULT_HOTBAR)
  const [statusMsg,      setStatusMsg]      = useState('Welcome to VoltCraft!')
  const [health,         setHealth]         = useState(20)
  const [hunger,         setHunger]         = useState(20)
  const [xp,             setXp]             = useState(0)
  const [level,          setLevel]          = useState(1)
  const [currentChunk,   setCurrentChunk]   = useState({ x: 0, z: 0 })
  const [posSample,      setPosSample]      = useState([0, 16, 0])
  const [paused,         setPaused]         = useState(true)
  const [pointerLocked,  setPointerLocked]  = useState(false)
  const [workerReady,    setWorkerReady]    = useState(false)
  const [showInventory,  setShowInventory]  = useState(false)
  const [showWorldMenu,  setShowWorldMenu]  = useState(false)
  const [invCategory,    setInvCategory]    = useState('Natural')
  const [savedWorlds,    setSavedWorlds]    = useState([])
  const [worldName,      setWorldName]      = useState('New World')
  const [savedAt,        setSavedAt]        = useState(null)
  const [time,           setTime]           = useState(480) // 8:00 AM
  const [weather,        setWeather]        = useState('☀️')
  const [hoveredBlock,   setHoveredBlock]   = useState(null)

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

  // ── Hunger drain (survival) ─────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'survival') return
    const iv = setInterval(() => {
      setHunger(h => Math.max(0, h - 0.5))
    }, 5000)
    return () => clearInterval(iv)
  }, [mode])

  // ── Init worker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new VCWorker()
    workerRef.current = worker
    setSavedWorlds(listSavedWorlds())

    let pct = 0
    const ticker = setInterval(() => {
      pct = Math.min(pct + Math.random() * 12 + 4, 88)
      setLoadingPct(Math.round(pct))
    }, 60)

    setLoadingMsg('Initialising terrain worker...')
    worker.init(worldSeedRef.current).then(() => {
      setLoadingMsg('Getting spawn height...')
      setWorkerReady(true)
      return worker.getTerrainHeight(0, 0)
    }).then(res => {
      const gy = res.height ?? 14
      localPosRef.current = [0, gy + PLAYER_HEIGHT + 1, 0]
      chunkRef.current = { x: 0, z: 0, groundY: gy }
      clearInterval(ticker)
      setLoadingPct(100)
      setLoadingMsg('Done!')
      setTimeout(() => setIsLoading(false), 250)
    }).catch(err => {
      console.error('[VoltCraft] Worker init failed:', err)
      clearInterval(ticker)
      localPosRef.current = [0, 18, 0]
      setLoadingPct(100)
      setTimeout(() => setIsLoading(false), 250)
    })

    return () => { worker.terminate(); workerRef.current = null }
  }, [])

  // ── Fetch blocks ─────────────────────────────────────────────────────────────
  const fetchBlocks = useCallback(async (cx, cz) => {
    const w = workerRef.current
    if (!w) return
    try {
      const res = await w.getVisibleBlocks(cx, cz, VIEW_RADIUS)
      if (res.type !== 'visibleBlocks') return
      const groups = {}
      for (const [name, int16] of Object.entries(res.blocks)) {
        groups[name] = { buf: int16, count: int16.length / 3 }
      }
      setBlockGroups(groups)
    } catch(e) { console.warn('[VoltCraft] fetchBlocks:', e) }
  }, [])

  useEffect(() => {
    if (!workerReady) return
    fetchBlocks(currentChunk.x, currentChunk.z)
  }, [currentChunk, workerReady, fetchBlocks])

  // ── Hovered block sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => setHoveredBlock(hoveredRef.current), 100)
    return () => clearInterval(iv)
  }, [])

  // ── Block interaction ────────────────────────────────────────────────────────
  const handleInteract = useCallback(async ({ block, button }) => {
    const w = workerRef.current
    if (!w || !block) return
    const pos = localPosRef.current
    const dist = Math.sqrt((block.x+0.5-pos[0])**2 + (block.y+0.5-pos[1])**2 + (block.z+0.5-pos[2])**2)
    if (dist > PLAYER_REACH) return

    if (button === 0) {
      // Break
      const res = await w.breakBlock(block.x, block.y, block.z)
      if (res.type === 'breakBlock:done') {
        changesRef.current = res.changes
        setStatusMsg(`Broke ${block.name?.replace(/_/g,' ')}`)
        setXp(x => { const nx = x + 2; if (nx >= 100) { setLevel(l => l+1); return 0 } return nx })
        sdk?.emitEvent?.('voltcraft:block', { userId, action:'break', x:block.x, y:block.y, z:block.z }, { serverRelay:true })
        fetchBlocks(chunkRef.current.x, chunkRef.current.z)
      }
    } else if (button === 2) {
      // Place on adjacent face
      const blockName = hotbar[selectedSlot]
      if (!blockName) return
      const fx = block.faceX ?? block.x, fy = block.faceY ?? block.y, fz = block.faceZ ?? block.z
      const res = await w.placeBlock(fx, fy, fz, blockName)
      if (res.type === 'placeBlock:done') {
        changesRef.current = res.changes
        setStatusMsg(`Placed ${blockName.replace(/_/g,' ')}`)
        sdk?.emitEvent?.('voltcraft:block', { userId, action:'place', x:fx, y:fy, z:fz, blockName }, { serverRelay:true })
        fetchBlocks(chunkRef.current.x, chunkRef.current.z)
      }
    }
  }, [sdk, userId, hotbar, selectedSlot, fetchBlocks])

  // ── Save world ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    saveWorld(worldIdRef.current, worldName, worldSeedRef.current, changesRef.current)
    setSavedAt(Date.now())
    setSavedWorlds(listSavedWorlds())
    setStatusMsg('World saved!')
  }, [worldName])

  // ── Load world ───────────────────────────────────────────────────────────────
  const handleLoadWorld = useCallback(async (wid) => {
    const data = loadWorld(wid)
    if (!data) return
    worldIdRef.current = wid
    worldSeedRef.current = data.seed
    changesRef.current = data.changes || {}
    setWorldName(data.name)
    setSavedAt(data.savedAt)
    setShowWorldMenu(false)
    setIsLoading(true)
    setLoadingPct(0)
    setLoadingMsg('Loading world...')

    const w = workerRef.current
    if (!w) return
    let pct = 0
    const ticker = setInterval(() => { pct = Math.min(pct + 15, 85); setLoadingPct(Math.round(pct)) }, 80)
    await w.init(data.seed)
    await w.setWorldChanges(data.changes || {})
    const res = await w.getTerrainHeight(0, 0)
    const gy = res.height ?? 14
    localPosRef.current = [0, gy + PLAYER_HEIGHT + 1, 0]
    chunkRef.current = { x: 0, z: 0, groundY: gy }
    clearInterval(ticker)
    setLoadingPct(100)
    setWorkerReady(true)
    setTimeout(() => setIsLoading(false), 200)
    setStatusMsg(`Loaded world: ${data.name}`)
  }, [])

  // ── New world ────────────────────────────────────────────────────────────────
  const handleNewWorld = useCallback(async () => {
    const newSeed = Math.floor(Math.random() * 999999)
    const newId = `world_${Date.now()}`
    worldIdRef.current = newId
    worldSeedRef.current = newSeed
    changesRef.current = {}
    setWorldName(`World ${new Date().toLocaleDateString()}`)
    setSavedAt(null)
    setShowWorldMenu(false)
    setIsLoading(true)
    setLoadingPct(0)
    setLoadingMsg('Generating new world...')

    const w = workerRef.current
    if (!w) return
    let pct = 0
    const ticker = setInterval(() => { pct = Math.min(pct + 15, 85); setLoadingPct(Math.round(pct)) }, 80)
    await w.init(newSeed)
    const res = await w.getTerrainHeight(0, 0)
    const gy = res.height ?? 14
    localPosRef.current = [0, gy + PLAYER_HEIGHT + 1, 0]
    chunkRef.current = { x: 0, z: 0, groundY: gy }
    clearInterval(ticker)
    setLoadingPct(100)
    setWorkerReady(true)
    setTimeout(() => setIsLoading(false), 200)
    setStatusMsg('New world generated!')
  }, [])

  // ── Delete world ─────────────────────────────────────────────────────────────
  const handleDeleteWorld = useCallback((wid) => {
    deleteWorld(wid)
    setSavedWorlds(listSavedWorlds())
  }, [])

  // ── Pick block from inventory ─────────────────────────────────────────────────
  const handlePickBlock = useCallback((block) => {
    setHotbar(prev => {
      const next = [...prev]
      next[selectedSlot] = block
      return next
    })
    setStatusMsg(`Selected: ${block.replace(/_/g,' ')}`)
  }, [selectedSlot])

  // ── SDK ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdk) return
    const offState = sdk.subscribeServerState?.((state) => {
      const changes = state?.voltCraft?.changes
      if (changes && workerRef.current) {
        changesRef.current = changes
        workerRef.current.setWorldChanges(changes).then(() =>
          fetchBlocks(chunkRef.current.x, chunkRef.current.z))
      }
    })
    const offEvent = sdk.on?.('event', (evt) => {
      const p = evt.payload || {}
      if (p.userId === userId) return
      if (evt.eventType === 'voltcraft:player') {
        setPlayers(prev => ({ ...prev, [p.userId]: { userId:p.userId, username:p.username||'Guest', position:p.position||[0,10,0], color:p.color||'#f472b6' } }))
      } else if (evt.eventType === 'voltcraft:leave') {
        setPlayers(prev => { const n={...prev}; delete n[p.userId]; return n })
      } else if (evt.eventType === 'voltcraft:block' && workerRef.current) {
        const { action, x, y, z, blockName } = p
        if (action === 'break') workerRef.current.breakBlock(x,y,z).then(() => fetchBlocks(chunkRef.current.x, chunkRef.current.z))
        else if (action === 'place' && blockName) workerRef.current.placeBlock(x,y,z,blockName).then(() => fetchBlocks(chunkRef.current.x, chunkRef.current.z))
      }
    })
    sdk.emitEvent?.('voltcraft:player', { userId, username, position:localPosRef.current, color:userColor }, { serverRelay:true })
    return () => {
      sdk.emitEvent?.('voltcraft:leave', { userId }, { serverRelay:true })
      offState?.(); offEvent?.()
    }
  }, [sdk, userId, username, userColor, fetchBlocks])

  // ── Player position sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdk) return
    const iv = setInterval(() => {
      sdk.emitEvent?.('voltcraft:player', { userId, username, position:localPosRef.current, color:userColor, mode }, { serverRelay:true })
    }, PLAYER_SYNC_MS)
    return () => clearInterval(iv)
  }, [sdk, userId, username, userColor, mode])

  useEffect(() => {
    setPlayers(prev => ({ ...prev, [userId]: { userId, username, position:posSample, color:userColor } }))
  }, [userId, username, posSample, userColor])

  const resumeGame = useCallback(() => {
    setPaused(false)
    setShowInventory(false)
    setShowWorldMenu(false)
    setTimeout(() => document.querySelector('canvas')?.requestPointerLock(), 20)
  }, [])

  const toggleInventory = useCallback(() => {
    setShowInventory(v => !v)
    setShowWorldMenu(false)
  }, [])

  const toggleWorldMenu = useCallback(() => {
    setShowWorldMenu(v => !v)
    setShowInventory(false)
    setSavedWorlds(listSavedWorlds())
  }, [])

  // ── Loading screen ───────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', background:'#1a1a2e', color:'#fff', gap:20, fontFamily:'monospace' }}>
      <div style={{ fontSize:32, fontWeight:'bold' }}>⚡ VoltCraft</div>
      <div style={{ fontSize:14, opacity:0.7 }}>{loadingMsg}</div>
      <div style={{ width:260, height:10, background:'#333', borderRadius:5, overflow:'hidden' }}>
        <div style={{ width:`${loadingPct}%`, height:'100%', background:'linear-gradient(90deg,#3b82f6,#38bdf8)', transition:'width 0.15s ease' }} />
      </div>
      <div style={{ fontSize:12, opacity:0.5 }}>{loadingPct}%</div>
    </div>
  )

  return (
    <div style={{ width:'100%', height:'100%', background:'#1a1a2e' }} onContextMenu={e => e.preventDefault()}>
      <WebGLErrorBoundary>
        <Canvas
          shadows
          gl={{ antialias:true, powerPreference:'high-performance', failIfMajorPerformanceCaveat:false }}
          camera={{ fov:75, near:0.08, far:120 }}
          dpr={[1, Math.min(window.devicePixelRatio, 2)]}
          frameloop="always"
        >
          <color attach="background" args={['#87ceeb']} />
          <Suspense fallback={null}>
            <WorldScene
              blockGroups={blockGroups}
              players={players}
              localId={userId}
              localPosRef={localPosRef}
              chunkRef={chunkRef}
              setChunkState={setCurrentChunk}
              setPosSample={setPosSample}
              mode={mode}
              paused={paused}
              setPaused={setPaused}
              setPointerLocked={setPointerLocked}
              onInteract={handleInteract}
              onResume={resumeGame}
              onSelectSlot={setSelectedSlot}
              onToggleInventory={toggleInventory}
              onToggleSave={handleSave}
              onToggleWorldMenu={toggleWorldMenu}
              showInventory={showInventory}
              showWorldMenu={showWorldMenu}
              hoveredRef={hoveredRef}
              voxelMeshesRef={voxelMeshesRef}
            />
            <VoltCraftHUD
              mode={mode}
              health={health}
              maxHealth={20}
              hunger={hunger}
              xp={xp}
              level={level}
              currentChunk={currentChunk}
              pos={posSample}
              statusMsg={statusMsg}
              selectedSlot={selectedSlot}
              hotbar={hotbar}
              onSelectSlot={setSelectedSlot}
              paused={paused}
              onResume={resumeGame}
              showInventory={showInventory}
              onToggleInventory={toggleInventory}
              inventoryCategory={invCategory}
              onSetCategory={setInvCategory}
              onPickBlock={handlePickBlock}
              hoveredBlock={hoveredBlock}
              time={time}
              weather={weather}
              worldName={worldName}
              savedAt={savedAt}
              onSave={handleSave}
              showWorldMenu={showWorldMenu}
              onToggleWorldMenu={toggleWorldMenu}
              savedWorlds={savedWorlds}
              onLoadWorld={handleLoadWorld}
              onNewWorld={handleNewWorld}
              onDeleteWorld={handleDeleteWorld}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  )
}

export default VoltCraftActivity
