import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { createDefconAudio } from './shared/defconAudio'
import GameCanvasShell from './shared/GameCanvasShell'
import CanvasText from './shared/CanvasText'

const PHASES = ['intel', 'diplomacy', 'military', 'resolution']
const PHASE_DURATION_MS = 22000
const NULLFIRE_DURATION_MS = 30000
const MAX_COUNTRIES = 8
const AI_FILL = 6
const ECONOMIC_VICTORY_GDP = 165
const DIPLOMATIC_VICTORY_SEASON = 6
const SANCTIONS_DURATION = 2
const AI_COMMIT_DELAY_MS = 2200
const MAD_STRIKE_COOLDOWN_MS = 18000
const INTERCEPT_COOLDOWN_MS = 30000
const INTERCEPT_SUCCESS_RATE = 0.5
const DECOY_CHANCE = 0.28
const NULLFIRE_RESPONSE_MS = 60000

const CITY_NAMES = {
  superpower: ['Crown Basin', 'Blue Mesa', 'Hallow Port'],
  rising: ['Glass Delta', 'Sunspire', 'Neon Reach'],
  rogue: ['Obsidian Gate', 'Viper Bay', 'Iron Hollow'],
  neutral: ['Ivory Step', 'Peace Harbor', 'Helix Square'],
  anchor: ['Northgate', 'Treaty Point', 'Harbor Nine'],
  fractured: ['Ashfall', 'Broken Hill', 'Kestrel Yard'],
  maritime: ['Drift City', 'Tideglass', 'Beacon Quay'],
  industrial: ['Steelhaven', 'Foundry Crown', 'Rail Zenith']
}

const ARCHETYPES = [
  { id: 'superpower', label: 'The Superpower', countryName: 'Aster Union', color: '#60a5fa', lat: 45, lon: -100, economy: 8, stability: 7, conventional: 8, nuclearTier: 5, arsenal: 9, doctrine: 'heavy' },
  { id: 'rising', label: 'The Rising Power', countryName: 'Orion Pact', color: '#f97316', lat: 28, lon: 110, economy: 7, stability: 6, conventional: 7, nuclearTier: 3, arsenal: 6, doctrine: 'growth' },
  { id: 'rogue', label: 'The Rogue State', countryName: 'Vanta Republic', color: '#ef4444', lat: 36, lon: 45, economy: 4, stability: 4, conventional: 5, nuclearTier: 2, arsenal: 4, doctrine: 'spike' },
  { id: 'neutral', label: 'The Neutral', countryName: 'Helios Accord', color: '#34d399', lat: 12, lon: 15, economy: 8, stability: 8, conventional: 3, nuclearTier: 0, arsenal: 0, doctrine: 'deescalate' },
  { id: 'anchor', label: 'The Alliance Anchor', countryName: 'Northwatch League', color: '#a78bfa', lat: 54, lon: 12, economy: 6, stability: 7, conventional: 6, nuclearTier: 2, arsenal: 4, doctrine: 'bloc' },
  { id: 'fractured', label: 'The Fractured State', countryName: 'Sable Federation', color: '#f43f5e', lat: -9, lon: 29, economy: 5, stability: 3, conventional: 5, nuclearTier: 1, arsenal: 2, doctrine: 'volatile' },
  { id: 'maritime', label: 'The Maritime Power', countryName: 'Pelagic Crown', color: '#22d3ee', lat: -28, lon: 142, economy: 6, stability: 6, conventional: 6, nuclearTier: 2, arsenal: 3, doctrine: 'naval' },
  { id: 'industrial', label: 'The Industrial Bloc', countryName: 'Iron Meridian', color: '#fbbf24', lat: 52, lon: 82, economy: 7, stability: 5, conventional: 7, nuclearTier: 4, arsenal: 7, doctrine: 'shield' }
]

const EVENT_FEED_LIMIT = 10
const RED_PHONE_COLOR = '#fb7185'
const blocNames = ['Aegis Bloc', 'Solstice Compact', 'Northern Shield']

const actionCatalog = {
  intel: [
    { id: 'scan', label: 'Intel Scan', description: 'Build a better read on rival intent.' },
    { id: 'cyber', label: 'Cyber Disrupt', description: 'Damage a rival economy and spike suspicion.' },
    { id: 'counterintel', label: 'Counterintel', description: 'Harden domestic stability.' }
  ],
  diplomacy: [
    { id: 'red-phone', label: 'Red Phone', description: 'Attempt a bilateral de-escalation.' },
    { id: 'trade-pact', label: 'Trade Pact', description: 'Build GDP while lowering tension.' },
    { id: 'peace-summit', label: 'Peace Summit', description: 'Push the room toward a pause.' },
    { id: 'bloc-charter', label: 'Bloc Charter', description: 'Build a military bloc.' },
    { id: 'sanctions', label: 'Sanctions', description: 'Punish a rival economy.' },
    { id: 'aid-corridor', label: 'Aid Corridor', description: 'Deliver relief and reduce instability in a target nation.' },
    { id: 'evacuation-sos', label: 'Evacuation SOS', description: 'Request civilian extraction routes and relief capacity.' }
  ],
  military: [
    { id: 'hold', label: 'Hold', description: 'Stand down and preserve posture.' },
    { id: 'mobilize', label: 'Mobilize', description: 'Raise readiness and conventional power.' },
    { id: 'strike', label: 'Conventional Strike', description: 'Hit a rival without crossing the nuclear line.' },
    { id: 'arm-tactical', label: 'Arm Tactical', description: 'Ready theater weapons.' },
    { id: 'arm-strategic', label: 'Arm Strategic', description: 'Ready full strategic forces.' },
    { id: 'shield', label: 'Missile Shield', description: 'Improve survival odds after launch.' },
    { id: 'disarm', label: 'Disarm', description: 'Publicly lower nuclear readiness.' },
    { id: 'civil-defense', label: 'Civil Defense', description: 'Move shelters, medics, and reserves into place.' }
  ]
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const toFeedId = () => `feed-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)]
const countryPoint = (lat, lon, radius = 2.6) => {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

const surfaceQuaternion = (normal) => {
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize())
  return quaternion
}

const createPoliticalTexture = (countries) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  oceanGradient.addColorStop(0, '#08111d')
  oceanGradient.addColorStop(0.48, '#0c2236')
  oceanGradient.addColorStop(1, '#050b14')
  ctx.fillStyle = oceanGradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(120,200,255,0.05)'
  for (let x = 0; x <= canvas.width; x += 64) {
    ctx.fillRect(x, 0, 1, canvas.height)
  }
  for (let y = 0; y <= canvas.height; y += 32) {
    ctx.fillRect(0, y, canvas.width, y % 64 === 0 ? 1.5 : 1)
  }

  const landMasses = [
    { x: 0.18, y: 0.3, rx: 0.18, ry: 0.16, rot: -0.2 },
    { x: 0.28, y: 0.65, rx: 0.08, ry: 0.18, rot: 0.08 },
    { x: 0.52, y: 0.3, rx: 0.16, ry: 0.18, rot: 0.04 },
    { x: 0.54, y: 0.63, rx: 0.11, ry: 0.16, rot: -0.12 },
    { x: 0.75, y: 0.58, rx: 0.15, ry: 0.12, rot: 0.18 },
    { x: 0.81, y: 0.26, rx: 0.08, ry: 0.08, rot: 0.28 }
  ]
  const landGradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  landGradient.addColorStop(0, '#2d5548')
  landGradient.addColorStop(0.45, '#335f50')
  landGradient.addColorStop(1, '#193126')
  ctx.fillStyle = landGradient
  landMasses.forEach((mass) => {
    ctx.save()
    ctx.translate(mass.x * canvas.width, mass.y * canvas.height)
    ctx.rotate(mass.rot)
    ctx.beginPath()
    ctx.ellipse(0, 0, mass.rx * canvas.width, mass.ry * canvas.height, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(215,255,231,0.12)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  })

  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  landMasses.forEach((mass) => {
    const cx = mass.x * canvas.width
    const cy = mass.y * canvas.height
    ctx.beginPath()
    ctx.moveTo(cx - mass.rx * canvas.width * 0.6, cy - 12)
    ctx.lineTo(cx + mass.rx * canvas.width * 0.55, cy + 6)
    ctx.stroke()
  })

  countries.forEach((country) => {
    const x = ((country.lon + 180) / 360) * canvas.width
    const y = ((90 - country.lat) / 180) * canvas.height
    const radius = 30 + country.nuclearTier * 7
    const gradient = ctx.createRadialGradient(x, y, 4, x, y, radius)
    gradient.addColorStop(0, `${country.color}ee`)
    gradient.addColorStop(0.42, `${country.color}99`)
    gradient.addColorStop(1, `${country.color}00`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `${country.color}88`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(x, y, radius * 1.35, radius * 0.72, ((country.lat + country.lon) % 18) * (Math.PI / 180), 0, Math.PI * 2)
    ctx.stroke()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

const createCities = (base) => {
  const names = CITY_NAMES[base.id] || ['Capital', 'Harbor', 'Interior']
  return names.map((name, index) => ({
    id: `${base.id}-city-${index + 1}`,
    name,
    lat: base.lat + [0, 7, -6][index % 3],
    lon: base.lon + [0, 9, -11][index % 3],
    populationWeight: [0.4, 0.34, 0.26][index % 3],
    integrity: 100,
    contamination: 0,
    destroyed: false
  }))
}

const getCountrySummaryStats = (country) => ({
  casualties: 100 - country.population,
  contamination: country.contamination || 0,
  cityIntegrity: country.cities?.length
    ? Math.round(country.cities.reduce((total, city) => total + city.integrity, 0) / country.cities.length)
    : country.infrastructure
})

const getRecommendedActions = (country, phase, countries, threat) => {
  if (!country) return []
  const target = selectStrategicTarget(country, phase, countries)
  if (phase === 'intel') {
    if ((country.hostileTo || []).length && target) return ['Cyber Disrupt', `Focus ${target.countryName}`]
    if ((country.intel || 0) < 2) return ['Intel Scan', 'Build situational awareness']
    return ['Counterintel', 'Stabilize domestic systems']
  }
  if (phase === 'diplomacy') {
    if ((country.population || 0) < 78 || (country.contamination || 0) > 16) return ['Evacuation SOS', 'Open relief channels immediately']
    if (threat > 2.7) return ['Red Phone', target ? `Call ${target.countryName}` : 'Force de-escalation']
    if ((country.gdp || 0) < 110 && target) return ['Trade Pact', `Grow GDP with ${target.countryName}`]
    if (target && (target.gdp || 0) > 120) return ['Sanctions', `Pressure ${target.countryName}`]
    return ['Peace Summit', 'Bleed threat out of the room']
  }
  if ((country.population || 0) < 70 || (country.contamination || 0) > 20) return ['Civil Defense', 'Protect civilians and infrastructure']
  if (threat > 3.2 && country.armed > 0) return ['Disarm', 'Reduce launch pressure now']
  if ((country.shield || 0) < 2) return ['Missile Shield', 'Harden against NULLFIRE']
  if (target && country.conventional < target.conventional) return ['Mobilize', `Match ${target.countryName}`]
  return ['Hold', 'Avoid pushing DEFCON further']
}

const getFocusSummary = (country, phase, countries, threat) => {
  if (!country) return { title: 'Command Window', description: 'Select a nation to inspect its posture and best next moves.', recommendations: [] }
  return {
    title: `Focus: ${country.countryName}`,
    description: `${country.countryName} is the nation currently under review. Hovering or selecting a marker pins its stats, risks, and recommended moves.`,
    recommendations: getRecommendedActions(country, phase, countries, threat)
  }
}

const createCountry = (playerId, leaderName, index, ai = false) => {
  const base = ARCHETYPES[index % ARCHETYPES.length]
  return {
    id: `${ai ? 'ai' : 'country'}-${index + 1}-${String(playerId)}`,
    playerId,
    leaderName,
    ai,
    countryName: base.countryName,
    archetype: base.id,
    archetypeLabel: base.label,
    color: base.color,
    lat: base.lat,
    lon: base.lon,
    economy: base.economy,
    stability: base.stability,
    conventional: base.conventional,
    nuclearTier: base.nuclearTier,
    arsenal: base.arsenal,
    armed: 0,
    shield: 0,
    gdp: base.economy * 10,
    population: 100,
    infrastructure: 100,
    contamination: 0,
    casualties: 0,
    reputation: 50,
    blocId: null,
    hostileTo: [],
    sanctions: 0,
    action: null,
    actionTargetId: null,
    committed: ai,
    ready: ai,
    intel: 0,
    doctrine: base.doctrine,
    cities: createCities(base),
    eliminated: false
  }
}

const withBots = (countries) => {
  const humanCountries = countries.filter((entry) => !entry.ai)
  const next = [...humanCountries]
  const fill = Math.min(ARCHETYPES.length, Math.max(AI_FILL, humanCountries.length + 1))
  while (next.length < fill) {
    const index = next.length
    next.push(createCountry(`ai-${index + 1}`, `Directive ${index + 1}`, index, true))
  }
  return next.slice(0, MAX_COUNTRIES)
}

const defaultState = () => ({
  season: 1,
  phase: 'lobby',
  phaseEndsAt: 0,
  threat: 0,
  countries: [],
  missiles: [],
  strikes: [],
  logs: [{ id: toFeedId(), text: 'Global watch floor online. Join the lobby and signal ready.', createdAt: Date.now() }],
  selectedBlocIndex: 0,
  nullfireEndsAt: 0,
  rankings: [],
  victory: null
})

const currentDefcon = (threat) => clamp(5 - Math.floor(threat), 1, 5)

const appendLog = (state, text) => ({
  ...state,
  logs: [{ id: toFeedId(), text, createdAt: Date.now() }, ...state.logs].slice(0, EVENT_FEED_LIMIT)
})

const setLobbyReady = (state, playerId, ready) => {
  if (state.phase !== 'lobby') return state
  return {
    ...state,
    countries: state.countries.map((country) => (
      !country.ai && country.playerId === playerId
        ? { ...country, ready: !!ready }
        : country
    ))
  }
}

const startMatchFromLobby = (state) => {
  if (state.phase !== 'lobby') return state
  const humans = state.countries.filter((country) => !country.ai)
  if (!humans.length || humans.some((country) => !country.ready)) return state
  return appendLog({
    ...state,
    phase: 'intel',
    season: 1,
    threat: 0,
    missiles: [],
    strikes: [],
    nullfireEndsAt: 0,
    rankings: [],
    victory: null,
    phaseEndsAt: Date.now() + PHASE_DURATION_MS,
    countries: state.countries.map((country) => ({
      ...country,
      action: null,
      actionTargetId: null,
      committed: country.ai,
      ready: country.ai || country.ready,
      armed: 0,
      shield: 0,
      hostileTo: [],
      eliminated: false,
      population: 100,
      infrastructure: 100,
      contamination: 0,
      casualties: 0,
      sanctions: 0,
      cities: createCities(ARCHETYPES.find((entry) => entry.id === country.archetype) || ARCHETYPES[0]),
      stability: ARCHETYPES.find((entry) => entry.id === country.archetype)?.stability || country.stability,
      economy: ARCHETYPES.find((entry) => entry.id === country.archetype)?.economy || country.economy,
      conventional: ARCHETYPES.find((entry) => entry.id === country.archetype)?.conventional || country.conventional,
      gdp: (ARCHETYPES.find((entry) => entry.id === country.archetype)?.economy || country.economy) * 10
    }))
  }, 'Lobby sealed. Season one has begun.')
}

const queueCountryAction = (state, payload) => {
  if (!actionCatalog[state.phase]?.length) return state
  const actingCountry = state.countries.find((country) => country.id === payload.countryId)
  if (!actingCountry || actingCountry.eliminated) return state
  if (actingCountry.action === payload.actionId && (actingCountry.actionTargetId || null) === (payload.targetId || null)) return state
  const nextState = {
    ...state,
    countries: state.countries.map((country) => (
      country.id === payload.countryId
        ? { ...country, action: payload.actionId, actionTargetId: payload.targetId || null, committed: false }
        : country
    )),
    logs: [{ id: toFeedId(), text: `${payload.countryName || 'A nation'} committed orders for ${state.phase}.`, createdAt: Date.now() }, ...state.logs].slice(0, EVENT_FEED_LIMIT)
  }
  if (state.phase === 'diplomacy' && payload.actionId === 'sanctions' && payload.targetId) {
    return {
      ...nextState,
      countries: nextState.countries.map((country) => {
        if (country.id === payload.countryId) {
          return { ...country, hostileTo: Array.from(new Set([...country.hostileTo, payload.targetId])) }
        }
        if (country.id === payload.targetId) {
          return {
            ...country,
            sanctions: Math.max(country.sanctions || 0, SANCTIONS_DURATION),
            economy: clamp(country.economy - 1, 1, 12),
            gdp: clamp(country.gdp - 8, 0, 240)
          }
        }
        return country
      }),
      logs: [{ id: toFeedId(), text: `${payload.countryName || 'A nation'} imposed immediate sanctions.`, createdAt: Date.now() }, ...nextState.logs].slice(0, EVENT_FEED_LIMIT)
    }
  }
  return nextState
}

const finalizeVictory = (state, victory) => {
  const rankings = state.countries
    .map((country) => ({
      id: country.id,
      label: country.countryName,
      score: Math.round(country.gdp + country.population * 0.4 + country.infrastructure * 0.35 + country.stability * 4 - (country.contamination || 0) * 1.5),
      population: country.population,
      infrastructure: country.infrastructure,
      contamination: country.contamination || 0,
      gdp: Math.round(country.gdp)
    }))
    .sort((a, b) => b.score - a.score)
  return {
    ...state,
    rankings,
    phase: 'reconstruction',
    phaseEndsAt: 0,
    victory,
    logs: [{ id: toFeedId(), text: victory.summary, createdAt: Date.now() }, ...state.logs].slice(0, EVENT_FEED_LIMIT)
  }
}

const commitCountryOrders = (state, countryId) => {
  if (!actionCatalog[state.phase]?.length) return state
  const actingCountry = state.countries.find((country) => country.id === countryId)
  if (!actingCountry || actingCountry.eliminated || !actingCountry.action || actingCountry.committed) return state
  return {
    ...state,
    countries: state.countries.map((country) => (
      country.id === countryId
        ? { ...country, committed: true }
        : country
    )),
    logs: [{ id: toFeedId(), text: `${actingCountry.countryName} locked in ${state.phase} orders.`, createdAt: Date.now() }, ...state.logs].slice(0, EVENT_FEED_LIMIT)
  }
}

const evaluateVictory = (state) => {
  const livingCountries = state.countries.filter((country) => !country.eliminated)
  const blocGroups = Object.values(livingCountries.reduce((acc, country) => {
    if (!country.blocId) return acc
    if (!acc[country.blocId]) acc[country.blocId] = []
    acc[country.blocId].push(country)
    return acc
  }, {}))

  const economicWinner = livingCountries.find((country) => country.gdp >= ECONOMIC_VICTORY_GDP && state.threat <= 2.4)
  if (economicWinner) {
    return {
      type: 'economic',
      winnerId: economicWinner.id,
      title: 'Economic Hegemony',
      summary: `${economicWinner.countryName} dominated global GDP without tipping the world into NULLFIRE.`
    }
  }

  const blocWinner = blocGroups.find((bloc) => bloc.reduce((sum, country) => sum + country.gdp, 0) >= livingCountries.reduce((sum, country) => sum + country.gdp, 0) * 0.55)
  if (blocWinner && state.threat <= 2.8) {
    return {
      type: 'alliance',
      winnerId: blocWinner[0].id,
      title: 'Bloc Supremacy',
      summary: `${blocWinner.map((country) => country.countryName).join(', ')} controlled the world order without triggering launch.`
    }
  }

  if (state.season >= DIPLOMATIC_VICTORY_SEASON && state.threat <= 1.2) {
    const diplomaticWinner = [...livingCountries].sort((a, b) => (b.reputation + b.stability + b.intel) - (a.reputation + a.stability + a.intel))[0]
    if (diplomaticWinner) {
      return {
        type: 'diplomatic',
        winnerId: diplomaticWinner.id,
        title: 'Architect of Peace',
        summary: `${diplomaticWinner.countryName} held the room together long enough for a diplomatic victory.`
      }
    }
  }

  return null
}

const scoreTargetForCountry = (country, target, phase) => {
  let score = 0
  score += (target.gdp || 0) * 0.45
  score += (target.arsenal || 0) * 3
  score += (target.armed || 0) * 4
  score += (100 - (target.population || 0)) * 0.12
  score += (100 - (target.infrastructure || 0)) * 0.08
  score += (country.hostileTo || []).includes(target.id) ? 24 : 0
  score += (target.hostileTo || []).includes(country.id) ? 16 : 0
  score += (target.blocId && target.blocId !== country.blocId) ? 10 : 0
  score -= (target.shield || 0) * 4
  if (phase === 'diplomacy') score += (target.sanctions || 0) > 0 ? 12 : 0
  if (phase === 'military') score += (target.nuclearTier || 0) * 5 + (target.conventional || 0) * 1.5
  return score
}

const selectStrategicTarget = (country, phase, countries) => {
  const livingTargets = countries.filter((entry) => entry.id !== country.id && !entry.eliminated)
  if (!livingTargets.length) return null
  return [...livingTargets].sort((a, b) => scoreTargetForCountry(country, b, phase) - scoreTargetForCountry(country, a, phase))[0] || null
}

const selectAutoAction = (country, phase, countries, threat) => {
  const target = selectStrategicTarget(country, phase, countries)
  if (phase === 'intel') {
    if ((country.hostileTo || []).length && target) return { action: 'cyber', targetId: target.id }
    if (country.doctrine === 'growth') return { action: 'scan', targetId: null }
    if (country.doctrine === 'volatile' && target) return { action: 'cyber', targetId: target.id }
    if (country.doctrine === 'deescalate') return { action: 'counterintel', targetId: null }
    return target && Math.random() > 0.4 ? { action: 'cyber', targetId: target.id } : { action: 'scan', targetId: null }
  }
  if (phase === 'diplomacy') {
    if ((country.population || 0) < 76 || (country.contamination || 0) > 18) return { action: 'evacuation-sos', targetId: null }
    if (country.doctrine === 'deescalate' && target && ((target.population || 0) < 80 || (target.contamination || 0) > 10)) return { action: 'aid-corridor', targetId: target.id }
    if ((country.sanctions || 0) > 0 && target) return { action: 'red-phone', targetId: target.id }
    if (country.doctrine === 'bloc') return { action: 'bloc-charter', targetId: null }
    if (country.doctrine === 'deescalate') return { action: 'peace-summit', targetId: null }
    if (country.doctrine === 'growth' && target) return { action: 'trade-pact', targetId: target.id }
    if (threat > 2.7) return target ? { action: 'red-phone', targetId: target.id } : { action: 'peace-summit', targetId: null }
    return target && (target.gdp || 0) > 90 ? { action: 'sanctions', targetId: target.id } : (target ? { action: 'red-phone', targetId: target.id } : { action: 'peace-summit', targetId: null })
  }
  if (threat > 3.2 && country.armed > 0) return { action: 'disarm', targetId: null }
  if (country.doctrine === 'shield') return { action: 'shield', targetId: null }
  if ((country.population || 0) < 72 || (country.contamination || 0) > 16) return { action: 'civil-defense', targetId: null }
  if (country.doctrine === 'heavy' && target && country.armed < Math.max(2, country.arsenal - 1)) return { action: 'arm-strategic', targetId: target.id }
  if (country.doctrine === 'volatile' && target) return { action: 'strike', targetId: target.id }
  if ((country.contamination || 0) > 24 || country.population < 48) return { action: 'shield', targetId: null }
  if (country.doctrine === 'deescalate') return { action: 'hold', targetId: null }
  if (target && country.conventional < target.conventional) return { action: 'mobilize', targetId: target.id }
  return target && Math.random() > 0.6 ? { action: 'strike', targetId: target.id } : { action: 'hold', targetId: null }
}

const resolvePhase = (state) => {
  let nextState = {
    ...state,
    countries: state.countries.map((country) => ({ ...country })),
    missiles: [],
    strikes: state.strikes ? [...state.strikes] : []
  }
  const countriesById = Object.fromEntries(nextState.countries.map((country) => [country.id, country]))
  const livingCountries = nextState.countries.filter((entry) => !entry.eliminated)
  livingCountries.forEach((country) => {
    if (!country.action) {
      const auto = selectAutoAction(country, state.phase, livingCountries, state.threat)
      country.action = auto.action
      country.actionTargetId = auto.targetId
      country.committed = true
    }
  })

  const getTarget = (country) => countriesById[country.actionTargetId]
  let threatDelta = -0.18
  const blocSignups = livingCountries.filter((entry) => entry.action === 'bloc-charter')
  const summitCalls = livingCountries.filter((entry) => entry.action === 'peace-summit')

  livingCountries.forEach((country) => {
    const target = getTarget(country)
    if (state.phase === 'intel') {
      if (country.action === 'scan') {
        country.intel += 2
        country.reputation += 1
      }
      if (country.action === 'cyber' && target) {
        target.economy = clamp(target.economy - 1, 1, 12)
        target.stability = clamp(target.stability - 1, 0, 10)
        country.intel += 1
        country.hostileTo = Array.from(new Set([...country.hostileTo, target.id]))
        threatDelta += 0.32
        nextState = appendLog(nextState, `${country.countryName} hit ${target.countryName} with a covert disruption.`)
      }
      if (country.action === 'counterintel') {
        country.stability = clamp(country.stability + 1, 0, 10)
        country.reputation += 1
      }
    }

    if (state.phase === 'diplomacy') {
      if (country.action === 'red-phone' && target) {
        country.reputation += 2
        threatDelta -= 0.15
        nextState = appendLog(nextState, `${country.countryName} opened the Red Phone to ${target.countryName}.`)
      }
      if (country.action === 'trade-pact' && target) {
        country.economy = clamp(country.economy + 1, 1, 12)
        target.economy = clamp(target.economy + 1, 1, 12)
        country.gdp = clamp(country.gdp + 6, 0, 240)
        target.gdp = clamp(target.gdp + 6, 0, 240)
        threatDelta -= 0.22
      }
      if (country.action === 'aid-corridor' && target) {
        target.stability = clamp(target.stability + 2, 0, 10)
        target.population = clamp(target.population + 2, 0, 100)
        target.infrastructure = clamp(target.infrastructure + 3, 0, 100)
        target.contamination = clamp((target.contamination || 0) - 5, 0, 100)
        country.gdp = clamp(country.gdp - 5, 0, 240)
        country.reputation += 4
        threatDelta -= 0.18
        nextState = appendLog(nextState, `${country.countryName} opened an aid corridor toward ${target.countryName}.`)
      }
      if (country.action === 'evacuation-sos') {
        country.population = clamp(country.population + 3, 0, 100)
        country.stability = clamp(country.stability + 1, 0, 10)
        country.gdp = clamp(country.gdp - 4, 0, 240)
        country.reputation += 3
        threatDelta -= 0.1
        nextState = appendLog(nextState, `${country.countryName} pushed an evacuation SOS through the crisis net.`)
      }
      if (country.action === 'sanctions' && target) {
        target.sanctions = Math.max(target.sanctions || 0, SANCTIONS_DURATION)
        threatDelta += 0.14
        nextState = appendLog(nextState, `${country.countryName} locked ${target.countryName} into a sanctions regime.`)
      }
    }

    if (state.phase === 'military') {
      if (country.action === 'hold') {
        threatDelta -= 0.06
      }
      if (country.action === 'mobilize') {
        country.conventional = clamp(country.conventional + 1, 0, 12)
        threatDelta += 0.35
      }
      if (country.action === 'shield') {
        country.shield = clamp(country.shield + 1, 0, 5)
        country.economy = clamp(country.economy - 1, 1, 12)
        threatDelta += 0.1
      }
      if (country.action === 'strike' && target) {
        target.conventional = clamp(target.conventional - 2, 0, 12)
        target.infrastructure = clamp(target.infrastructure - 9, 0, 100)
        target.population = clamp(target.population - 4, 0, 100)
        target.stability = clamp(target.stability - 1, 0, 10)
        country.hostileTo = Array.from(new Set([...country.hostileTo, target.id]))
        target.hostileTo = Array.from(new Set([...target.hostileTo, country.id]))
        threatDelta += 0.92
        nextState = appendLog(nextState, `${country.countryName} launched a conventional strike on ${target.countryName}.`)
      }
      if (country.action === 'arm-tactical') {
        country.armed = clamp(country.armed + 1, 0, country.arsenal)
        threatDelta += 1
      }
      if (country.action === 'arm-strategic') {
        country.armed = clamp(country.armed + 2, 0, country.arsenal)
        threatDelta += 1.42
      }
      if (country.action === 'disarm') {
        country.armed = clamp(country.armed - 2, 0, country.arsenal)
        threatDelta -= 0.4
      }
      if (country.action === 'civil-defense') {
        country.shield = clamp(country.shield + 1, 0, 5)
        country.population = clamp(country.population + 2, 0, 100)
        country.infrastructure = clamp(country.infrastructure + 2, 0, 100)
        country.gdp = clamp(country.gdp - 6, 0, 240)
        threatDelta += 0.06
      }
    }
  })

  if (state.phase === 'diplomacy' && blocSignups.length >= 2) {
    const blocId = `bloc-${state.selectedBlocIndex + 1}`
    blocSignups.forEach((country) => { country.blocId = blocId })
    nextState.selectedBlocIndex = (state.selectedBlocIndex + 1) % blocNames.length
    threatDelta += 0.18
    nextState = appendLog(nextState, `${blocNames[state.selectedBlocIndex]} formed and redrew the map.`)
  }

  if (state.phase === 'diplomacy' && summitCalls.length >= 2) {
    threatDelta -= 1.05
    nextState = appendLog(nextState, 'A peace summit froze the room long enough for the clock to step back.')
  }

  nextState.countries.forEach((country) => {
    if (country.sanctions > 0) {
      country.sanctions = Math.max(0, country.sanctions - 1)
      country.economy = clamp(country.economy - 1, 1, 12)
      country.gdp = clamp(country.gdp - 5, 0, 240)
      country.reputation = clamp(country.reputation - 1, 0, 100)
    }
    country.contamination = clamp((country.contamination || 0) * 0.93, 0, 100)
    country.cities = (country.cities || []).map((city) => ({
      ...city,
      contamination: clamp(city.contamination * 0.94, 0, 100)
    }))
    country.gdp = clamp(country.gdp + country.economy * 1.8 - Math.max(0, 3 - country.stability), 0, 240)
    if (country.stability <= 0 && !country.eliminated) {
      country.population = clamp(country.population - 12, 0, 100)
      country.infrastructure = clamp(country.infrastructure - 14, 0, 100)
      threatDelta += 0.55
      nextState = appendLog(nextState, `${country.countryName} slipped into internal collapse, inviting proxy chaos.`)
    }
    if (country.population <= 0 || country.infrastructure <= 0) {
      country.eliminated = true
      threatDelta += country.armed > 0 ? 0.8 : 0.2
      nextState = appendLog(nextState, `${country.countryName} ceased to function as a sovereign state.`)
    }
    country.action = null
    country.actionTargetId = null
    country.committed = country.ai
  })

  const crisisRoll = Math.random()
  if (crisisRoll > 0.72) {
    threatDelta += 0.4
    nextState = appendLog(nextState, randomChoice([
      'A rogue flight path triggered emergency radar locks.',
      'A reactor incident spread panic through global markets.',
      'A disputed election pulled security forces into the streets.'
    ]))
  }

  const nextThreat = clamp(nextState.threat + threatDelta, 0, 4.4)
  nextState.threat = nextThreat
  if (nextThreat >= 4) {
    const missiles = []
    nextState.countries
      .filter((country) => !country.eliminated && country.armed > 0)
      .forEach((country) => {
        const hostileIds = country.hostileTo.length
          ? country.hostileTo.filter((id) => countriesById[id] && !countriesById[id].eliminated)
          : nextState.countries.filter((entry) => entry.id !== country.id && !entry.eliminated).map((entry) => entry.id)
        hostileIds.forEach((targetId, index) => {
          const target = countriesById[targetId]
          const targetCity = target?.cities?.[index % Math.max(1, target.cities.length)] || null
          missiles.push({
            id: `${country.id}-${targetId}-${index}`,
            fromId: country.id,
            toId: targetId,
            fromLat: country.lat,
            fromLon: country.lon,
            toLat: targetCity?.lat ?? target?.lat ?? 0,
            toLon: targetCity?.lon ?? target?.lon ?? 0,
            targetCityId: targetCity?.id || null,
            targetCityName: targetCity?.name || null,
            impactAt: Date.now() + 4000 + index * 260,
            strategic: country.nuclearTier >= 3,
            launchedAt: Date.now()
          })
        })
      })
    nextState.phase = 'nullfire'
    nextState.nullfireEndsAt = Date.now() + NULLFIRE_DURATION_MS
    nextState.phaseEndsAt = nextState.nullfireEndsAt
    nextState.missiles = missiles
    nextState = appendLog(nextState, 'DEFCON 1. NULLFIRE engaged. All armed nations have launched.')
    return nextState
  }

  const victory = evaluateVictory(nextState)
  if (victory) return finalizeVictory(nextState, victory)

  const nextPhaseIndex = (PHASES.indexOf(state.phase) + 1) % PHASES.length
  nextState.phase = PHASES[nextPhaseIndex]
  nextState.season = state.phase === 'resolution' ? state.season + 1 : state.season
  nextState.phaseEndsAt = Date.now() + PHASE_DURATION_MS
  return nextState
}

const resolveNullfire = (state) => {
  const countries = state.countries.map((country) => ({ ...country }))
  const countriesById = Object.fromEntries(countries.map((country) => [country.id, country]))
  const strikes = []
  state.missiles.forEach((missile, index) => {
    const target = countriesById[missile.toId]
    if (!target || target.eliminated) return
    const shieldFactor = clamp(target.shield * 0.12, 0, 0.48)
    const populationHit = missile.strategic ? 34 : 16
    const infrastructureHit = missile.strategic ? 42 : 20
    const adjustedPopulationHit = Math.round(populationHit * (1 - shieldFactor))
    const adjustedInfrastructureHit = Math.round(infrastructureHit * (1 - shieldFactor))
    const contaminationHit = missile.strategic ? 32 : 15
    target.population = clamp(target.population - adjustedPopulationHit, 0, 100)
    target.infrastructure = clamp(target.infrastructure - adjustedInfrastructureHit, 0, 100)
    target.stability = clamp(target.stability - (missile.strategic ? 4 : 2), 0, 10)
    target.contamination = clamp((target.contamination || 0) + contaminationHit, 0, 100)
    target.casualties = clamp((target.casualties || 0) + adjustedPopulationHit, 0, 100)
    target.cities = (target.cities || []).map((city) => (
      city.id === missile.targetCityId
        ? {
          ...city,
          integrity: clamp(city.integrity - adjustedInfrastructureHit, 0, 100),
          contamination: clamp(city.contamination + contaminationHit, 0, 100),
          destroyed: city.integrity - adjustedInfrastructureHit <= 0
        }
        : city
    ))
    strikes.push({
      id: `strike-${missile.id}-${index}`,
      toId: missile.toId,
      lat: missile.toLat,
      lon: missile.toLon,
      cityName: missile.targetCityName,
      contamination: contaminationHit,
      strategic: missile.strategic
    })
    if (target.population <= 0 || target.infrastructure <= 0) target.eliminated = true
  })
  const rankings = countries
    .map((country) => ({
      id: country.id,
      label: country.countryName,
      score: Math.round(country.population * 0.42 + country.infrastructure * 0.34 + country.stability * 2 + country.shield * 3 + country.gdp * 0.08 - (country.contamination || 0) * 1.6),
      population: country.population,
      infrastructure: country.infrastructure,
      contamination: Math.round(country.contamination || 0),
      casualties: Math.round(country.casualties || 0),
      gdp: Math.round(country.gdp)
    }))
    .sort((a, b) => b.score - a.score)
  return {
    ...state,
    countries,
    rankings,
    missiles: state.missiles,
    strikes,
    phase: 'reconstruction',
    phaseEndsAt: 0,
    victory: {
      type: 'survival',
      winnerId: rankings[0]?.id || null,
      title: 'Pyrrhic Survival',
      summary: `${rankings[0]?.label || 'Unknown'} emerged with the highest survival score after NULLFIRE.`
    },
    logs: [{ id: toFeedId(), text: `${rankings[0]?.label || 'Unknown'} emerged with the highest survival score.`, createdAt: Date.now() }, ...state.logs].slice(0, EVENT_FEED_LIMIT)
  }
}

const Atmosphere = ({ threat }) => {
  const meshRef = useRef(null)
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y = clock.getElapsedTime() * 0.04
    meshRef.current.material.opacity = 0.16 + threat * 0.08 + Math.sin(clock.getElapsedTime() * 1.6) * 0.02
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2.82, 48, 48]} />
      <meshStandardMaterial color={new THREE.Color().setHSL(0.58 - threat * 0.1, 0.8, 0.5)} transparent opacity={0.18} side={THREE.BackSide} />
    </mesh>
  )
}

const CityMarker = ({ city, countryColor, onTarget, madMode, targeted }) => {
  const position = useMemo(() => countryPoint(city.lat, city.lon, 2.69), [city.lat, city.lon])
  const contaminationScale = 0.04 + (city.contamination || 0) * 0.001
  const ringRef = useRef(null)
  useFrame(({ clock }) => {
    if (!ringRef.current) return
    ringRef.current.material.opacity = targeted
      ? 0.55 + Math.sin(clock.getElapsedTime() * 8) * 0.35
      : madMode && !city.destroyed ? 0.28 + Math.sin(clock.getElapsedTime() * 3) * 0.12 : 0
  })
  return (
    <group position={position.toArray()}>
      <mesh
        onClick={(e) => { e.stopPropagation(); if (madMode && !city.destroyed && onTarget) onTarget(city) }}
        onPointerOver={(e) => e.stopPropagation()}
      >
        <sphereGeometry args={[city.destroyed ? 0.035 : 0.055, 14, 14]} />
        <meshBasicMaterial color={city.destroyed ? '#fb7185' : targeted ? '#ff0000' : madMode ? '#fbbf24' : '#fde68a'} transparent opacity={city.destroyed ? 0.4 : 0.9} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.13, 20]} />
        <meshBasicMaterial color={targeted ? '#ef4444' : '#fbbf24'} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {city.contamination > 2 ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.07 + contaminationScale, 0.1 + contaminationScale * 2.4, 24]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.24} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
      {(madMode || targeted) && !city.destroyed ? (
        <Html position={[0, 0.12, 0]} transform sprite distanceFactor={6} zIndexRange={[20, 0]} pointerEvents="none">
          <div style={{ fontSize: 9, color: targeted ? '#ef4444' : '#fbbf24', fontFamily: 'Courier New, monospace', whiteSpace: 'nowrap', textShadow: '0 0 6px rgba(0,0,0,0.9)', background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 3 }}>
            {city.name}{targeted ? ' ◉' : ''}
          </div>
        </Html>
      ) : null}
    </group>
  )
}

const CityLights = ({ country, madMode, targetedCityId, onTargetCity }) => {
  return (
    <>
      {(country.cities || []).map((city) => (
        <CityMarker
          key={city.id}
          city={city}
          countryColor={country.color}
          madMode={madMode}
          targeted={targetedCityId === city.id}
          onTarget={onTargetCity}
        />
      ))}
    </>
  )
}

const ContaminationField = ({ countries, strikes }) => {
  return (
    <>
      {countries.filter((country) => (country.contamination || 0) > 1).map((country) => {
        const normal = countryPoint(country.lat, country.lon, 1).normalize()
        const position = normal.clone().multiplyScalar(2.62)
        const quaternion = surfaceQuaternion(normal)
        const radius = 0.18 + (country.contamination || 0) * 0.006
        return (
          <mesh key={`contamination-${country.id}`} position={position.toArray()} quaternion={quaternion}>
            <ringGeometry args={[radius, radius + 0.09, 40]} />
            <meshBasicMaterial color="#fb7185" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )
      })}
      {(strikes || []).map((strike) => {
        const position = countryPoint(strike.lat, strike.lon, 2.74)
        return (
          <mesh key={strike.id} position={position.toArray()}>
            <sphereGeometry args={[0.05 + strike.contamination * 0.0012, 20, 20]} />
            <meshBasicMaterial color={strike.strategic ? '#fb7185' : '#fdba74'} transparent opacity={0.12} depthWrite={false} />
          </mesh>
        )
      })}
    </>
  )
}

const CountryMarker = ({ country, hovered, selected, onHover, onSelect }) => {
  const normal = useMemo(() => countryPoint(country.lat, country.lon, 1).normalize(), [country.lat, country.lon])
  const markerPosition = useMemo(() => normal.clone().multiplyScalar(2.66), [normal])
  const patchQuaternion = useMemo(() => surfaceQuaternion(normal), [normal])
  const summary = `${country.archetypeLabel}
GDP ${Math.round(country.gdp)} | Economy ${country.economy} | Stability ${country.stability}
Population ${country.population}% | Infra ${country.infrastructure}% | Casualties ${Math.round(country.casualties || 0)}
Nuclear ${country.nuclearTier} | Armed ${country.armed}/${country.arsenal} | Shield ${country.shield}
Intel ${country.intel} | Reputation ${country.reputation} | Fallout ${Math.round(country.contamination || 0)}
Bloc ${country.blocId || 'None'} | Sanctions ${country.sanctions} | Hostiles ${country.hostileTo.length}`
  return (
    <group>
      <mesh
        position={markerPosition.toArray()}
        quaternion={patchQuaternion}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(country.id)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          onHover(null)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(country.id)
        }}
      >
        <circleGeometry args={[0.17 + country.nuclearTier * 0.02, 28]} />
        <meshBasicMaterial color={country.color} transparent opacity={hovered || selected ? 0.48 : 0.18} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={markerPosition.toArray()}>
        <sphereGeometry args={[0.08 + country.nuclearTier * 0.01, 20, 20]} />
        <meshStandardMaterial color={country.color} emissive={country.color} emissiveIntensity={hovered || selected ? 0.9 : 0.45 + country.armed * 0.06} />
      </mesh>
      <mesh position={[markerPosition.x, markerPosition.y + 0.14, markerPosition.z]}>
        <boxGeometry args={[0.04, 0.18 + country.conventional * 0.008, 0.04]} />
        <meshStandardMaterial color="#dbeafe" emissive="#93c5fd" emissiveIntensity={hovered || selected ? 0.4 : 0.2} />
      </mesh>
      {(hovered || selected) ? (
        <Html position={markerPosition.clone().multiplyScalar(1.18).toArray()} transform sprite distanceFactor={5.6} zIndexRange={[30, 0]} pointerEvents="none">
          <div style={{ width: 230, background: 'rgba(2,6,23,0.92)', border: `1px solid ${country.color}77`, borderRadius: 12, padding: '10px 12px', color: '#f8fafc', boxShadow: '0 18px 45px rgba(0,0,0,0.45)', fontFamily: 'Courier New, monospace' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{country.countryName}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: country.color }}>{country.leaderName || 'National command'}</div>
            <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.45, whiteSpace: 'pre-line', color: '#dbeafe' }}>{summary}</div>
          </div>
        </Html>
      ) : null}
    </group>
  )
}

const MissileArc = ({ missile, phase }) => {
  const missileRef = useRef(null)
  const flashRef = useRef(null)
  const plumeRef = useRef(null)
  const curve = useMemo(() => {
    const start = countryPoint(missile.fromLat, missile.fromLon, 2.72)
    const end = countryPoint(missile.toLat, missile.toLon, 2.72)
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(4.1)
    return new THREE.CatmullRomCurve3([start, mid, end])
  }, [missile.fromLat, missile.fromLon, missile.toLat, missile.toLon])
  const points = useMemo(() => curve.getPoints(24), [curve])
  useFrame(() => {
    if (!missileRef.current) return
    const progress = phase === 'nullfire'
      ? clamp((Date.now() - missile.launchedAt) / Math.max(1, missile.impactAt - missile.launchedAt), 0, 1)
      : 0
    const point = curve.getPointAt(progress)
    missileRef.current.position.copy(point)
    missileRef.current.visible = progress < 1
    const tangent = curve.getTangentAt(Math.min(0.999, progress + 0.001)).normalize()
    missileRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
    if (plumeRef.current) {
      plumeRef.current.scale.set(1, 0.9 + Math.sin(Date.now() * 0.02) * 0.2, 1)
    }
    if (flashRef.current) {
      const impactWindow = Date.now() - missile.impactAt
      const active = impactWindow >= 0 && impactWindow < 6000
      flashRef.current.visible = active
      if (active) {
        const pulse = 1 + Math.sin(impactWindow * 0.01) * 0.18
        flashRef.current.scale.setScalar(pulse)
      }
    }
  })
  const impactPosition = useMemo(() => countryPoint(missile.toLat, missile.toLon, 2.72), [missile.toLat, missile.toLon])
  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap((point) => [point.x, point.y, point.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={missile.strategic ? '#fca5a5' : '#fdba74'} linewidth={2} />
      </line>
      <group ref={missileRef}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.04, missile.strategic ? 0.34 : 0.24, 10]} />
          <meshStandardMaterial color={missile.strategic ? '#f3f4f6' : '#fde68a'} emissive={missile.strategic ? '#fb7185' : '#f59e0b'} emissiveIntensity={0.24} metalness={0.45} roughness={0.48} />
        </mesh>
        <mesh position={[0, (missile.strategic ? 0.2 : 0.14), 0]}>
          <coneGeometry args={[0.05, missile.strategic ? 0.14 : 0.1, 10]} />
          <meshStandardMaterial color="#f8fafc" emissive="#fca5a5" emissiveIntensity={0.12} />
        </mesh>
        <mesh ref={plumeRef} position={[0, -(missile.strategic ? 0.22 : 0.16), 0]}>
          <coneGeometry args={[0.06, missile.strategic ? 0.22 : 0.16, 10]} />
          <meshBasicMaterial color={missile.strategic ? '#fb7185' : '#fdba74'} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={flashRef} position={impactPosition.toArray()} visible={false}>
        <sphereGeometry args={[missile.strategic ? 0.28 : 0.18, 20, 20]} />
        <meshBasicMaterial color={missile.strategic ? '#ffffff' : '#fde68a'} transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

const MissileArcs = ({ missiles, phase }) => missiles.map((missile) => (
  <MissileArc key={missile.id} missile={missile} phase={phase} />
))

const StrikeAftermath = ({ strike }) => {
  const rootRef = useRef(null)
  const normal = useMemo(() => countryPoint(strike.lat, strike.lon, 1).normalize(), [strike.lat, strike.lon])
  const position = useMemo(() => normal.clone().multiplyScalar(2.75), [normal])
  const quaternion = useMemo(() => surfaceQuaternion(normal), [normal])
  useFrame(({ clock }) => {
    if (!rootRef.current) return
    rootRef.current.scale.y = 1 + Math.sin(clock.getElapsedTime() * 1.8 + strike.contamination) * 0.08
  })
  return (
    <group ref={rootRef} position={position.toArray()} quaternion={quaternion}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.03, 0.08, 0.16, 10]} />
        <meshStandardMaterial color="#374151" emissive="#f97316" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.09 + strike.contamination * 0.0018, 18, 18]} />
        <meshBasicMaterial color={strike.strategic ? '#f5d0fe' : '#fed7aa'} transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.005, 0]}>
        <ringGeometry args={[0.11, 0.18 + strike.contamination * 0.0025, 28]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {[[-0.06, 0.015], [0.06, 0.02], [0.015, -0.055], [-0.02, -0.045]].map(([x, z], index) => (
        <mesh key={`${strike.id}-ruin-${index}`} position={[x, 0.02, z]} rotation={[0, index * 0.4, 0]}>
          <boxGeometry args={[0.03, 0.045 + index * 0.01, 0.03]} />
          <meshStandardMaterial color="#475569" emissive="#1f2937" emissiveIntensity={0.14} />
        </mesh>
      ))}
    </group>
  )
}

const GlobeMarkers = ({ countries, missiles, strikes, threat, phase, hoveredCountryId, selectedCountryId, onHoverCountry, onSelectCountry, madMode, targetedCityId, onTargetCity }) => {
  const groupRef = useRef(null)
  const politicalTexture = useMemo(() => createPoliticalTexture(countries), [countries])
  useEffect(() => () => politicalTexture.dispose(), [politicalTexture])
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = clock.getElapsedTime() * 0.04
  })
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[2.6, 48, 48]} />
        <meshStandardMaterial map={politicalTexture} color="#cbd5e1" emissive={new THREE.Color().setHSL(0.58, 0.35, 0.08 + threat * 0.08)} emissiveIntensity={0.32 + threat * 0.08} roughness={0.86} metalness={0.08} />
      </mesh>
      <Atmosphere threat={threat} />
      <ContaminationField countries={countries} strikes={strikes} />
      {(strikes || []).map((strike) => <StrikeAftermath key={`aftermath-${strike.id}`} strike={strike} />)}
      {countries.filter((country) => !country.eliminated).map((country) => (
        <group key={country.id}>
          <CityLights country={country} madMode={madMode} targetedCityId={targetedCityId} onTargetCity={onTargetCity} />
          <CountryMarker
            country={country}
            hovered={hoveredCountryId === country.id}
            selected={selectedCountryId === country.id}
            onHover={onHoverCountry}
            onSelect={onSelectCountry}
          />
        </group>
      ))}
      <MissileArcs countries={countries} missiles={missiles} phase={phase} />
    </group>
  )
}

const DefconWorld = ({ countries, missiles, strikes, threat, phase, hoveredCountryId, selectedCountryId, onHoverCountry, onSelectCountry, madMode, targetedCityId, onTargetCity }) => {
  const clockLight = useRef(null)
  useFrame(({ clock }) => {
    if (!clockLight.current) return
    clockLight.current.intensity = 1.2 + threat * 0.5 + Math.sin(clock.getElapsedTime() * 5) * 0.12
  })
  return (
    <>
      <color attach="background" args={['#020617']} />
      <fog attach="fog" args={['#020617', 8, 16]} />
      <Stars radius={24} depth={18} count={1000} factor={3.4} fade speed={0.3} />
      <ambientLight intensity={0.42} color="#8fb2ff" />
      <directionalLight ref={clockLight} position={[5, 6, 5]} intensity={1.4} color={phase === 'nullfire' ? '#fecaca' : '#bfdbfe'} />
      <pointLight position={[-5, -3, -3]} intensity={0.5 + threat * 0.3} color="#f97316" />
      <GlobeMarkers countries={countries} missiles={missiles} strikes={strikes} threat={threat} phase={phase} hoveredCountryId={hoveredCountryId} selectedCountryId={selectedCountryId} onHoverCountry={onHoverCountry} onSelectCountry={onSelectCountry} madMode={madMode} targetedCityId={targetedCityId} onTargetCity={onTargetCity} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.95} maxPolarAngle={2.15} rotateSpeed={0.45} />
    </>
  )
}

const DefconScene = ({ countries, missiles, strikes, threat, phase, hoveredCountryId, selectedCountryId, onHoverCountry, onSelectCountry, madMode, targetedCityId, onTargetCity }) => {
  return (
    <Canvas camera={{ position: [0, 0.8, 8.8], fov: 44 }} style={{ position: 'absolute', inset: 0 }}>
      <DefconWorld countries={countries} missiles={missiles} strikes={strikes} threat={threat} phase={phase} hoveredCountryId={hoveredCountryId} selectedCountryId={selectedCountryId} onHoverCountry={onHoverCountry} onSelectCountry={onSelectCountry} madMode={madMode} targetedCityId={targetedCityId} onTargetCity={onTargetCity} />
    </Canvas>
  )
}

const DefconHUD = ({
  containerRef,
  gameState,
  defcon,
  readyCount,
  humanCountries,
  phaseTimeLeft,
  hoveredCountry,
  selectedCountry,
  myCountry,
  userId,
  isHost,
  canLaunch,
  handleReadyToggle,
  handleStart,
  availableActions,
  actionsNeedingTarget,
  targetOptions,
  handleAction,
  handleCommit,
  handleResetMatch,
  setHoveredCountryId,
  setSelectedCountryId,
  uiHidden,
  setUiHidden
}) => {
  if (!containerRef.current) return null
  const focusCountry = selectedCountry || hoveredCountry || myCountry
  const worldCasualties = Math.round(gameState.countries.reduce((total, country) => total + (country.casualties || 0), 0))
  const peakFallout = Math.max(0, ...gameState.countries.map((country) => Math.round(country.contamination || 0)))
  const didWin = !!(gameState.victory?.winnerId && myCountry?.id === gameState.victory.winnerId)
  const focusSummary = getFocusSummary(focusCountry, gameState.phase, gameState.countries.filter((country) => !country.eliminated), gameState.threat)

  const hud = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.9)', border: '1px solid #374151', borderRadius: 6, padding: '5px 14px', color: '#f9fafb', textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'auto' }}>
        <button
          type="button"
          onClick={() => setUiHidden((current) => !current)}
          style={{ background: 'transparent', color: '#f9fafb', border: 'none', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {uiHidden ? 'Show UI (H)' : 'Hide UI (H)'}
        </button>
      </div>

      {!uiHidden ? (
        <>
          <div style={{ position: 'absolute', top: 12, left: 12, width: 210, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>DEFCON {defcon}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{gameState.phase === 'lobby' ? 'Lobby' : `Season ${gameState.season} · ${gameState.phase}`}</div>
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#111827', overflow: 'hidden' }}>
              <div style={{ width: `${(gameState.threat / 4) * 100}%`, height: '100%', background: defcon <= 2 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #38bdf8, #facc15)' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#d1d5db', lineHeight: 1.45 }}>
              {gameState.phase === 'lobby'
                ? `${readyCount}/${humanCountries.length} ready`
                : `${Math.ceil(phaseTimeLeft / 1000)}s until resolution`}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: focusCountry ? focusCountry.color : '#9ca3af' }}>
              {focusCountry ? `${focusCountry.countryName} · ${focusCountry.archetypeLabel}` : 'Drag to rotate. Hover or click markers for intel.'}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8' }}>Global casualties {worldCasualties} · Peak fallout {peakFallout}</div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2937', fontSize: 10, lineHeight: 1.5, color: '#cbd5e1' }}>
              {focusSummary.description}
            </div>
          </div>

          <div style={{ position: 'absolute', top: 12, right: 12, width: 220, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6 }}>Nations</div>
            <div style={{ height: 1, background: '#1f2937', marginBottom: 8 }} />
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflow: 'auto' }}>
              {gameState.countries.map((country) => (
                <div
                  key={country.id}
                  style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: (selectedCountry?.id === country.id || hoveredCountry?.id === country.id) ? 'rgba(30,41,59,0.95)' : 'rgba(17,24,39,0.92)', border: `1px solid ${country.color}33`, cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredCountryId(country.id)}
                  onMouseLeave={() => setHoveredCountryId((current) => (current === country.id ? null : current))}
                  onClick={() => setSelectedCountryId((current) => (current === country.id ? null : country.id))}
                >
                  <div style={{ width: 10, height: 10, borderRadius: 999, background: country.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: country.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {country.countryName}{country.playerId === userId ? ' (you)' : country.ai ? ' [AI]' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      GDP {Math.round(country.gdp)} · P {country.population} · C {Math.round(country.contamination || 0)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: country.eliminated ? '#fca5a5' : gameState.phase === 'lobby' ? (country.ready ? '#4ade80' : '#94a3b8') : '#cbd5e1' }}>
                    {country.eliminated ? 'Out' : gameState.phase === 'lobby' ? (country.ready ? 'Ready' : 'Idle') : country.sanctions > 0 ? `SAN ${country.sanctions}` : `A${country.armed}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg, rgba(30,41,59,0.92), rgba(120,53,15,0.92))', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 999, padding: '8px 16px', color: '#f8fafc', fontSize: 12, pointerEvents: 'none', boxShadow: '0 10px 28px rgba(0,0,0,0.25)' }}>
            {gameState.victory
              ? `${gameState.victory.title} · ${gameState.victory.summary}`
              : focusCountry ? `${focusSummary.title} · ${focusSummary.recommendations.join(' • ')}` : gameState.phase === 'lobby' ? 'Lobby ready checks live' : `Command window: ${gameState.phase}`}
          </div>

          <div style={{ position: 'absolute', left: 12, bottom: 108, width: 260, background: 'rgba(13,17,23,0.9)', border: '1px solid #263244', borderRadius: 10, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{focusCountry ? focusCountry.countryName : myCountry ? myCountry.countryName : 'Awaiting Assignment'}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af', lineHeight: 1.45 }}>
              {focusCountry ? `${focusCountry.archetypeLabel} · Population ${focusCountry.population}% · Infrastructure ${focusCountry.infrastructure}%` : 'Waiting for host snapshot.'}
            </div>
            {focusCountry ? (
              <div style={{ marginTop: 6, fontSize: 11, color: '#cbd5e1', lineHeight: 1.45 }}>
                GDP {Math.round(focusCountry.gdp)} · Economy {focusCountry.economy} · Stability {focusCountry.stability}
                <br />
                Conventional {focusCountry.conventional} · Nuclear {focusCountry.nuclearTier} · Armed {focusCountry.armed}/{focusCountry.arsenal}
                <br />
                Shield {focusCountry.shield} · Intel {focusCountry.intel} · Reputation {focusCountry.reputation}
                <br />
                Contamination {Math.round(focusCountry.contamination || 0)} · Casualties {Math.round(focusCountry.casualties || 0)} · Live Cities {(focusCountry.cities || []).filter((city) => !city.destroyed).length}/{(focusCountry.cities || []).length}
              </div>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 11, color: '#cbd5e1' }}>
              {gameState.logs[0]?.text || 'No new events.'}
            </div>
            {focusSummary.recommendations.length ? (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Suggested Moves</div>
                <div style={{ marginTop: 5, fontSize: 11, color: '#e2e8f0', lineHeight: 1.5 }}>
                  {focusSummary.recommendations.map((entry, index) => (
                    <div key={`${entry}-${index}`}>{index + 1}. {entry}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'min(720px, calc(100vw - 24px))', background: 'rgba(13,17,23,0.94)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 'bold' }}>{gameState.phase === 'lobby' ? 'Lobby Deck' : 'Command Deck'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {myCountry ? `${myCountry.countryName} · Nuclear ${myCountry.nuclearTier} · Shield ${myCountry.shield} · Sanctions ${myCountry.sanctions} · ${myCountry.committed ? 'Orders committed' : 'Orders pending'}` : 'No country assigned yet.'}
                </div>
              </div>
              {gameState.phase === 'lobby' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleReadyToggle} disabled={!myCountry} style={{ padding: '8px 18px', background: myCountry?.ready ? '#14532d' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: myCountry ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                    {myCountry?.ready ? 'Ready' : 'Mark Ready'}
                  </button>
                  {isHost ? (
                    <button onClick={handleStart} disabled={!canLaunch} style={{ padding: '8px 18px', background: canLaunch ? '#7c3aed' : '#374151', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: canLaunch ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                      Start Match
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {myCountry ? (
              gameState.phase === 'reconstruction' ? (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {gameState.rankings.map((entry, index) => (
                    <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#111827', padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                      <span>{index + 1}. {entry.label}</span>
                      <span>{entry.score} · C{entry.contamination} · GDP {entry.gdp}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {isHost ? (
                      <button onClick={handleResetMatch} style={{ padding: '8px 18px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                        New Crisis Table
                      </button>
                    ) : (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Waiting for host to reset the table.</div>
                    )}
                  </div>
                </div>
              ) : gameState.phase !== 'lobby' ? (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {availableActions.map((entry) => (
                    <div key={entry.id} style={{ padding: '8px 10px', background: '#111827', borderRadius: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleAction(entry.id, actionsNeedingTarget.has(entry.id) ? targetOptions[0]?.id || null : null)}
                          style={{ padding: '7px 12px', background: myCountry.action === entry.id ? myCountry.color : '#374151', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                        >
                          {entry.label}
                        </button>
                        <div style={{ fontSize: 11, color: '#94a3b8', flex: 1, minWidth: 180 }}>{entry.description}</div>
                      </div>
                      {actionsNeedingTarget.has(entry.id) ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {targetOptions.map((target) => (
                            <button
                              key={`${entry.id}-${target.id}`}
                              type="button"
                              onClick={() => handleAction(entry.id, target.id)}
                              style={{ padding: '5px 10px', background: myCountry.action === entry.id && myCountry.actionTargetId === target.id ? RED_PHONE_COLOR : '#1f2937', color: '#fff', border: 'none', borderRadius: 999, fontSize: 11, cursor: 'pointer' }}
                            >
                              {target.countryName}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0f172a', borderRadius: 6, border: `1px solid ${myCountry.committed ? '#166534' : '#334155'}` }}>
                    <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                      {myCountry.action ? `Queued: ${availableActions.find((entry) => entry.id === myCountry.action)?.label || myCountry.action}${myCountry.actionTargetId ? ` -> ${targetOptions.find((target) => target.id === myCountry.actionTargetId)?.countryName || 'Target'}` : ''}` : 'Pick an order, then commit it so the phase can resolve.'}
                    </div>
                    <button
                      type="button"
                      onClick={handleCommit}
                      disabled={!myCountry.action || myCountry.committed}
                      style={{ padding: '8px 14px', background: myCountry.action && !myCountry.committed ? '#0f766e' : '#334155', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: myCountry.action && !myCountry.committed ? 'pointer' : 'not-allowed', fontWeight: 700 }}
                    >
                      {myCountry.committed ? 'Committed' : 'Commit Orders'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {gameState.logs.slice(0, 4).map((entry) => (
                    <div key={entry.id} style={{ padding: '8px 10px', background: '#111827', borderRadius: 6, fontSize: 12 }}>{entry.text}</div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>Awaiting country assignment from the host.</div>
            )}
          </div>
        </>
      ) : null}

      {gameState.phase === 'nullfire' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#fff', textShadow: '0 12px 40px rgba(255,0,0,0.55)' }}>
            <div style={{ fontSize: 18, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#fecaca' }}>NULLFIRE</div>
            <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.9 }}>{Math.ceil(phaseTimeLeft / 1000)}</div>
            <div style={{ marginTop: 8, fontSize: 14, color: '#fee2e2' }}>Automatic launch underway. No further commands will be heard.</div>
          </div>
        </div>
      ) : null}

      {gameState.phase === 'reconstruction' && gameState.victory ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', background: 'radial-gradient(circle at center, rgba(2,6,23,0.18), rgba(2,6,23,0.84))' }}>
          <div style={{ width: 'min(560px, calc(100vw - 40px))', background: 'rgba(15,23,42,0.94)', border: `1px solid ${didWin ? '#22c55e66' : '#f9731666'}`, borderRadius: 18, padding: '26px 24px', color: '#f8fafc', textAlign: 'center', boxShadow: '0 25px 90px rgba(0,0,0,0.42)', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.35em', textTransform: 'uppercase', color: didWin ? '#86efac' : '#fdba74' }}>
              {didWin ? 'Victory' : 'Outcome'}
            </div>
            <div style={{ marginTop: 8, fontSize: 40, fontWeight: 900, lineHeight: 1 }}>
              {didWin ? gameState.victory.title : `${gameState.victory.title} Recorded`}
            </div>
            <div style={{ marginTop: 12, fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
              {didWin
                ? `You carried ${myCountry?.countryName || 'your nation'} to the top of the table. ${gameState.victory.summary}`
                : gameState.victory.summary}
            </div>
            {myCountry ? (
              <div style={{ marginTop: 14, fontSize: 13, color: didWin ? '#bbf7d0' : '#fed7aa' }}>
                {myCountry.countryName}: GDP {Math.round(myCountry.gdp)} · Population {myCountry.population}% · Infrastructure {myCountry.infrastructure}% · Contamination {Math.round(myCountry.contamination || 0)}
              </div>
            ) : null}
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              {isHost ? (
                <button onClick={handleResetMatch} style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                  Start New Match
                </button>
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Host can start a new match from here.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return createPortal(hud, containerRef.current)
}

const Defcon3Activity = ({ sdk, currentUser, session }) => {
  const audioRef = useRef(null)
  const hudHostRef = useRef(null)
  const stateRef = useRef(defaultState())
  const guestIdRef = useRef(currentUser?.id || `guest-${Math.random().toString(36).slice(2, 9)}`)
  const hostId = session?.hostId || session?.ownerId || session?.createdBy || currentUser?.id || guestIdRef.current
  const userId = currentUser?.id || guestIdRef.current
  const username = currentUser?.username || currentUser?.displayName || 'Commander'
  const isHost = hostId === userId
  const [gameState, setGameState] = useState(() => {
    const initial = defaultState()
    if (isHost) {
      initial.countries = withBots([createCountry(userId, username, 0, false)])
    }
    return initial
  })
  const [now, setNow] = useState(Date.now())
  const [hoveredCountryId, setHoveredCountryId] = useState(null)
  const [selectedCountryId, setSelectedCountryId] = useState(null)
  const [uiHidden, setUiHidden] = useState(false)
  const [madMode, setMadMode] = useState(false)
  const [targetedCity, setTargetedCity] = useState(null)
  const [madCooldownUntil, setMadCooldownUntil] = useState(0)
  const [interceptCooldownUntil, setInterceptCooldownUntil] = useState(0)
  const [inboundAlerts, setInboundAlerts] = useState([])
  const [decoyAlerts, setDecoyAlerts] = useState([])
  const [terminalLog, setTerminalLog] = useState([
    { id: 'init', text: '⚡ COMMAND TERMINAL — CLASSIFIED ACCESS', ts: Date.now() },
    { id: 'init2', text: '[DEFCON] Global watch floor online. Awaiting orders.', ts: Date.now() }
  ])

  const addTerminalLine = useCallback((text) => {
    setTerminalLog((prev) => [{ id: toFeedId(), text: `[${new Date().toLocaleTimeString()}] ${text}`, ts: Date.now() }, ...prev].slice(0, 40))
  }, [])

  if (!audioRef.current) audioRef.current = createDefconAudio()

  const myCountry = gameState.countries.find((country) => country.playerId === userId && !country.ai) || null
  const defcon = currentDefcon(gameState.threat)
  const phaseTimeLeft = Math.max(0, gameState.phaseEndsAt - now)
  const livingCountries = gameState.countries.filter((country) => !country.eliminated)
  const humanCountries = gameState.countries.filter((country) => !country.ai)
  const readyCount = humanCountries.filter((country) => country.ready).length
  const canLaunch = humanCountries.length > 0 && humanCountries.every((country) => country.ready)
  const hoveredCountry = gameState.countries.find((country) => country.id === hoveredCountryId) || null
  const selectedCountry = gameState.countries.find((country) => country.id === selectedCountryId) || null

  const sendEvent = useCallback((type, payload = {}) => {
    sdk?.emitEvent?.(type, payload, { serverRelay: true })
  }, [sdk])

  const sendSnapshot = useCallback((targetId = null) => {
    sendEvent('defcon3:snapshot', { targetId, state: stateRef.current })
  }, [sendEvent])

  useEffect(() => () => {
    audioRef.current?.dispose?.()
  }, [])

  useEffect(() => {
    stateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const mode = gameState.phase === 'nullfire' ? 'nullfire' : 'coldwar'
    audio.playLoop(mode, gameState.threat / 4)
  }, [gameState.phase, gameState.threat])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
      audioRef.current?.tick?.(defcon)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [defcon])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = String(event.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return
      if (event.key.toLowerCase() !== 'h') return
      event.preventDefault()
      setUiHidden((current) => !current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleEvent = (event) => {
      const type = String(event?.eventType || '')
      const payload = event?.payload || {}
      if (!type.startsWith('defcon3:')) return
      if (payload.targetId && payload.targetId !== userId) return

      if (type === 'defcon3:snapshot') {
        if (payload.state) setGameState(payload.state)
        return
      }

      if (type === 'defcon3:join' && isHost) {
        setGameState((current) => {
          if (current.countries.some((country) => country.playerId === payload.playerId && !country.ai)) return current
          const humans = current.countries.filter((country) => !country.ai)
          const nextHumans = [...humans, createCountry(payload.playerId, payload.username || 'Commander', humans.length, false)]
          return { ...current, countries: withBots(nextHumans) }
        })
        sendSnapshot(payload.playerId)
        return
      }

      if (type === 'defcon3:leave' && isHost) {
        setGameState((current) => {
          const nextHumans = current.countries.filter((country) => !country.ai && country.playerId !== payload.playerId)
          return { ...current, countries: withBots(nextHumans) }
        })
        return
      }

      if (type === 'defcon3:action' && isHost) {
        setGameState((current) => queueCountryAction(current, payload))
        audioRef.current?.confirm?.()
        return
      }

      if (type === 'defcon3:commit' && isHost) {
        setGameState((current) => commitCountryOrders(current, payload.countryId))
        audioRef.current?.confirm?.()
        return
      }

      if (type === 'defcon3:ready' && isHost) {
        setGameState((current) => setLobbyReady(current, payload.playerId, payload.ready))
        return
      }

      if (type === 'defcon3:start' && isHost) {
        setGameState((current) => startMatchFromLobby(current))
        return
      }

      if (type === 'defcon3:reset' && isHost) {
        setGameState((current) => {
          const reset = defaultState()
          reset.countries = withBots(current.countries.filter((country) => !country.ai).map((country) => ({ ...country, ready: false })))
          return reset
        })
      }
    }

    const off = sdk.on?.('event', handleEvent)
    sendEvent('defcon3:join', { playerId: userId, username })
    return () => {
      sendEvent('defcon3:leave', { playerId: userId })
      off?.()
    }
  }, [isHost, sdk, sendEvent, sendSnapshot, userId, username])

  useEffect(() => {
    if (!isHost) return undefined
    const interval = window.setInterval(() => {
      const current = stateRef.current
      if (current.phase === 'lobby') return
      if (actionCatalog[current.phase]?.length) {
        let next = current
        current.countries.filter((country) => country.ai && !country.eliminated).forEach((country) => {
          if (!country.action) {
            next = queueCountryAction(next, {
              countryId: country.id,
              countryName: country.countryName,
              ...selectAutoAction(country, current.phase, current.countries.filter((entry) => !entry.eliminated), current.threat)
            })
          }
        })
        if (next !== current) {
          stateRef.current = next
          setGameState(next)
          sendSnapshot()
          return
        }
      }
      if (actionCatalog[current.phase]?.length) {
        const allCommitted = current.countries
          .filter((country) => !country.eliminated)
          .every((country) => country.ai || country.committed)
        if (allCommitted) {
          const next = current.phase === 'nullfire' ? resolveNullfire(current) : resolvePhase(current)
          stateRef.current = next
          setGameState(next)
          sendSnapshot()
          if (next.phase === 'nullfire') audioRef.current?.alarm?.()
          if (current.phase === 'nullfire') audioRef.current?.launch?.()
          return
        }
      }
      if (!current.phaseEndsAt || Date.now() < current.phaseEndsAt) return
      const next = current.phase === 'nullfire' ? resolveNullfire(current) : resolvePhase(current)
      stateRef.current = next
      setGameState(next)
      sendSnapshot()
      if (next.phase === 'nullfire') audioRef.current?.alarm?.()
      if (current.phase === 'nullfire') audioRef.current?.launch?.()
    }, 400)
    return () => window.clearInterval(interval)
  }, [isHost, sendSnapshot])

  useEffect(() => {
    if (!isHost || !actionCatalog[gameState.phase]?.length) return undefined
    const timeout = window.setTimeout(() => {
      const current = stateRef.current
      let next = current
      current.countries.filter((country) => country.ai && !country.eliminated && !country.committed).forEach((country) => {
        if (!country.action) {
          next = queueCountryAction(next, {
            countryId: country.id,
            countryName: country.countryName,
            ...selectAutoAction(country, current.phase, current.countries.filter((entry) => !entry.eliminated), current.threat)
          })
        }
        next = commitCountryOrders(next, country.id)
      })
      if (next !== current) {
        stateRef.current = next
        setGameState(next)
        sendSnapshot()
      }
    }, AI_COMMIT_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [gameState.phase, isHost, sendSnapshot])

  useEffect(() => {
    if (!isHost) return
    sendSnapshot()
  }, [gameState, isHost, sendSnapshot])

  const handleAction = useCallback((actionId, targetId = null) => {
    if (!myCountry || gameState.phase === 'lobby' || gameState.phase === 'resolution' || gameState.phase === 'nullfire' || gameState.phase === 'reconstruction') return
    if (isHost) {
      setGameState((current) => queueCountryAction(current, {
        countryId: myCountry.id,
        countryName: myCountry.countryName,
        actionId,
        targetId
      }))
    }
    sendEvent('defcon3:action', {
      countryId: myCountry.id,
      countryName: myCountry.countryName,
      actionId,
      targetId
    })
    audioRef.current?.confirm?.()
  }, [gameState.phase, isHost, myCountry, sendEvent])

  const handleCommit = useCallback(() => {
    if (!myCountry || !myCountry.action || myCountry.committed || gameState.phase === 'lobby' || gameState.phase === 'resolution' || gameState.phase === 'nullfire' || gameState.phase === 'reconstruction') return
    if (isHost) {
      setGameState((current) => commitCountryOrders(current, myCountry.id))
    }
    sendEvent('defcon3:commit', { countryId: myCountry.id })
    audioRef.current?.confirm?.()
  }, [gameState.phase, isHost, myCountry, sendEvent])

  const handleReadyToggle = useCallback(() => {
    if (!myCountry) return
    const nextReady = !myCountry.ready
    if (isHost) {
      setGameState((current) => setLobbyReady(current, userId, nextReady))
    }
    sendEvent('defcon3:ready', { playerId: userId, ready: !myCountry?.ready })
    audioRef.current?.confirm?.()
  }, [isHost, myCountry, sendEvent, userId])

  const handleStart = useCallback(() => {
    if (!isHost || !canLaunch) return
    setGameState((current) => startMatchFromLobby(current))
    sendEvent('defcon3:start')
    audioRef.current?.confirm?.()
  }, [canLaunch, isHost, sendEvent])

  const handleResetMatch = useCallback(() => {
    if (!isHost) return
    const reset = defaultState()
    reset.countries = withBots(stateRef.current.countries.filter((country) => !country.ai).map((country) => ({ ...country, ready: false })))
    stateRef.current = reset
    setGameState(reset)
    sendEvent('defcon3:reset')
    audioRef.current?.confirm?.()
  }, [isHost, sendEvent])

  const availableActions = actionCatalog[gameState.phase] || []
  const actionsNeedingTarget = new Set(['cyber', 'red-phone', 'trade-pact', 'sanctions', 'strike', 'aid-corridor'])
  const targetOptions = livingCountries.filter((country) => country.id !== myCountry?.id)

  // MAD mode: toggle targeting mode (military phase only, must have armed weapons)
  const handleToggleMad = useCallback(() => {
    if (!myCountry || gameState.phase !== 'military' || myCountry.armed < 1) return
    setMadMode((prev) => {
      if (prev) { setTargetedCity(null) }
      addTerminalLine(prev ? '[MAD] Targeting mode disengaged.' : '[MAD] ⚠ TARGETING MODE ACTIVE — Click a city on the globe to lock on.')
      return !prev
    })
  }, [myCountry, gameState.phase, addTerminalLine])

  // MAD strike: instant city strike, no phase needed, 18s cooldown
  const handleMadStrike = useCallback(() => {
    if (!myCountry || !targetedCity || now < madCooldownUntil) return
    if (myCountry.armed < 1) { addTerminalLine('[MAD] No armed weapons available.'); return }
    const targetCountry = gameState.countries.find((c) => (c.cities || []).some((city) => city.id === targetedCity.id))
    if (!targetCountry || targetCountry.id === myCountry.id) return
    const isDecoy = Math.random() < DECOY_CHANCE
    if (isDecoy) {
      addTerminalLine(`[MAD] ⚠ DECOY DETECTED — ${targetedCity.name} contact was a ghost. Strike aborted.`)
      setDecoyAlerts((prev) => [{ id: toFeedId(), city: targetedCity.name, ts: Date.now() }, ...prev].slice(0, 5))
      setTargetedCity(null)
      setMadMode(false)
      setMadCooldownUntil(now + MAD_STRIKE_COOLDOWN_MS / 2)
      return
    }
    const missileId = `mad-${myCountry.id}-${targetedCity.id}-${Date.now()}`
    const newMissile = {
      id: missileId,
      fromId: myCountry.id,
      toId: targetCountry.id,
      fromLat: myCountry.lat,
      fromLon: myCountry.lon,
      toLat: targetedCity.lat,
      toLon: targetedCity.lon,
      targetCityId: targetedCity.id,
      targetCityName: targetedCity.name,
      impactAt: Date.now() + 8000,
      strategic: myCountry.nuclearTier >= 3,
      launchedAt: Date.now(),
      mad: true
    }
    setGameState((current) => {
      const updated = {
        ...current,
        missiles: [...(current.missiles || []), newMissile],
        threat: clamp(current.threat + (myCountry.nuclearTier >= 3 ? 0.55 : 0.28), 0, 4.4),
        countries: current.countries.map((c) => {
          if (c.id === myCountry.id) return { ...c, armed: clamp(c.armed - 1, 0, c.arsenal) }
          if (c.id === targetCountry.id) {
            const hitCity = (c.cities || []).map((city) => city.id === targetedCity.id
              ? { ...city, integrity: clamp(city.integrity - 55, 0, 100), contamination: clamp(city.contamination + 28, 0, 100), destroyed: city.integrity - 55 <= 0 }
              : city)
            const popHit = myCountry.nuclearTier >= 3 ? 22 : 10
            const infraHit = myCountry.nuclearTier >= 3 ? 28 : 14
            return {
              ...c,
              cities: hitCity,
              population: clamp(c.population - popHit, 0, 100),
              infrastructure: clamp(c.infrastructure - infraHit, 0, 100),
              contamination: clamp((c.contamination || 0) + (myCountry.nuclearTier >= 3 ? 24 : 12), 0, 100),
              casualties: clamp((c.casualties || 0) + popHit, 0, 100),
              stability: clamp(c.stability - 2, 0, 10),
              hostileTo: Array.from(new Set([...c.hostileTo, myCountry.id]))
            }
          }
          return c
        }),
        strikes: [...(current.strikes || []), {
          id: `mad-strike-${missileId}`,
          toId: targetCountry.id,
          lat: targetedCity.lat,
          lon: targetedCity.lon,
          cityName: targetedCity.name,
          contamination: myCountry.nuclearTier >= 3 ? 24 : 12,
          strategic: myCountry.nuclearTier >= 3
        }]
      }
      return appendLog(updated, `[MAD] ${myCountry.countryName} struck ${targetedCity.name} in ${targetCountry.countryName}. No warning given.`)
    })
    addTerminalLine(`[LAUNCH] ⚡ Strike authorized on ${targetedCity.name}. Flight time ~8s. Allies have 60s to respond.`)
    // Broadcast inbound alert to all players
    sendEvent('defcon3:mad-inbound', {
      fromCountry: myCountry.countryName,
      targetCountry: targetCountry.countryName,
      targetCity: targetedCity.name,
      impactAt: newMissile.impactAt,
      strategic: newMissile.strategic
    })
    setInboundAlerts((prev) => [{ id: missileId, from: myCountry.countryName, city: targetedCity.name, impactAt: newMissile.impactAt, intercepted: false }, ...prev].slice(0, 6))
    setMadCooldownUntil(now + MAD_STRIKE_COOLDOWN_MS)
    setTargetedCity(null)
    setMadMode(false)
    audioRef.current?.launch?.()
  }, [myCountry, targetedCity, now, madCooldownUntil, gameState.countries, sendEvent, addTerminalLine])

  // Interceptor: 50/50 success, 30s cooldown
  const handleIntercept = useCallback((alertId) => {
    if (now < interceptCooldownUntil) {
      addTerminalLine(`[INTERCEPT] System recharging. ${Math.ceil((interceptCooldownUntil - now) / 1000)}s remaining.`)
      return
    }
    const success = Math.random() < INTERCEPT_SUCCESS_RATE
    setInterceptCooldownUntil(now + INTERCEPT_COOLDOWN_MS)
    if (success) {
      addTerminalLine('[INTERCEPT] ✓ Intercept successful. Inbound neutralized.')
      setInboundAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, intercepted: true } : a))
      setGameState((current) => ({
        ...current,
        missiles: (current.missiles || []).filter((m) => m.id !== alertId),
        threat: clamp(current.threat - 0.12, 0, 4.4)
      }))
    } else {
      addTerminalLine('[INTERCEPT] ✗ Intercept failed. Inbound still active. Retry in 30s.')
    }
    audioRef.current?.confirm?.()
  }, [now, interceptCooldownUntil, addTerminalLine])

  // Decoy/false alarm: random radar ghost events during military phase
  useEffect(() => {
    if (gameState.phase !== 'military' && gameState.phase !== 'nullfire') return undefined
    const interval = window.setInterval(() => {
      if (Math.random() < 0.12) {
        const ghostCountry = randomChoice(gameState.countries.filter((c) => !c.eliminated && c.id !== myCountry?.id))
        if (!ghostCountry) return
        const ghostCity = randomChoice(ghostCountry.cities || [])
        if (!ghostCity) return
        const isReal = Math.random() > DECOY_CHANCE
        if (!isReal) {
          addTerminalLine(`[RADAR] ⚠ Unconfirmed contact: possible launch from ${ghostCountry.countryName} toward ${ghostCity.name}. Awaiting confirmation...`)
          setDecoyAlerts((prev) => [{ id: toFeedId(), city: ghostCity.name, from: ghostCountry.countryName, ts: Date.now(), ghost: true }, ...prev].slice(0, 5))
          window.setTimeout(() => {
            addTerminalLine(`[RADAR] Contact from ${ghostCountry.countryName} confirmed as GHOST. No launch detected.`)
          }, 8000 + Math.random() * 6000)
        }
      }
    }, 14000)
    return () => window.clearInterval(interval)
  }, [gameState.phase, gameState.countries, myCountry, addTerminalLine])

  // Listen for inbound MAD alerts from other players
  useEffect(() => {
    const handleEvent = (event) => {
      const type = String(event?.eventType || '')
      const payload = event?.payload || {}
      if (type !== 'defcon3:mad-inbound') return
      addTerminalLine(`[THREAT] ⚠ INBOUND DETECTED — ${payload.fromCountry} launched on ${payload.targetCity} (${payload.targetCountry}). Impact in ~${Math.ceil((payload.impactAt - Date.now()) / 1000)}s.`)
      setInboundAlerts((prev) => [{
        id: `inbound-${Date.now()}`,
        from: payload.fromCountry,
        city: payload.targetCity,
        impactAt: payload.impactAt,
        intercepted: false,
        strategic: payload.strategic
      }, ...prev].slice(0, 6))
      audioRef.current?.alarm?.()
    }
    const off = sdk.on?.('event', handleEvent)
    return () => off?.()
  }, [sdk, addTerminalLine])

  return (
    <GameCanvasShell
      title="DEFCON 3"
      subtitle="NULLFIRE"
      status="Shared crisis table with a live globe, compact command cards, and host-controlled lobby flow."
      skin="strategy"
      musicEnabled={false}
      header={false}
      layout="stretch"
      contentPointerEvents="none"
      backgroundNode={<DefconScene countries={gameState.countries} missiles={gameState.missiles} strikes={gameState.strikes || []} threat={gameState.threat} phase={gameState.phase} hoveredCountryId={hoveredCountryId} selectedCountryId={selectedCountryId} onHoverCountry={setHoveredCountryId} onSelectCountry={setSelectedCountryId} madMode={madMode} targetedCityId={targetedCity?.id || null} onTargetCity={setTargetedCity} />}
      contentStyle={{ fontFamily: 'monospace' }}
    >
      <div ref={hudHostRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: gameState.phase === 'nullfire' ? 'rgba(255,255,255,0.08)' : 'transparent' }} />

      {/* MAD Mode + Interceptor HUD */}
      {!uiHidden && gameState.phase !== 'lobby' && gameState.phase !== 'reconstruction' ? (
        <div style={{ position: 'absolute', right: 12, bottom: 108, width: 240, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* MAD Strike Panel */}
          {myCountry && myCountry.armed > 0 && gameState.phase === 'military' ? (
            <div style={{ background: madMode ? 'rgba(127,29,29,0.96)' : 'rgba(13,17,23,0.92)', border: `1px solid ${madMode ? '#ef4444' : '#374151'}`, borderRadius: 8, padding: '10px 12px', color: '#f9fafb' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: madMode ? '#fca5a5' : '#f9fafb', marginBottom: 6 }}>⚡ MAD STRIKE MODE</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
                {madMode ? (targetedCity ? `Target locked: ${targetedCity.name}` : 'Click a city on the globe to target') : `Armed: ${myCountry.armed} warhead${myCountry.armed !== 1 ? 's' : ''} · No negotiation`}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={handleToggleMad}
                  style={{ padding: '6px 12px', background: madMode ? '#7f1d1d' : '#991b1b', color: '#fff', border: `1px solid ${madMode ? '#ef4444' : '#dc2626'}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                >
                  {madMode ? 'Cancel' : 'Arm MAD'}
                </button>
                {madMode && targetedCity ? (
                  <button
                    onClick={handleMadStrike}
                    disabled={now < madCooldownUntil}
                    style={{ padding: '6px 12px', background: now < madCooldownUntil ? '#374151' : '#dc2626', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: now < madCooldownUntil ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                  >
                    {now < madCooldownUntil ? `CD ${Math.ceil((madCooldownUntil - now) / 1000)}s` : '🚀 LAUNCH'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Interceptor Panel */}
          {inboundAlerts.filter((a) => !a.intercepted && Date.now() < a.impactAt + 5000).length > 0 ? (
            <div style={{ background: 'rgba(69,10,10,0.96)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 12px', color: '#f9fafb' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', marginBottom: 6 }}>🛡 INBOUND DETECTED</div>
              {inboundAlerts.filter((a) => !a.intercepted && Date.now() < a.impactAt + 5000).slice(0, 3).map((alert) => (
                <div key={alert.id} style={{ marginBottom: 6, padding: '6px 8px', background: 'rgba(0,0,0,0.4)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: '#fca5a5' }}>{alert.from} → {alert.city}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Impact in ~{Math.max(0, Math.ceil((alert.impactAt - now) / 1000))}s</div>
                  <button
                    onClick={() => handleIntercept(alert.id)}
                    disabled={now < interceptCooldownUntil}
                    style={{ marginTop: 4, padding: '4px 10px', background: now < interceptCooldownUntil ? '#374151' : '#0f766e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, cursor: now < interceptCooldownUntil ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                  >
                    {now < interceptCooldownUntil ? `Recharging ${Math.ceil((interceptCooldownUntil - now) / 1000)}s` : 'Intercept (50/50)'}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Terminal Log */}
          <div style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid #00ff0033', borderRadius: 8, padding: '8px 10px', maxHeight: 140, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: '#00ff00', fontFamily: 'Courier New, monospace', marginBottom: 4, borderBottom: '1px solid #00ff0022', paddingBottom: 3 }}>⚡ COMMAND TERMINAL</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {terminalLog.slice(0, 6).map((entry) => (
                <div key={entry.id} style={{ fontSize: 9, color: entry.text.includes('INBOUND') || entry.text.includes('LAUNCH') ? '#fca5a5' : entry.text.includes('✓') ? '#4ade80' : '#00cc00', fontFamily: 'Courier New, monospace', lineHeight: 1.4 }}>
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <DefconHUD
        containerRef={hudHostRef}
        gameState={gameState}
        defcon={defcon}
        readyCount={readyCount}
        humanCountries={humanCountries}
        phaseTimeLeft={phaseTimeLeft}
        hoveredCountry={hoveredCountry}
        selectedCountry={selectedCountry}
        myCountry={myCountry}
        userId={userId}
        isHost={isHost}
        canLaunch={canLaunch}
        handleReadyToggle={handleReadyToggle}
        handleStart={handleStart}
        availableActions={availableActions}
        actionsNeedingTarget={actionsNeedingTarget}
        targetOptions={targetOptions}
        handleAction={handleAction}
        handleCommit={handleCommit}
        handleResetMatch={handleResetMatch}
        setHoveredCountryId={setHoveredCountryId}
        setSelectedCountryId={setSelectedCountryId}
        uiHidden={uiHidden}
        setUiHidden={setUiHidden}
      />
    </GameCanvasShell>
  )
}

export default Defcon3Activity
