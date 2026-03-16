import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const SOUND_KEYS = [
  'ringtone', 'messageReceived', 'dmReceived', 'mention', 'dmMention', 'callJoin', 'callConnected',
  'callLeft', 'callEnded', 'callDeclined', 'userJoined', 'userLeft', 'mute', 'unmute', 'deafen',
  'undeafen', 'screenShareStart', 'screenShareStop', 'cameraOn', 'cameraOff', 'voiceKick',
  'serverJoined', 'roleAdded', 'roleRemoved', 'notification', 'error', 'success', 'typing', 'welcome', 'logout'
]

const KEY_HINTS = {
  ringtone: ['ring', 'phone', 'call', 'alert'],
  messageReceived: ['message', 'notify', 'notification', 'click'],
  dmReceived: ['message', 'notify', 'notification', 'click'],
  mention: ['alert', 'ping', 'notify', 'notification'],
  dmMention: ['alert', 'ping', 'notify', 'notification'],
  callJoin: ['accept', 'confirm', 'open', 'on'],
  callConnected: ['success', 'confirm', 'powerup', 'on'],
  callLeft: ['close', 'off', 'decline', 'down'],
  callEnded: ['close', 'off', 'decline', 'down'],
  callDeclined: ['decline', 'error', 'denied', 'wrong'],
  userJoined: ['open', 'up', 'powerup', 'positive'],
  userLeft: ['close', 'down', 'negative', 'off'],
  mute: ['mute', 'off', 'down', 'low'],
  unmute: ['unmute', 'on', 'up', 'high'],
  deafen: ['off', 'down', 'mute', 'negative'],
  undeafen: ['on', 'up', 'positive', 'open'],
  screenShareStart: ['start', 'on', 'open', 'up'],
  screenShareStop: ['stop', 'off', 'close', 'down'],
  cameraOn: ['on', 'open', 'up', 'focus'],
  cameraOff: ['off', 'close', 'down', 'error'],
  voiceKick: ['error', 'denied', 'wrong', 'negative'],
  serverJoined: ['success', 'powerup', 'positive', 'start'],
  roleAdded: ['success', 'powerup', 'up', 'positive'],
  roleRemoved: ['down', 'negative', 'off', 'decline'],
  notification: ['notify', 'notification', 'ping', 'message'],
  error: ['error', 'denied', 'wrong', 'negative'],
  success: ['success', 'powerup', 'correct', 'positive'],
  typing: ['tick', 'tap', 'type', 'click'],
  welcome: ['welcome', 'start', 'powerup', 'success'],
  logout: ['logout', 'close', 'off', 'down']
}

const PACKS = [
  {
    id: 'kenney_interface',
    url: 'https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip',
    source: 'https://opengameart.org/content/interface-sounds',
    license: 'CC0'
  },
  {
    id: 'button_hitech',
    url: 'https://lpc.opengameart.org/sites/default/files/Button%20SFX%20Pack%20III%20-%20Hi-Tech.zip',
    source: 'https://lpc.opengameart.org/content/button-sfx-pack-iii-assortment-ot-hi-tech',
    license: 'CC0',
    preferredExt: 'wav'
  },
  {
    id: 'owlish',
    url: 'https://opengameart.org/sites/default/files/Owlish%20Media%20Sound%20Effects.zip',
    source: 'https://opengameart.org/content/sound-effects-pack',
    license: 'CC0'
  },
  {
    id: 'ui51',
    url: 'https://opengameart.org/sites/default/files/UI_SFX_Set.zip',
    source: 'https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks',
    license: 'CC0'
  },
  {
    id: 'digital63',
    url: 'https://opengameart.org/sites/default/files/Digital_SFX_Set.zip',
    source: 'https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc',
    license: 'CC0'
  },
  {
    id: 'retro512',
    url: 'https://opengameart.org/sites/default/files/The%20Essential%20Retro%20Video%20Game%20Sound%20Effects%20Collection%20%5B512%20sounds%5D.zip',
    source: 'https://opengameart.org/content/512-sound-effects-8-bit-style',
    license: 'CC0'
  },
  {
    id: 'rpg50',
    url: 'https://opengameart.org/sites/default/files/RPGsounds_Kenney.zip',
    source: 'https://opengameart.org/content/50-rpg-sound-effects',
    license: 'CC0'
  },
  // Curated alternates from the same CC0 sources (different mapping seeds)
  { id: 'kenney_interface_alt1', sourcePack: 'kenney_interface', source: 'https://opengameart.org/content/interface-sounds', license: 'CC0', preferredExt: 'ogg', variant: 1 },
  { id: 'kenney_interface_alt2', sourcePack: 'kenney_interface', source: 'https://opengameart.org/content/interface-sounds', license: 'CC0', preferredExt: 'ogg', variant: 2 },
  { id: 'button_hitech_alt', sourcePack: 'button_hitech', source: 'https://lpc.opengameart.org/content/button-sfx-pack-iii-assortment-ot-hi-tech', license: 'CC0', preferredExt: 'wav', variant: 1 },
  { id: 'owlish_ui', sourcePack: 'owlish', source: 'https://opengameart.org/content/sound-effects-pack', license: 'CC0', preferredExt: 'wav', variant: 1 },
  { id: 'owlish_scifi', sourcePack: 'owlish', source: 'https://opengameart.org/content/sound-effects-pack', license: 'CC0', preferredExt: 'wav', variant: 2 },
  { id: 'ui51_alt', sourcePack: 'ui51', source: 'https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks', license: 'CC0', preferredExt: 'wav', variant: 1 },
  { id: 'digital63_alt', sourcePack: 'digital63', source: 'https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc', license: 'CC0', preferredExt: 'mp3', variant: 1 },
  { id: 'retro512_alt1', sourcePack: 'retro512', source: 'https://opengameart.org/content/512-sound-effects-8-bit-style', license: 'CC0', preferredExt: 'wav', variant: 1 },
  { id: 'retro512_alt2', sourcePack: 'retro512', source: 'https://opengameart.org/content/512-sound-effects-8-bit-style', license: 'CC0', preferredExt: 'wav', variant: 2 },
  { id: 'rpg50_alt', sourcePack: 'rpg50', source: 'https://opengameart.org/content/50-rpg-sound-effects', license: 'CC0', preferredExt: 'ogg', variant: 1 }
]

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT_ROOT = path.join(ROOT, 'public', 'sounds', 'royalty')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'volt-royalty-'))
const CACHE_DIR = path.join(os.tmpdir(), 'volt_sfx_dl')

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function baseNoExt(file) {
  return path.basename(file).replace(/\.[^.]+$/, '').toLowerCase()
}

function pickFiles(pack, files) {
  const preferred = pack.preferredExt
    ? files.filter((f) => path.extname(f).toLowerCase() === `.${pack.preferredExt}`)
    : files
  const pool = preferred.length > 0 ? preferred : files
  const unused = new Set(pool)
  const mapped = {}
  const variant = Number(pack.variant || 0)

  for (const key of SOUND_KEYS) {
    let chosen = null
    for (const hint of (KEY_HINTS[key] || [])) {
      const hits = [...unused].filter((f) => baseNoExt(f).includes(hint))
      if (hits.length) {
        chosen = hits[variant % hits.length]
        break
      }
    }
    if (!chosen) {
      const arr = [...unused]
      chosen = arr[(variant * 7 + key.length) % Math.max(1, arr.length)] || pool[(variant * 5) % pool.length]
    }
    if (!chosen) throw new Error(`No files for ${pack.id}`)
    unused.delete(chosen)
    mapped[key] = chosen
  }

  return mapped
}

fs.mkdirSync(OUT_ROOT, { recursive: true })
const extractedById = new Map()

for (const pack of PACKS) {
  const srcDir = path.join(TMP, pack.id)
  fs.mkdirSync(srcDir, { recursive: true })

  let files = []
  if (pack.sourcePack) {
    const reuse = extractedById.get(pack.sourcePack)
    if (!reuse) throw new Error(`sourcePack not prepared: ${pack.sourcePack}`)
    files = reuse
    console.log(`[variant] ${pack.id} from ${pack.sourcePack}`)
  } else {
    const zipPath = path.join(TMP, `${pack.id}.zip`)
    const cachedZip = path.join(CACHE_DIR, `${pack.id}.zip`)
    if (fs.existsSync(cachedZip)) {
      console.log(`[cache] ${pack.id}`)
      fs.copyFileSync(cachedZip, zipPath)
    } else {
      console.log(`[download] ${pack.id}`)
      execSync(`curl -fL '${pack.url}' -o '${zipPath}'`, { stdio: 'inherit' })
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.copyFileSync(zipPath, cachedZip)
    }
    execSync(`unzip -oq '${zipPath}' -d '${srcDir}'`, { stdio: 'inherit' })
    files = walk(srcDir).filter((f) => /\.(wav|ogg|mp3)$/i.test(f))
    extractedById.set(pack.id, files)
  }
  const selected = pickFiles(pack, files)

  const outDir = path.join(OUT_ROOT, pack.id)
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  const manifest = {
    pack: pack.id,
    source: pack.source,
    license: pack.license,
    generatedAt: new Date().toISOString(),
    files: {}
  }

  for (const key of SOUND_KEYS) {
    const src = selected[key]
    const ext = path.extname(src).toLowerCase()
    const outName = `${key}${ext}`
    fs.copyFileSync(src, path.join(outDir, outName))
    manifest.files[key] = outName
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(outDir, 'LICENSE.txt'), `License: ${pack.license}\nSource: ${pack.source}\n`)

  console.log(`[install] ${pack.id} -> ${Object.keys(manifest.files).length} sounds`)
}

console.log('[done] royalty soundpacks installed')
