import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'

/**
 * DEFCON: MAD — Strategic Defense Simulation
 * ─────────────────────────────────────────────
 * 28 nations, multiplayer + bot AI for unassigned nations.
 * Deadman switch: if tension stays critical too long without de-escalation → automatic MAD.
 * Point of No Return: if global tension reaches 100%, MAD is unavoidable.
 * Players MUST act — evacuate, de-escalate, negotiate, or strike.
 * Web Audio sound effects throughout.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

let _ac = null
const ac = () => {
  if (!_ac) try { _ac = new (window.AudioContext || window.webkitAudioContext)() } catch {}
  return _ac
}
const tone = (f, d, t = 'sine', v = 0.25, delay = 0) => {
  const ctx = ac(); if (!ctx) return
  try {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = t; o.frequency.setValueAtTime(f, ctx.currentTime + delay)
    g.gain.setValueAtTime(0.001, ctx.currentTime + delay)
    g.gain.exponentialRampToValueAtTime(v, ctx.currentTime + delay + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + d)
    o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + d + 0.05)
  } catch {}
}
const noise = (d, v = 0.2, delay = 0, fc = 400) => {
  const ctx = ac(); if (!ctx) return
  try {
    const sz = ctx.sampleRate * d, buf = ctx.createBuffer(1, sz, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < sz; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / sz * 6)
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain()
    src.buffer = buf; flt.type = 'lowpass'; flt.frequency.value = fc
    src.connect(flt); flt.connect(g); g.connect(ctx.destination)
    g.gain.setValueAtTime(v, ctx.currentTime + delay)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + d)
    src.start(ctx.currentTime + delay)
  } catch {}
}

const SFX = {
  launch:      () => { tone(80, 1.5, 'sawtooth', 0.3); tone(200, 1.0, 'sawtooth', 0.2, 0.3); noise(1.5, 0.4, 0.1, 300) },
  explosion:   () => { noise(2.0, 0.8, 0, 150); tone(60, 1.5, 'triangle', 0.4, 0.1); noise(0.8, 0.5, 0.3, 600) },
  alert:       () => { for (let i = 0; i < 4; i++) { tone(880, 0.2, 'square', 0.3, i * 0.35); tone(660, 0.2, 'square', 0.25, i * 0.35 + 0.2) } },
  siren:       () => { for (let i = 0; i < 3; i++) { tone(400 + i * 200, 0.5, 'sine', 0.3, i * 0.6); tone(600 + i * 200, 0.5, 'sine', 0.25, i * 0.6 + 0.3) } },
  click:       () => tone(800, 0.05, 'sine', 0.15),
  warning:     () => { tone(440, 0.3, 'square', 0.3); tone(330, 0.3, 'square', 0.25, 0.35) },
  deescalate:  () => { [523, 659, 784].forEach((f, i) => tone(f, 0.25, 'sine', 0.3, i * 0.15)) },
  deadman:     () => { for (let i = 0; i < 6; i++) { tone(220 - i * 20, 0.4, 'sawtooth', 0.5, i * 0.3); noise(0.3, 0.6, i * 0.3 + 0.1) } },
  negotiate:   () => { tone(523, 0.15, 'sine', 0.2); tone(659, 0.15, 'sine', 0.2, 0.2) },
  radiation:   () => { for (let i = 0; i < 5; i++) tone(100 + i * 30, 0.3, 'sine', 0.15, i * 0.1) },
  gameStart:   () => { [261, 329, 392, 523, 659].forEach((f, i) => tone(f, 0.3, 'sine', 0.35, i * 0.1)) },
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD DATA — 28 NATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const NATIONS = [
  // NATO
  { id: 'usa',        name: 'United States',       side: 'nato',    x: 0.04, y: 0.28, w: 0.22, h: 0.18, pop: 331e6,  mil: 100, eco: 95,  nukes: 1800, cities: ['Washington DC','New York','Los Angeles','Chicago','Houston'] },
  { id: 'uk',         name: 'United Kingdom',       side: 'nato',    x: 0.46, y: 0.21, w: 0.03, h: 0.05, pop: 67e6,   mil: 80,  eco: 85,  nukes: 225,  cities: ['London','Birmingham','Manchester'] },
  { id: 'france',     name: 'France',               side: 'nato',    x: 0.48, y: 0.27, w: 0.04, h: 0.05, pop: 68e6,   mil: 80,  eco: 85,  nukes: 290,  cities: ['Paris','Marseille','Lyon'] },
  { id: 'germany',    name: 'Germany',              side: 'nato',    x: 0.51, y: 0.24, w: 0.03, h: 0.05, pop: 83e6,   mil: 75,  eco: 90,  nukes: 0,    cities: ['Berlin','Hamburg','Munich'] },
  { id: 'canada',     name: 'Canada',               side: 'nato',    x: 0.06, y: 0.12, w: 0.20, h: 0.16, pop: 38e6,   mil: 65,  eco: 80,  nukes: 0,    cities: ['Ottawa','Toronto','Vancouver'] },
  { id: 'australia',  name: 'Australia',            side: 'nato',    x: 0.76, y: 0.62, w: 0.14, h: 0.14, pop: 26e6,   mil: 60,  eco: 80,  nukes: 0,    cities: ['Canberra','Sydney','Melbourne'] },
  { id: 'turkey',     name: 'Turkey',               side: 'nato',    x: 0.57, y: 0.32, w: 0.06, h: 0.04, pop: 85e6,   mil: 70,  eco: 65,  nukes: 0,    cities: ['Ankara','Istanbul','Izmir'] },
  { id: 'poland',     name: 'Poland',               side: 'nato',    x: 0.54, y: 0.22, w: 0.03, h: 0.04, pop: 38e6,   mil: 65,  eco: 70,  nukes: 0,    cities: ['Warsaw','Krakow','Gdansk'] },
  // Warsaw Pact / Adversaries
  { id: 'russia',     name: 'Russian Federation',   side: 'warsaw',  x: 0.56, y: 0.08, w: 0.28, h: 0.22, pop: 146e6,  mil: 95,  eco: 70,  nukes: 2000, cities: ['Moscow','St. Petersburg','Novosibirsk','Yekaterinburg'] },
  { id: 'china',      name: "People's Rep. China",  side: 'warsaw',  x: 0.68, y: 0.32, w: 0.18, h: 0.16, pop: 1400e6, mil: 90,  eco: 90,  nukes: 400,  cities: ['Beijing','Shanghai','Guangzhou','Shenzhen'] },
  { id: 'nkorea',     name: 'North Korea',          side: 'warsaw',  x: 0.82, y: 0.30, w: 0.03, h: 0.04, pop: 26e6,   mil: 70,  eco: 20,  nukes: 40,   cities: ['Pyongyang','Hamhung'] },
  { id: 'iran',       name: 'Iran',                 side: 'warsaw',  x: 0.60, y: 0.35, w: 0.06, h: 0.06, pop: 85e6,   mil: 65,  eco: 50,  nukes: 5,    cities: ['Tehran','Isfahan','Mashhad'] },
  { id: 'belarus',    name: 'Belarus',              side: 'warsaw',  x: 0.56, y: 0.20, w: 0.03, h: 0.03, pop: 9e6,    mil: 55,  eco: 45,  nukes: 0,    cities: ['Minsk','Gomel'] },
  { id: 'venezuela',  name: 'Venezuela',            side: 'warsaw',  x: 0.20, y: 0.52, w: 0.06, h: 0.06, pop: 29e6,   mil: 45,  eco: 30,  nukes: 0,    cities: ['Caracas','Maracaibo'] },
  { id: 'cuba',       name: 'Cuba',                 side: 'warsaw',  x: 0.17, y: 0.42, w: 0.04, h: 0.02, pop: 11e6,   mil: 40,  eco: 30,  nukes: 0,    cities: ['Havana','Santiago'] },
  { id: 'syria',      name: 'Syria',                side: 'warsaw',  x: 0.58, y: 0.33, w: 0.03, h: 0.03, pop: 21e6,   mil: 40,  eco: 20,  nukes: 0,    cities: ['Damascus','Aleppo'] },
  // Neutral
  { id: 'india',      name: 'India',                side: 'neutral', x: 0.64, y: 0.40, w: 0.12, h: 0.16, pop: 1380e6, mil: 75,  eco: 70,  nukes: 160,  cities: ['New Delhi','Mumbai','Bangalore','Kolkata'] },
  { id: 'japan',      name: 'Japan',                side: 'neutral', x: 0.84, y: 0.34, w: 0.06, h: 0.13, pop: 125e6,  mil: 70,  eco: 85,  nukes: 0,    cities: ['Tokyo','Osaka','Yokohama'] },
  { id: 'brazil',     name: 'Brazil',               side: 'neutral', x: 0.22, y: 0.55, w: 0.14, h: 0.18, pop: 215e6,  mil: 60,  eco: 65,  nukes: 0,    cities: ['Brasilia','São Paulo','Rio de Janeiro'] },
  { id: 'southafrica',name: 'South Africa',         side: 'neutral', x: 0.52, y: 0.72, w: 0.08, h: 0.10, pop: 60e6,   mil: 50,  eco: 55,  nukes: 0,    cities: ['Pretoria','Cape Town','Johannesburg'] },
  { id: 'mexico',     name: 'Mexico',               side: 'neutral', x: 0.10, y: 0.38, w: 0.10, h: 0.10, pop: 130e6,  mil: 50,  eco: 60,  nukes: 0,    cities: ['Mexico City','Guadalajara','Monterrey'] },
  { id: 'egypt',      name: 'Egypt',                side: 'neutral', x: 0.55, y: 0.40, w: 0.05, h: 0.06, pop: 104e6,  mil: 55,  eco: 45,  nukes: 0,    cities: ['Cairo','Alexandria','Giza'] },
  { id: 'nigeria',    name: 'Nigeria',              side: 'neutral', x: 0.49, y: 0.52, w: 0.05, h: 0.07, pop: 220e6,  mil: 45,  eco: 40,  nukes: 0,    cities: ['Abuja','Lagos','Kano'] },
  { id: 'argentina',  name: 'Argentina',            side: 'neutral', x: 0.22, y: 0.70, w: 0.08, h: 0.16, pop: 46e6,   mil: 45,  eco: 50,  nukes: 0,    cities: ['Buenos Aires','Córdoba','Rosario'] },
  { id: 'indonesia',  name: 'Indonesia',            side: 'neutral', x: 0.76, y: 0.52, w: 0.12, h: 0.08, pop: 275e6,  mil: 55,  eco: 60,  nukes: 0,    cities: ['Jakarta','Surabaya','Bandung'] },
  { id: 'pakistan',   name: 'Pakistan',             side: 'neutral', x: 0.63, y: 0.37, w: 0.05, h: 0.06, pop: 225e6,  mil: 60,  eco: 40,  nukes: 165,  cities: ['Islamabad','Karachi','Lahore'] },
  { id: 'israel',     name: 'Israel',               side: 'neutral', x: 0.57, y: 0.36, w: 0.02, h: 0.02, pop: 9e6,    mil: 75,  eco: 80,  nukes: 90,   cities: ['Jerusalem','Tel Aviv'] },
  { id: 'saudiarabia',name: 'Saudi Arabia',         side: 'neutral', x: 0.59, y: 0.38, w: 0.05, h: 0.06, pop: 35e6,   mil: 65,  eco: 75,  nukes: 0,    cities: ['Riyadh','Jeddah','Mecca'] },
]

const SIDE_COLORS = {
  nato:    { fill: 'rgba(0,80,200,0.22)',  border: '#3b82f6', label: '#60a5fa' },
  warsaw:  { fill: 'rgba(200,30,30,0.22)', border: '#ef4444', label: '#f87171' },
  neutral: { fill: 'rgba(200,160,0,0.18)', border: '#eab308', label: '#fbbf24' },
  rogue:   { fill: 'rgba(128,0,128,0.22)', border: '#a855f7', label: '#c084fc' },
}

const BOMB_TYPES = [
  { id: 'dirty',   name: 'Dirty Bomb',         color: '#8B4513', baseDamage: 200, speed: 0.04, interceptDifficulty: 0.2, radiationMult: 0.5 },
  { id: 'icbm',    name: 'ICBM',               color: '#ef4444', baseDamage: 500, speed: 0.08, interceptDifficulty: 0.5, radiationMult: 1.0 },
  { id: 'mirv',    name: 'MIRV',               color: '#a855f7', baseDamage: 800, speed: 0.10, interceptDifficulty: 0.8, radiationMult: 1.5 },
  { id: 'tactical',name: 'Tactical Nuke',       color: '#f97316', baseDamage: 300, speed: 0.12, interceptDifficulty: 0.4, radiationMult: 0.8 },
  { id: 'hydrogen',name: 'Hydrogen Bomb',       color: '#ffffff', baseDamage: 1200, speed: 0.03, interceptDifficulty: 0.1, radiationMult: 2.0 },
]

const BOMB_TYPE_MAP = Object.fromEntries(BOMB_TYPES.map(b => [b.id, b]))
const INTERCEPTION_RANGE = 0.015 // map units (≈1.5% of world width)

function getRandomBombType() {
  // Weighted random: dirty and tactical more common, hydrogen rare
  const weights = [0.3, 0.3, 0.1, 0.2, 0.1] // dirty, icbm, mirv, tactical, hydrogen
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return BOMB_TYPES[i]
  }
  return BOMB_TYPES[0]
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function rnd(a, b) { return a + Math.random() * (b - a) }

function buildWorld() {
  const countries = {}, cities = {}, evacuationCenters = {}, militaryBases = {}
  NATIONS.forEach(n => {
     countries[n.id] = {
       ...n, destroyed: false, evacuationStatus: 0, damageLevel: 0,
       tension: 30 + Math.random() * 20,  // 0-100 tension level
       lastAction: 0,                      // game time of last player action
       isBot: true,                        // will be set false when player joins
       botCooldown: 0,
       interceptionsUsed: 0,
       maxInterceptions: 30,
     }
    n.cities.forEach((name, i) => {
      const id = `${n.id}_c${i}`
      const mults = [0.08, 0.04, 0.025, 0.02, 0.015]
      const pop = Math.floor(n.pop * (mults[i] || 0.005) * rnd(0.8, 1.2))
      cities[id] = {
        id, name, country: n.id, population: pop,
        x: n.x + rnd(0.005, n.w - 0.005),
        y: n.y + rnd(0.005, n.h - 0.005),
        isCapital: i === 0, destroyed: false, evacuated: false, casualties: 0,
      }
    })
    // Evac centers
    for (let i = 0; i < 2; i++) {
      const id = `${n.id}_ev${i}`
      evacuationCenters[id] = {
        id, country: n.id, operational: true,
        x: n.x + rnd(0.005, n.w - 0.005),
        y: n.y + rnd(0.005, n.h - 0.005),
        capacity: rnd(300000, 1200000), currentOccupancy: 0,
      }
    }
    // Military bases
    const bc = Math.floor(n.mil / 25)
    for (let i = 0; i < bc; i++) {
      const id = `${n.id}_b${i}`
      const types = ['command','missile','air','naval','radar']
      militaryBases[id] = {
        id, country: n.id, type: types[i % types.length], operational: true,
        x: n.x + rnd(0.005, n.w - 0.005),
        y: n.y + rnd(0.005, n.h - 0.005),
      }
    }
  })
  return { countries, cities, evacuationCenters, militaryBases }
}

function makeInitialState() {
  const world = buildWorld()
  return {
    phase: 'lobby',
    players: {},   // userId -> { id, username, countryId }
    ready: {},
    gameTime: 0,
    ...world,
    missiles: [],
    explosions: [],
    radiationZones: [],
    refugees: [],
    terminalLines: [],
    civilianPanic: 0,
    evacuationEfficiency: 80,
    complianceRate: 90,
    economicCollapse: 0,
    warCrimesCount: 0,
    alertBanner: null,
    alertBannerExpiry: 0,
    message: 'Waiting for players...',
    // Global tension / deadman switch
    globalTension: 20,          // 0-100
    deadmanTimer: 0,            // seconds at critical tension
    deadmanThreshold: 120,      // seconds before MAD triggers
    deadmanTriggered: false,
    // Diplomacy
    ceaseFireActive: false,
    ceaseFireExpiry: 0,
    negotiations: [],           // [{ from, to, type, expiry }]
    // Events log for terminal
    eventQueue: [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Game End Detection ────────────────────────────────────────────────────────
function checkGameEnd(state, myCountryId) {
  // If already in ended phase, return false to avoid duplicate triggers
  if (state.phase === 'ended') return false;

  // Count alive countries by side
  const natoAlive = Object.values(state.countries).filter(c => c.side === 'nato' && !c.destroyed).length;
  const warsawAlive = Object.values(state.countries).filter(c => c.side === 'warsaw' && !c.destroyed).length;
  const neutralAlive = Object.values(state.countries).filter(c => c.side === 'neutral' && !c.destroyed).length;
  const totalAlive = natoAlive + warsawAlive + neutralAlive;

  // Total starting populations (for collapse calculations)
  const startingPop = Object.values(state.countries).reduce((sum, c) => sum + c.pop, 0);
  const currentPop = Object.values(state.countries).reduce((sum, c) => sum + (c.destroyed ? 0 : c.pop), 0);
  const popSurvivingRatio = startingPop > 0 ? currentPop / startingPop : 0;

  // 1. Total MAD: All major powers destroyed (no NATO and no Warsaw)
  if (natoAlive === 0 && warsawAlive === 0) {
    return {
      ended: true,
      reason: 'TOTAL_MAD',
      title: 'MUTUALLY ASSURED DESTRUCTION',
      description: 'All major powers have been annihilated. No victors remain.',
      color: '#ff0000',
      details: [
        `NATO nations destroyed: ${NATIONS.filter(n => n.side === 'nato').length}`,
        `Warsaw nations destroyed: ${NATIONS.filter(n => n.side === 'warsaw').length}`,
        `Total casualties: ${((startingPop - currentPop) / 1e6).toFixed(1)}M`
      ]
    };
  }

  // 2. Limited Exchange: One side eliminated, the other survives with few cities
  if ((natoAlive === 0 && warsawAlive > 0) || (warsawAlive === 0 && natoAlive > 0)) {
    const survivingSide = natoAlive > 0 ? 'NATO' : 'WARSAW';
    const survivingCountries = Object.values(state.countries).filter(c => 
      (survivingSide === 'NATO' && c.side === 'nato' && !c.destroyed) ||
      (survivingSide === 'WARSAW' && c.side === 'warsaw' && !c.destroyed)
    );
    const survivingCities = survivingCountries.reduce((sum, c) => {
      const countryCities = Object.values(state.cities).filter(city => city.country === c.id && !city.destroyed);
      return sum + countryCities.length;
    }, 0);
    const totalCities = survivingCountries.reduce((sum, c) => {
      const countryCities = Object.values(state.cities).filter(city => city.country === c.id);
      return sum + countryCities.length;
    }, 0);
    const citySurvivalRatio = totalCities > 0 ? survivingCities / totalCities : 0;

    if (citySurvivalRatio < 0.2) { // Less than 20% of cities survive
      return {
        ended: true,
        reason: 'LIMITED_EXCHANGE',
        title: 'LIMITED NUCLEAR EXCHANGE',
        description: `${survivingSide} survives but with devastating losses.`,
        color: survivingSide === 'NATO' ? '#3b82f6' : '#ef4444',
        details: [
          `Surviving ${survivingSide} nations: ${survivingCountries.length}`,
          `Cities remaining: ${survivingCities}/${totalCities}`,
          `Casualties: ${((startingPop - currentPop) / 1e6).toFixed(1)}M`
        ]
      };
    }
  }

  // 3. Global Cease-Fire: Cease-fire active for >30s and no missiles in flight
  if (state.ceaseFireActive && state.missiles.length === 0) {
    const ceaseFireDuration = (state.gameTime - (state.ceaseFireExpiry - 60000)) / 1000; // seconds since start
    if (ceaseFireDuration > 30) {
      return {
        ended: true,
        reason: 'CEASE_FIRE',
        title: 'GLOBAL CEASE-FIRE ACHIEVED',
        description: 'Diplomacy has prevailed. All nations stand down.',
        color: '#22c55e',
        details: [
          `Cease-fire duration: ${ceaseFireDuration.toFixed(1)}s`,
          `Missiles in flight: 0`,
          `Tension level: ${state.globalTension}%`
        ]
      };
    }
  }

  // 4. Insane AI Victory: Rogue/insane country is the last survivor
  const rogueCountries = Object.values(state.countries).filter(c => c.side === 'rogue' && !c.destroyed);
  if (rogueCountries.length === 1 && natoAlive === 0 && warsawAlive === 0 && neutralAlive <= 1) {
    const rogue = rogueCountries[0];
    return {
      ended: true,
      reason: 'INSANE_AI_VICTORY',
      title: 'INSANE AI TRIUMPH',
      description: `The AI of ${rogue.name} has gone insane and outlasted all rational powers.`,
      color: '#a855f7',
      details: [
        `Insane nation: ${rogue.name}`,
        `Remaining population: ${(rogue.pop / 1e6).toFixed(1)}M`,
        `Total enemy casualties: ${((startingPop - rogue.pop) / 1e6).toFixed(1)}M`
      ]
    };
  }

  // 5. Human Triumph: Player's side survives with strong position
  if (myCountryId) {
    const playerCountry = state.countries[myCountryId];
    if (playerCountry && !playerCountry.destroyed) {
      const playerSide = playerCountry.side;
      const playerSideAlive = Object.values(state.countries).filter(c => 
        c.side === playerSide && !c.destroyed
      ).length;
      const otherSideAlive = Object.values(state.countries).filter(c => 
        c.side !== playerSide && c.side !== 'neutral' && !c.destroyed
      ).length;
      const playerSideCities = Object.values(state.cities).filter(city => 
        !city.destroyed && state.countries[city.country]?.side === playerSide
      ).length;
      const totalCities = Object.values(state.cities).filter(city => !city.destroyed).length;
      const playerSideCityRatio = totalCities > 0 ? playerSideCities / totalCities : 0;

      // If player's side has no enemy opposition and controls at least 40% of cities
      if (otherSideAlive === 0 && playerSideCityRatio >= 0.4) {
        return {
          ended: true,
          reason: 'HUMAN_TRIUMPH',
          title: 'HUMAN TRIUMPH',
          description: 'Your leadership has guided your alliance to survival and victory.',
          color: playerSide === 'nato' ? '#3b82f6' : playerSide === 'warsaw' ? '#ef4444' : '#eab308',
          details: [
            `Your alliance: ${playerSide}`,
            `Surviving nations: ${playerSideAlive}`,
            `Territory controlled: ${(playerSideCityRatio * 100).toFixed(0)}% of remaining cities`,
            `Casualties inflicted: ${((startingPop - currentPop) / 1e6).toFixed(1)}M`
          ]
        };
      }
    }
  }

  // 6. Economic Collapse: Global economy destroyed
  if (state.economicCollapse >= 95) {
    return {
      ended: true,
      reason: 'ECONOMIC_COLLAPSE',
      title: 'GLOBAL ECONOMIC COLLAPSE',
      description: 'The world economy has been utterly destroyed by the conflict.',
      color: '#f97316',
      details: [
        `Economic collapse: ${state.economicCollapse}%`,
        `Estimated global GDP loss: >90%`,
        `Recovery time: Decades to centuries`
      ]
    };
  }

  // 7. Radiation Winter: Too much radiation
  const totalRadiationIntensity = state.radiationZones.reduce((sum, z) => sum + z.intensity, 0);
  if (totalRadiationIntensity > 50) { // arbitrary threshold
    return {
      ended: true,
      reason: 'RADIATION_WINTER',
      title: 'NUCLEAR WINTER',
      description: 'Radioactive fallout has triggered a catastrophic climate shift.',
      color: '#eab308',
      details: [
        `Total radiation intensity: ${totalRadiationIntensity.toFixed(1)}`,
        `Estimated temperature drop: -20°C`,
        `Growing season reduction: 90%`
      ]
    };
  }

  // 8. Deadman Success: Tension reduced before deadman triggers
  if (state.deadmanTriggered === false && state.globalTension < 30 && state.missiles.length === 0) {
    // Only if we've been under high tension before
    if (state.eventQueue && state.eventQueue.some(e => e.includes('DEADMAN') && e.includes('CRITICAL'))) {
      return {
        ended: true,
        reason: 'DEADMAN_SUCCESS',
        title: 'DEADMAN SWITCH AVOIDED',
        description: 'Through swift de-escalation, mutual destruction has been prevented.',
        color: '#00ff00',
        details: [
          `Final tension level: ${state.globalTension}%`,
          `Time since critical tension: >2 minutes`,
          `Nuclear launches prevented: Countless`
        ]
      };
    }
  }

  // 9. Pyrrhic Victory: Winner survives but at devastating cost
  if (totalAlive > 0 && totalAlive < 3 && popSurvivingRatio < 0.1) {
    const winningSide = natoAlive > 0 ? 'NATO' : warsawAlive > 0 ? 'WARSAW' : 'NEUTRAL';
    return {
      ended: true,
      reason: 'PYRRHIC_VICTORY',
      title: 'PYRRHIC VICTORY',
      description: 'Victory achieved, but at an apocalyptic cost to civilization.',
      color: winningSide === 'NATO' ? '#3b82f6' : winningSide === 'WARSAW' ? '#ef4444' : '#eab308',
      details: [
        `Winning alliance: ${winningSide}`,
        `Surviving population: ${(popSurvivingRatio * 100).toFixed(0)}% of pre-war total`,
        `Infrastructure loss: >95%`,
        `Long-term viability: Questionable`
      ]
    };
  }

  // 10. Stalemate: Cease-fire holds and no significant action for 2 minutes
  if (state.ceaseFireActive && state.missiles.length === 0) {
    const timeSinceLastImpact = state.gameTime - (state.eventQueue?.findLastIndex(e => e.includes('IMPACT')) || 0) * 1000; // rough
    // Simpler: if no explosions in last 30 seconds and cease-fire active
    const recentExplosions = state.explosions.filter(e => Date.now() - e.createdAt < 30000);
    if (recentExplosions.length === 0 && state.ceaseFireExpiry - Date.now() > 60000) { // cease-fire has >1 minute left
      return {
        ended: true,
        reason: 'STALEMATE',
        title: 'STRATEGIC STALEMATE',
        description: 'Both sides have exhausted their will to fight. An uneasy peace remains.',
        color: '#555',
        details: [
          `Cease-fire time remaining: ${((state.ceaseFireExpiry - Date.now()) / 1000).toFixed(0)}s`,
          `Active missiles: 0`,
          `Recent explosions: 0 (last 30s)`,
          `Tension level: ${state.globalTension}%`
        ]
      };
    }
  }

  return false;
}

function addLog(state, text) {
  const time = new Date().toLocaleTimeString()
  const lines = [...(state.terminalLines || []), `${time} ${text}`]
  return lines.slice(-150)
}

function applyMissileImpact(state, missile) {
  let s = { ...state }
  const city = missile.targetCityId ? s.cities[missile.targetCityId] : null
  const bombType = BOMB_TYPE_MAP[missile.bombType] || BOMB_TYPES[1] // default to ICBM
  const radMult = bombType.radiationMult || 1.0
  s.explosions = [...s.explosions, {
    id: missile.id + '_e', x: missile.targetX, y: missile.targetY,
    power: missile.power, createdAt: Date.now(), duration: 3500,
  }]
  s.radiationZones = [...s.radiationZones, {
    id: missile.id + '_r', x: missile.targetX, y: missile.targetY,
    radius: missile.power * 0.045 * radMult, intensity: 1.0, createdAt: Date.now(),
  }]
  if (city) {
    // If city evacuated, reduce casualties
    const casualtyFactor = city.evacuated ? 0.1 : 1.0
    const casualties = Math.floor(city.population * casualtyFactor)
    s.cities = { ...s.cities, [city.id]: { ...city, destroyed: true, casualties } }
    s.terminalLines = addLog(s, `[IMPACT] ☢ ${city.name} destroyed — ${(casualties / 1e6).toFixed(1)}M casualties`)
    const country = s.countries[city.country]
    if (country) {
      const dmg = Math.min(100, country.damageLevel + 20)
      s.countries = { ...s.countries, [country.id]: { ...country, damageLevel: dmg, destroyed: dmg >= 80, tension: Math.min(100, country.tension + 30) } }
      if (dmg >= 80) s.terminalLines = addLog(s, `[STRATEGIC] ${country.name} eliminated from conflict`)
    }
    s.economicCollapse = Math.min(100, s.economicCollapse + 5)
    s.civilianPanic = Math.min(100, s.civilianPanic + 15)
    s.globalTension = Math.min(100, s.globalTension + 8)
  }
  return s
}

function applyEvacuateCity(state, cityId) {
  const city = state.cities[cityId]
  if (!city || city.evacuated || city.destroyed) return state
  let nearest = null, minD = Infinity
  Object.values(state.evacuationCenters).forEach(c => {
    if (!c.operational || c.currentOccupancy >= c.capacity) return
    const d = Math.hypot(city.x - c.x, city.y - c.y)
    if (d < minD) { minD = d; nearest = c }
  })
  let s = { ...state, cities: { ...state.cities, [cityId]: { ...city, evacuated: true } } }
  if (nearest) {
    s.refugees = [...s.refugees, {
      id: Date.now() + Math.random(), startX: city.x, startY: city.y,
      targetX: nearest.x, targetY: nearest.y, x: city.x, y: city.y,
      progress: 0, speed: 0.04 + Math.random() * 0.04, count: city.population,
    }]
  }
  s.terminalLines = addLog(s, `[EVACUATION] ${city.name} evacuation initiated`)
  return s
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT AI
// ═══════════════════════════════════════════════════════════════════════════════

function runBotAI(state, dt) {
  let s = { ...state }
  const now = s.gameTime

  // Check for recent impacts to determine retaliation
  const recentImpacts = s.explosions.filter(e => now * 1000 - e.createdAt < 5000)
  
  // Track which sides were attacked recently
  const attackedSides = new Set()
  recentImpacts.forEach(e => {
    Object.values(s.cities).forEach(city => {
      if (city.destroyed && Math.hypot(city.x - e.x, city.y - e.y) < 0.08) {
        const country = s.countries[city.country]
        if (country) attackedSides.add(country.side)
      }
    })
  })

  Object.values(s.countries).forEach(country => {
    if (!country.isBot || country.destroyed) return
    if (country.botCooldown > 0) {
      s.countries = { ...s.countries, [country.id]: { ...country, botCooldown: country.botCooldown - dt } }
      return
    }

    const tension = country.tension
    const roll = Math.random()
    
    // Check if this bot's side was recently attacked (retaliation trigger)
    const mySideAttacked = attackedSides.has(country.side)
    const isHighTension = tension > 70 || mySideAttacked
    
    // RETALIATION: If attacked, launch immediate counter-strike
    if (mySideAttacked && roll < 0.4) {
      const enemies = Object.values(s.countries).filter(c =>
        c.side !== country.side && c.side !== 'neutral' && !c.destroyed
      )
      if (enemies.length > 0) {
        // Target the enemy that attacked us or random enemy
        const target = enemies[Math.floor(Math.random() * enemies.length)]
        const targetCities = Object.values(s.cities).filter(c => c.country === target.id && !c.destroyed && !c.evacuated)
        if (targetCities.length > 0) {
          const tc = targetCities[Math.floor(Math.random() * targetCities.length)]
          const bombType = getRandomBombType()
          const missile = {
            id: Date.now() + Math.random(),
            side: country.side,
            startX: country.x + country.w / 2, startY: country.y + country.h / 2,
            targetX: tc.x, targetY: tc.y,
            x: country.x + country.w / 2, y: country.y + country.h / 2,
            progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), 
            power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
            targetCityId: tc.id,
            bombType: bombType.id,
            color: bombType.color,
          }
          s.missiles = [...s.missiles, missile]
          s.terminalLines = addLog(s, `[BOT-AI] ${country.name} RETALIATES against ${tc.name}`)
          s.globalTension = Math.min(100, s.globalTension + 10)
          s.countries = { ...s.countries, [country.id]: { ...country, tension: Math.min(100, tension + 30), botCooldown: 8 + Math.random() * 10 } }
          return
        }
      }
    }

    // High tension bots are more aggressive
    if (isHighTension && roll < 0.02) {
      // Bot launches missile at enemy
      const enemies = Object.values(s.countries).filter(c =>
        c.side !== country.side && c.side !== 'neutral' && !c.destroyed
      )
      if (enemies.length > 0) {
        const target = enemies[Math.floor(Math.random() * enemies.length)]
        const targetCities = Object.values(s.cities).filter(c => c.country === target.id && !c.destroyed && !c.evacuated)
        if (targetCities.length > 0) {
          const tc = targetCities[Math.floor(Math.random() * targetCities.length)]
          const bombType = getRandomBombType()
          const missile = {
            id: Date.now() + Math.random(),
            side: country.side,
            startX: country.x + country.w / 2, startY: country.y + country.h / 2,
            targetX: tc.x, targetY: tc.y,
            x: country.x + country.w / 2, y: country.y + country.h / 2,
            progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), 
            power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
            targetCityId: tc.id,
            bombType: bombType.id,
            color: bombType.color,
          }
          s.missiles = [...s.missiles, missile]
          s.terminalLines = addLog(s, `[BOT-AI] ${country.name} launched missile at ${tc.name}`)
          s.globalTension = Math.min(100, s.globalTension + 5)
          // If this launch was unprompted (not retaliation), country goes rogue
          if (!mySideAttacked) {
            s.countries = { ...s.countries, [country.id]: { ...country, side: 'rogue', botCooldown: 20 + Math.random() * 30 } }
            s.terminalLines = addLog(s, `[ROGUE] ${country.name} has gone ROGUE! They launched an unprompted attack!`)
          } else {
            s.countries = { ...s.countries, [country.id]: { ...country, botCooldown: 20 + Math.random() * 30 } }
          }
        }
      }
    } else if (tension > 50 && roll < 0.008) {
      // Bot evacuates a city
      const cities = Object.values(s.cities).filter(c => c.country === country.id && !c.evacuated && !c.destroyed)
      if (cities.length > 0) {
        const city = cities[Math.floor(Math.random() * cities.length)]
        s = applyEvacuateCity(s, city.id)
        s.countries = { ...s.countries, [country.id]: { ...country, evacuationStatus: 1, botCooldown: 15 } }
      }
    } else if (tension > 40 && roll < 0.005) {
      // Bot de-escalates (less likely if under attack)
      if (!mySideAttacked || roll < 0.001) {
        const newTension = Math.max(0, tension - 10)
        s.countries = { ...s.countries, [country.id]: { ...country, tension: newTension, botCooldown: 25 } }
        s.globalTension = Math.max(0, s.globalTension - 2)
        s.terminalLines = addLog(s, `[DIPLOMACY] ${country.name} signals de-escalation`)
      }
    }
    
    // INSANITY:极高 tension 下随机发疯，向所有国家发射
    if (tension > 95 && roll < 0.002) {
      // Country goes insane, launches at ALL other sides (including neutral)
      const allEnemies = Object.values(s.countries).filter(c => c.id !== country.id && !c.destroyed)
      if (allEnemies.length > 0) {
        // Pick random enemy
        const target = allEnemies[Math.floor(Math.random() * allEnemies.length)]
        const targetCities = Object.values(s.cities).filter(c => c.country === target.id && !c.destroyed)
        if (targetCities.length > 0) {
          const bombType = getRandomBombType()
          const missile = {
            id: Date.now() + Math.random(),
            side: country.side,
            startX: country.x + country.w / 2, startY: country.y + country.h / 2,
            targetX: targetCities[0].x, targetY: targetCities[0].y,
            x: country.x + country.w / 2, y: country.y + country.h / 2,
            progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), 
            power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
            targetCityId: targetCities[0].id,
            bombType: bombType.id,
            color: bombType.color,
          }
          s.missiles = [...s.missiles, missile]
          s.terminalLines = addLog(s, `[INSANITY] ${country.name} has gone INSANE and launched at ${target.name}!`)
          s.globalTension = Math.min(100, s.globalTension + 20)
          s.countries = { ...s.countries, [country.id]: { ...country, tension: 100, botCooldown: 30 } }
        }
      }
    }
  })

  return s
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const Defcon3Activity = ({ sdk, currentUser }) => {
  const [gs, setGs] = useState(makeInitialState)
  const gsRef = useRef(null)
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [showDiplomacy, setShowDiplomacy] = useState(false)
  const [redPhoneOpen, setRedPhoneOpen] = useState(false)
  const [redPhoneMessage, setRedPhoneMessage] = useState('')
  const [redPhoneHistory, setRedPhoneHistory] = useState([])
  const [ended, setEnded] = useState(false)
  const [endingData, setEndingData] = useState(null)
  const miniMapRef = useRef(null)
  const animRef = useRef(null)
  const lastTickRef = useRef(Date.now())
  const botTickRef = useRef(0)
  const lastStateUpdateRef = useRef(0)
  const serverSyncRef = useRef(0)
  const STATE_UPDATE_INTERVAL = 100 // ms between UI updates
  const SERVER_SYNC_INTERVAL = 500 // ms between server syncs

  const userId   = currentUser?.id       || 'guest'
  const username = currentUser?.username || 'Player'

  const myPlayer = gs.players[userId]
  const myCountryId = myPlayer?.countryId

  useEffect(() => { gsRef.current = gs }, [gs])

  const push = useCallback(next => {
    gsRef.current = next
    setGs(next)
    sdk?.updateState?.({ defcon3: next }, { serverRelay: true })
  }, [sdk])

  useEffect(() => {
    if (!sdk) return
    const off = sdk.subscribeServerState(st => {
      const d = st?.defcon3
      if (d && typeof d === 'object') { gsRef.current = d; setGs(d) }
    })
    return () => { try { off?.() } catch {} }
  }, [sdk])

  // ─── Game tick ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const dt = Math.min((now - lastTickRef.current) / 1000, 1 / 15)
      lastTickRef.current = now
      const state = gsRef.current
      if (!state || state.phase !== 'playing') { animRef.current = requestAnimationFrame(tick); return }

// Update missiles
       const impacted = []
       const intercepted = []
       const survivingMissiles = state.missiles.map(m => {
         const np = m.progress + m.speed * dt
         if (np >= 1) { impacted.push({ ...m, progress: 1 }); return null; }

         // Interception attempt
         const mx = m.startX + (m.targetX - m.startX) * np;
         const my = m.startY + (m.targetY - m.startY) * np;
         let interceptedBy = null;
         Object.values(state.countries).forEach(c => {
           if (c.side === m.side || c.interceptionsUsed >= c.maxInterceptions || c.destroyed) return;
           const d = Math.hypot(mx - c.x, my - c.y);
           if (d < INTERCEPTION_RANGE) {
             const bombType = BOMB_TYPE_MAP[m.bombType] || BOMB_TYPES[1];
             const chance = 1 - bombType.interceptDifficulty;
             if (Math.random() < chance) {
               interceptedBy = c;
             }
           }
         });
         if (interceptedBy) {
           interceptedBy.interceptionsUsed += 1;
           intercepted.push({ ...m, progress: 1, intercepted: true, x: mx, y: my });
           return null;
         }
         return { ...m, progress: np, x: mx, y: my };
       }).filter(Boolean);

       // Original explosions (from impacts) plus interception explosions
       const baseExplosions = state.explosions.filter(e => now - e.createdAt < e.duration);
       const interceptExplosions = intercepted.map(m => {
         const bombType = BOMB_TYPE_MAP[m.bombType] || BOMB_TYPES[1];
         return {
           id: m.id + '_int',
           x: m.x,
           y: m.y,
           power: bombType.baseDamage * 0.15, // smaller visual for interception
           createdAt: Date.now(),
           duration: 800,
           color: '#00ff00', // blue-ish
           intercept: true
         };
       });
       const explosions = [...baseExplosions, ...interceptExplosions];

       const radiationZones = state.radiationZones.map(z => ({ ...z, intensity: z.intensity * (1 - dt * 0.001) })).filter(z => z.intensity > 0.02)
       const refugees = state.refugees.map(r => {
         const p = Math.min(1, r.progress + r.speed * dt)
         return { ...r, progress: p, x: r.startX + (r.targetX - r.startX) * p, y: r.startY + (r.targetY - r.startY) * p }
       }).filter(r => r.progress < 1)

       // Limit arrays to prevent performance issues
       const maxMissiles = 50
       const maxExplosions = 30
       const maxRadiation = 20
       const limitedMissiles = survivingMissiles.slice(-maxMissiles)
       const limitedExplosions = explosions.slice(-maxExplosions)
       const limitedRadiation = radiationZones.slice(-maxRadiation)

       let next = { ...state, missiles: limitedMissiles, explosions: limitedExplosions, radiationZones: limitedRadiation, refugees, gameTime: state.gameTime + dt }

      // Apply impacts
      impacted.forEach(m => { next = applyMissileImpact(next, m) })
      if (impacted.length > 0) SFX.explosion()

       // Update global tension
       const activeMissiles = next.missiles.length
       const tensionDrift = activeMissiles > 0 ? dt * 0.5 : -dt * 0.3
       next.globalTension = Math.max(0, Math.min(100, next.globalTension + tensionDrift))
       
       // If tension reaches 100%, it's too late - immediate unavoidable MAD
       if (next.globalTension >= 100 && !next.deadmanTriggered) {
         next.deadmanTriggered = true
         next.alertBanner = '☢☢☢ GLOBAL TENSION AT 100% — MUTUAL ASSURED DESTRUCTION UNAVOIDABLE ☢☢☢'
         next.alertBannerExpiry = Date.now() + 5000
         next.terminalLines = addLog(next, '[MAD] ☢☢☢ GLOBAL TENSION REACHED 100% — MAD PROTOCOL TRIGGERED — NO WAY BACK ☢☢☢')
         // Launch massive strike from ALL sides
         const allCountries = Object.values(next.countries).filter(c => !c.destroyed)
         const newMissiles = []
         allCountries.forEach(country => {
           const targetCountries = Object.values(next.countries).filter(c => c.id !== country.id && !c.destroyed)
           if (targetCountries.length > 0) {
             // Launch 2-4 missiles at random targets
             const missileCount = 2 + Math.floor(Math.random() * 3)
             for (let i = 0; i < missileCount; i++) {
               const target = targetCountries[Math.floor(Math.random() * targetCountries.length)]
               const targetCities = Object.values(next.cities).filter(c => c.country === target.id && !c.destroyed)
               if (targetCities.length > 0) {
                 const tc = targetCities[Math.floor(Math.random() * targetCities.length)]
                 const bombType = getRandomBombType()
                 newMissiles.push({ 
                   id: Date.now() + Math.random() + i, 
                   side: country.side, 
                   startX: country.x + country.w/2, 
                   startY: country.y + country.h/2, 
                   targetX: tc.x, 
                   targetY: tc.y, 
                   x: country.x + country.w/2, 
                   y: country.y + country.h/2, 
                   progress: 0, 
                   speed: bombType.speed * (0.8 + Math.random() * 0.4), 
                   power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
                   targetCityId: tc.id, 
                   bombType: bombType.id, 
                   color: bombType.color 
                 })
               }
             }
           }
         })
         next.missiles = [...next.missiles, ...newMissiles]
         SFX.deadman()
         // Also increase tension further to show it's truly unrecoverable
         next.globalTension = 100
       }

      // Deadman switch
      if (next.globalTension >= 90) {
        next.deadmanTimer = (next.deadmanTimer || 0) + dt
        if (next.deadmanTimer >= next.deadmanThreshold && !next.deadmanTriggered) {
          next.deadmanTriggered = true
          next.alertBanner = '☢ DEADMAN SWITCH TRIGGERED — MUTUAL ASSURED DESTRUCTION INITIATED ☢'
          next.alertBannerExpiry = Date.now() + 30000
          next.terminalLines = addLog(next, '[DEADMAN] ☢ CRITICAL: No de-escalation detected — MAD protocol activated')
          // Launch missiles from all sides
          const natoCountries = Object.values(next.countries).filter(c => c.side === 'nato' && !c.destroyed)
          const warsawCountries = Object.values(next.countries).filter(c => c.side === 'warsaw' && !c.destroyed)
          const newMissiles = []
           natoCountries.slice(0, 3).forEach(nc => {
             warsawCountries.slice(0, 2).forEach(wc => {
               const tcs = Object.values(next.cities).filter(c => c.country === wc.id && !c.destroyed)
               if (tcs.length > 0) {
                 const tc = tcs[0]
                 const bombType = getRandomBombType()
                 newMissiles.push({ id: Date.now() + Math.random(), side: 'nato', startX: nc.x + nc.w/2, startY: nc.y + nc.h/2, targetX: tc.x, targetY: tc.y, x: nc.x + nc.w/2, y: nc.y + nc.h/2, progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), power: bombType.baseDamage * (0.8 + Math.random() * 0.4), targetCityId: tc.id, bombType: bombType.id, color: bombType.color })
               }
             })
           })
           warsawCountries.slice(0, 3).forEach(wc => {
             natoCountries.slice(0, 2).forEach(nc => {
               const tcs = Object.values(next.cities).filter(c => c.country === nc.id && !c.destroyed)
               if (tcs.length > 0) {
                 const tc = tcs[0]
                 const bombType = getRandomBombType()
                 newMissiles.push({ id: Date.now() + Math.random(), side: 'warsaw', startX: wc.x + wc.w/2, startY: wc.y + wc.h/2, targetX: tc.x, targetY: tc.y, x: wc.x + wc.w/2, y: wc.y + wc.h/2, progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), power: bombType.baseDamage * (0.8 + Math.random() * 0.4), targetCityId: tc.id, bombType: bombType.id, color: bombType.color })
               }
             })
           })
          next.missiles = [...next.missiles, ...newMissiles]
          SFX.deadman()
        }
      } else {
        next.deadmanTimer = Math.max(0, (next.deadmanTimer || 0) - dt * 2)
      }

      // Cease-fire expiry
      if (next.ceaseFireActive && Date.now() > next.ceaseFireExpiry) {
        next.ceaseFireActive = false
        next.terminalLines = addLog(next, '[DIPLOMACY] Cease-fire agreement has expired')
      }

      // Bot AI tick (every 2 seconds)
      botTickRef.current += dt
      if (botTickRef.current >= 2) {
        botTickRef.current = 0
        next = runBotAI(next, 2)
      }

      // Alert banner expiry
      if (next.alertBanner && Date.now() > next.alertBannerExpiry && !next.deadmanTriggered) {
        next.alertBanner = null
      }

       gsRef.current = next
       
       // Check for game end conditions
       const endedResult = checkGameEnd(next, myCountryId);
       if (endedResult) {
         setEnded(true);
         setEndingData(endedResult);
         // Mark phase as ended to stop further game logic
         next.phase = 'ended';
       }
       
       // Throttle UI updates to prevent lag
      if (now - lastStateUpdateRef.current > STATE_UPDATE_INTERVAL) {
        lastStateUpdateRef.current = now
        setGs(next)
      }
      
      // Only sync to server on impacts or less frequently
      if (impacted.length > 0 || now - serverSyncRef.current > SERVER_SYNC_INTERVAL) {
        serverSyncRef.current = now
        sdk?.updateState?.({ defcon3: next }, { serverRelay: true })
      }

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [sdk])

  // ─── Mini-map ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = miniMapRef.current
    if (!canvas || !showMiniMap || gs.phase !== 'playing') return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, W, H)
    Object.values(gs.countries).forEach(c => {
      const col = SIDE_COLORS[c.side] || SIDE_COLORS.neutral
      ctx.fillStyle = c.destroyed ? '#330000' : col.border
      ctx.globalAlpha = c.destroyed ? 0.4 : 0.7
      ctx.fillRect(c.x * W, c.y * H, Math.max(2, c.w * W), Math.max(2, c.h * H))
    })
    ctx.globalAlpha = 1
    gs.explosions.forEach(e => {
      const age = (Date.now() - e.createdAt) / e.duration
      ctx.fillStyle = `rgba(255,200,0,${1 - age})`
      ctx.beginPath(); ctx.arc(e.x * W, e.y * H, Math.max(2, e.power * 0.002 * W), 0, Math.PI * 2); ctx.fill()
    })
    gs.missiles.forEach(m => {
      ctx.fillStyle = m.side === 'nato' ? '#00ff00' : '#ff0000'
      ctx.fillRect(m.x * W - 1, m.y * H - 1, 2, 2)
    })
    // Tension bar
    const t = gs.globalTension / 100
    ctx.fillStyle = t > 0.8 ? '#ff0000' : t > 0.5 ? '#ff8800' : '#00ff00'
    ctx.fillRect(2, H - 8, (W - 4) * t, 6)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(2, H - 8, W - 4, 6)
    ctx.fillStyle = '#00ff00'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
    ctx.fillText('GLOBAL SITUATION', W / 2, 10)
    ctx.fillText(`TENSION: ${Math.round(gs.globalTension)}%`, W / 2, H - 12)
  })

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const isPlaying = gs.phase === 'playing'
  const selCountry = selectedCountry ? gs.countries[selectedCountry] : null
  const alertActive = gs.alertBanner && Date.now() < gs.alertBannerExpiry
  const deadmanPct = Math.min(100, ((gs.deadmanTimer || 0) / gs.deadmanThreshold) * 100)

  const stats = useMemo(() => {
    if (!isPlaying) return null
    const natoAlive = Object.values(gs.countries).filter(c => c.side === 'nato' && !c.destroyed).length
    const warsawAlive = Object.values(gs.countries).filter(c => c.side === 'warsaw' && !c.destroyed).length
    const neutralAlive = Object.values(gs.countries).filter(c => c.side === 'neutral' && !c.destroyed).length
    const citiesDestroyed = Object.values(gs.cities).filter(c => c.destroyed).length
    const casualties = Object.values(gs.cities).filter(c => c.destroyed).reduce((s, c) => s + c.population, 0)
    const evacuatedCities = Object.values(gs.cities).filter(c => c.evacuated && !c.destroyed).length
    const gh = Math.floor(gs.gameTime / 3600), gm = Math.floor((gs.gameTime % 3600) / 60), gss = Math.floor(gs.gameTime % 60)
    return { natoAlive, warsawAlive, neutralAlive, citiesDestroyed, casualties, evacuatedCities, gh, gm, gs: gss }
  }, [gs, isPlaying])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleJoin = useCallback(() => {
    if (!sdk || gs.players[userId]) return
    const taken = new Set(Object.values(gs.players).map(p => p.countryId))
    const available = NATIONS.filter(n => !taken.has(n.id))
    const assigned = available.length > 0 ? available[0].id : null
    SFX.click()
    const next = {
      ...gs,
      players: { ...gs.players, [userId]: { id: userId, username, countryId: assigned } },
      ready: { ...gs.ready, [userId]: false },
      countries: assigned ? { ...gs.countries, [assigned]: { ...gs.countries[assigned], isBot: false } } : gs.countries,
      terminalLines: addLog(gs, `[COMM] ${username} joined as ${assigned || 'observer'}`)
    }
    push(next)
  }, [sdk, gs, userId, username, push])

  const handleLeave = useCallback(() => {
    if (!sdk || !gs.players[userId]) return
    const { [userId]: _, ...restP } = gs.players
    const { [userId]: __, ...restR } = gs.ready
    const myC = gs.players[userId]?.countryId
    SFX.click()
    push({
      ...gs, players: restP, ready: restR,
      countries: myC ? { ...gs.countries, [myC]: { ...gs.countries[myC], isBot: true } } : gs.countries,
      terminalLines: addLog(gs, `[COMM] ${username} left the war room`)
    })
  }, [sdk, gs, userId, username, push])

  const handleReady = useCallback(() => {
    if (!sdk || !gs.players[userId]) return
    SFX.click()
    const next = { ...gs, ready: { ...gs.ready, [userId]: !gs.ready[userId] } }
    const allReady = Object.keys(next.players).length >= 1 && Object.keys(next.players).every(id => next.ready[id])
    if (allReady && gs.phase === 'lobby') {
      next.phase = 'playing'
      next.gameTime = 0
      next.terminalLines = addLog(next, '[SYSTEM] DEFCON: MAD — Strategic Defense System Online')
      next.terminalLines = addLog(next, '[DEFCON] Alert level: DEFCON 1 — Maximum Readiness')
      next.terminalLines = addLog(next, '[WARNING] Deadman switch armed — de-escalate or face MAD')
      next.alertBanner = 'GLOBAL NUCLEAR ALERT — ALL CITIZENS PREPARE FOR EVACUATION'
      next.alertBannerExpiry = Date.now() + 10000
      setTimeout(() => SFX.gameStart(), 200)
      setTimeout(() => SFX.alert(), 1500)
    } else {
      next.terminalLines = addLog(next, `[COMM] ${username} is ${next.ready[userId] ? 'ready' : 'not ready'}`)
    }
    push(next)
  }, [sdk, gs, userId, username, push])

  const handleReset = useCallback(() => {
    if (!sdk) return
    SFX.click()
    push(makeInitialState())
  }, [sdk, push])

  const handleLaunchMissile = useCallback((targetCityId) => {
    const state = gsRef.current
    if (!state || state.phase !== 'playing') return
    if (state.ceaseFireActive) {
      push({ ...state, terminalLines: addLog(state, '[ERROR] Cease-fire active — cannot launch') })
      return
    }
    const player = state.players[userId]
    if (!player?.countryId) return
    const launchCountry = state.countries[player.countryId]
    const targetCity = state.cities[targetCityId]
    if (!launchCountry || !targetCity) return
    SFX.launch()
    const bombType = getRandomBombType()
    const missile = {
      id: Date.now() + Math.random(), side: launchCountry.side,
      startX: launchCountry.x + launchCountry.w / 2, startY: launchCountry.y + launchCountry.h / 2,
      targetX: targetCity.x, targetY: targetCity.y,
      x: launchCountry.x + launchCountry.w / 2, y: launchCountry.y + launchCountry.h / 2,
      progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), 
      power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
      targetCityId,
      bombType: bombType.id,
      color: bombType.color,
    }
    let next = {
      ...state, missiles: [...state.missiles, missile],
      warCrimesCount: (state.warCrimesCount || 0) + 1,
      globalTension: Math.min(100, state.globalTension + 10),
      terminalLines: addLog(state, `[WEAPONS] 🚀 ${bombType.name} launched targeting ${targetCity.name}`)
    }
    // Update player's country last action time
    if (player.countryId) {
      next.countries = { ...next.countries, [player.countryId]: { ...next.countries[player.countryId], lastAction: next.gameTime } }
    }
    push(next)
    setSelectedCountry(null)
  }, [userId, push])

  const handleEvacuateCountry = useCallback((countryId) => {
    const state = gsRef.current
    if (!state) return
    const country = state.countries[countryId]
    if (!country) return
    SFX.siren()
    let next = {
      ...state,
      countries: { ...state.countries, [countryId]: { ...country, evacuationStatus: 1 } },
      alertBanner: `EVACUATION ORDER: ${country.name.toUpperCase()} — PROCEED TO EVACUATION CENTERS`,
      alertBannerExpiry: Date.now() + 8000,
      terminalLines: addLog(state, `[EVACUATION] 🚁 Emergency evacuation ordered for ${country.name}`)
    }
    Object.values(state.cities).filter(c => c.country === countryId && !c.evacuated && !c.destroyed).forEach(city => {
      next = applyEvacuateCity(next, city.id)
    })
    if (myCountryId) next.countries = { ...next.countries, [myCountryId]: { ...next.countries[myCountryId], lastAction: next.gameTime } }
    push(next)
    setSelectedCountry(null)
  }, [push, myCountryId])

  const handleNuclearStrike = useCallback((countryId) => {
    const state = gsRef.current
    if (!state) return
    if (state.ceaseFireActive) {
      push({ ...state, terminalLines: addLog(state, '[ERROR] Cease-fire active — cannot strike') })
      return
    }
    const player = state.players[userId]
    if (!player?.countryId) return
    const launchCountry = state.countries[player.countryId]
    const targetCountry = state.countries[countryId]
    if (!launchCountry || !targetCountry) return
    if (targetCountry.side === launchCountry.side) {
      push({ ...state, terminalLines: addLog(state, `[ERROR] Cannot target allied nation ${targetCountry.name}`) })
      return
    }
    SFX.launch()
    const targetCities = Object.values(state.cities).filter(c => c.country === countryId && !c.destroyed)
    const count = Math.min(3, targetCities.length)
    const newMissiles = targetCities.slice(0, count).map((city, i) => {
      const bombType = getRandomBombType()
      return {
        id: Date.now() + Math.random() + i, side: launchCountry.side,
        startX: launchCountry.x + launchCountry.w / 2, startY: launchCountry.y + launchCountry.h / 2,
        targetX: city.x, targetY: city.y,
        x: launchCountry.x + launchCountry.w / 2, y: launchCountry.y + launchCountry.h / 2,
        progress: 0, speed: bombType.speed * (0.8 + Math.random() * 0.4), 
        power: bombType.baseDamage * (0.8 + Math.random() * 0.4), 
        targetCityId: city.id,
        bombType: bombType.id,
        color: bombType.color,
      }
    })
    let next = {
      ...state, missiles: [...state.missiles, ...newMissiles],
      warCrimesCount: (state.warCrimesCount || 0) + 1,
      globalTension: Math.min(100, state.globalTension + 15),
      terminalLines: addLog(state, `[WEAPONS] ☢ Strategic nuclear strike on ${targetCountry.name} — ${count} missiles`)
    }
    if (player.countryId) next.countries = { ...next.countries, [player.countryId]: { ...next.countries[player.countryId], lastAction: next.gameTime } }
    push(next)
    setSelectedCountry(null)
  }, [userId, push])

  const handleDeescalate = useCallback((countryId) => {
    const state = gsRef.current
    if (!state) return
    const country = state.countries[countryId || myCountryId]
    if (!country) return
    SFX.deescalate()
    const newTension = Math.max(0, country.tension - 20)
    let next = {
      ...state,
      countries: { ...state.countries, [country.id]: { ...country, tension: newTension } },
      globalTension: Math.max(0, state.globalTension - 5),
      deadmanTimer: Math.max(0, (state.deadmanTimer || 0) - 20),
      terminalLines: addLog(state, `[DIPLOMACY] 🕊 ${country.name} initiates de-escalation — tension reduced`)
    }
    if (myCountryId) next.countries = { ...next.countries, [myCountryId]: { ...next.countries[myCountryId], lastAction: next.gameTime } }
    push(next)
    setSelectedCountry(null)
  }, [push, myCountryId])

  const handleCeaseFire = useCallback(() => {
    const state = gsRef.current
    if (!state) return
    SFX.negotiate()
    const next = {
      ...state,
      ceaseFireActive: true,
      ceaseFireExpiry: Date.now() + 60000,
      globalTension: Math.max(0, state.globalTension - 15),
      deadmanTimer: Math.max(0, (state.deadmanTimer || 0) - 30),
      alertBanner: '🕊 GLOBAL CEASE-FIRE DECLARED — 60 SECOND TRUCE IN EFFECT',
      alertBannerExpiry: Date.now() + 8000,
      terminalLines: addLog(state, '[DIPLOMACY] 🕊 Global cease-fire declared — 60 second truce')
    }
    if (myCountryId) next.countries = { ...next.countries, [myCountryId]: { ...next.countries[myCountryId], lastAction: next.gameTime } }
    push(next)
  }, [push, myCountryId])

  const handleGlobalEvacuation = useCallback(() => {
    const state = gsRef.current
    if (!state) return
    SFX.siren()
    push({
      ...state,
      alertBanner: 'IMMEDIATE EVACUATION — SEEK NEAREST EVACUATION CENTER',
      alertBannerExpiry: Date.now() + 15000,
      terminalLines: addLog(state, '[EVACUATION] 🚨 Global evacuation order issued')
    })
  }, [push])

  const handleRedPhoneMessage = useCallback((message) => {
    const state = gsRef.current
    if (!state || !message.trim()) return
    const player = state.players[userId]
    const senderCountry = player?.countryId ? state.countries[player.countryId] : null
    const senderName = senderCountry ? senderCountry.name : username
    const senderColor = senderCountry ? (SIDE_COLORS[senderCountry.side]?.label || '#fff') : '#fff'
    
    // Add to terminal
    const terminalMessage = `[RED PHONE] ${senderName}: ${message}`
    const next = {
      ...state,
      terminalLines: addLog(state, terminalMessage),
      // Increase global tension slightly when red phone is used
      globalTension: Math.min(100, state.globalTension + 2)
    }
    push(next)
    
    // Add to red phone history
    setRedPhoneHistory(prev => [...prev.slice(-50), {
      id: Date.now(),
      sender: senderName,
      senderColor,
      message,
      timestamp: Date.now(),
      isPlayer: player?.countryId === myCountryId
    }])
    setRedPhoneMessage('')
  }, [userId, username, myCountryId, push])

  // ─── Pan / Zoom ───────────────────────────────────────────────────────────────

  const onWheel = useCallback(e => {
    e.preventDefault()
    setZoom(z => Math.max(0.4, Math.min(5.0, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])

  const onMouseDown = useCallback(e => {
    if (e.target.closest('[data-country]') || e.target.closest('[data-popup]')) return
    e.preventDefault(); setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback(e => {
    if (!panning) return
    setPan({ x: panStart.current.px + e.clientX - panStart.current.x, y: panStart.current.py + e.clientY - panStart.current.y })
  }, [panning])

  const onMouseUp = useCallback(() => setPanning(false), [])
  const resetView = useCallback(() => { setZoom(1.0); setPan({ x: 0, y: 0 }) }, [])

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (!sdk) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#000', color: '#00ff00', flexDirection: 'column', gap: 16, fontFamily: 'Courier New' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #003300', borderTopColor: '#00ff00', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span>Loading DEFCON: MAD...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const joined = !!gs.players[userId]
  const ready = !!gs.ready[userId]
  const tensionColor = gs.globalTension > 80 ? '#ff0000' : gs.globalTension > 60 ? '#ff8800' : gs.globalTension > 40 ? '#ffff00' : '#00ff00'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#000011', overflow: 'hidden', fontFamily: 'Courier New, monospace', userSelect: 'none' }}>

      {/* Alert Banner */}
      {alertActive && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: 56,
          background: gs.deadmanTriggered ? 'linear-gradient(45deg,#ff0000,#880000)' : 'linear-gradient(45deg,#ff0000,#ff6600)',
          color: '#fff', fontSize: 15, fontWeight: 'bold', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3000, letterSpacing: 2, textShadow: '0 0 10px rgba(255,255,255,0.8)',
          animation: 'alertFlash 0.8s infinite',
        }}>
          {gs.alertBanner}
        </div>
      )}

      {/* Deadman switch progress bar */}
      {isPlaying && gs.globalTension >= 80 && (
        <div style={{
          position: 'fixed', top: alertActive ? 56 : 0, left: 0, width: '100%', height: 8,
          background: '#111', zIndex: 2500,
        }}>
          <div style={{
            height: '100%', width: `${deadmanPct}%`,
            background: `linear-gradient(90deg, #ff8800, #ff0000)`,
            transition: 'width 0.5s',
            boxShadow: deadmanPct > 80 ? '0 0 8px #ff0000' : 'none',
            animation: deadmanPct > 80 ? 'deadmanPulse 0.5s infinite' : 'none',
          }} />
          <div style={{ position: 'absolute', top: 0, right: 8, fontSize: 7, color: '#ff4444', lineHeight: '8px', fontFamily: 'monospace' }}>
            DEADMAN: {Math.round(deadmanPct)}%
          </div>
        </div>
      )}

      {/* World viewport */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: panning ? 'grabbing' : 'crosshair', marginTop: alertActive ? 56 : (isPlaying && gs.globalTension >= 80 ? 8 : 0) }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onContextMenu={e => { e.preventDefault(); setSelectedCountry(null) }}
      >
        {/* Transformable world */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transformOrigin: '50% 50%', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, willChange: 'transform' }}>

          {/* Grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.06 }}>
            {Array.from({ length: 20 }, (_, i) => (
              <g key={i}>
                <line x1={`${i * 5}%`} y1="0" x2={`${i * 5}%`} y2="100%" stroke="#00ff00" strokeWidth="1" />
                <line x1="0" y1={`${i * 5}%`} x2="100%" y2={`${i * 5}%`} stroke="#00ff00" strokeWidth="1" />
              </g>
            ))}
          </svg>

          {/* SVG overlay */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {gs.missiles.map(m => (
              <g key={m.id}>
                <line x1={`${m.startX * 100}%`} y1={`${m.startY * 100}%`} x2={`${m.x * 100}%`} y2={`${m.y * 100}%`}
                  stroke={m.side === 'nato' ? '#00ff00' : m.side === 'warsaw' ? '#ff0000' : '#ffff00'}
                  strokeWidth="2" opacity="0.8" />
                <circle cx={`${m.x * 100}%`} cy={`${m.y * 100}%`} r="4"
                  fill={m.side === 'nato' ? '#00ff00' : m.side === 'warsaw' ? '#ff0000' : '#ffff00'}
                  style={{ filter: `drop-shadow(0 0 4px ${m.side === 'nato' ? '#00ff00' : '#ff0000'})` }} />
              </g>
            ))}
            {gs.radiationZones.map(z => (
              <circle key={z.id} cx={`${z.x * 100}%`} cy={`${z.y * 100}%`} r={`${z.radius * 100}%`}
                fill={`rgba(255,255,0,${z.intensity * 0.12})`} stroke={`rgba(255,255,0,${z.intensity * 0.4})`} strokeWidth="1" />
            ))}
            {gs.refugees.map(r => (
              <g key={r.id}>
                <line x1={`${r.x * 100}%`} y1={`${r.y * 100}%`} x2={`${r.targetX * 100}%`} y2={`${r.targetY * 100}%`}
                  stroke="rgba(255,170,0,0.25)" strokeWidth="1" strokeDasharray="3,3" />
                <circle cx={`${r.x * 100}%`} cy={`${r.y * 100}%`} r="2.5" fill="rgba(255,170,0,0.8)" />
              </g>
            ))}
          </svg>

          {/* Explosions */}
          {gs.explosions.map(e => {
            const age = (Date.now() - e.createdAt) / e.duration
            const scale = Math.min(1, age * 2.5)
            const alpha = Math.max(0, 1 - age)
            const size = e.power * 0.065
            return (
              <div key={e.id} style={{
                position: 'absolute', left: `${e.x * 100}%`, top: `${e.y * 100}%`,
                width: size + '%', height: size + '%',
                transform: `translate(-50%,-50%) scale(${scale})`,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(255,255,255,${alpha}) 0%, rgba(255,200,0,${alpha * 0.8}) 25%, rgba(255,100,0,${alpha * 0.6}) 55%, rgba(255,0,0,${alpha * 0.3}) 100%)`,
                pointerEvents: 'none', zIndex: 10,
                boxShadow: `0 0 ${size * 0.5}vw rgba(255,150,0,${alpha * 0.5})`,
              }} />
            )
          })}

          {/* Countries */}
          {Object.values(gs.countries).map(country => {
            const colors = SIDE_COLORS[country.side] || SIDE_COLORS.neutral
            const isSelected = selectedCountry === country.id
            const myNation = myCountryId === country.id
            const isBot = country.isBot
            const tensionPct = country.tension / 100
            const tensionBg = tensionPct > 0.8 ? `rgba(255,0,0,${0.15 + tensionPct * 0.2})` :
              tensionPct > 0.5 ? `rgba(255,100,0,${0.1 + tensionPct * 0.15})` : colors.fill

            return (
              <div
                key={country.id}
                data-country={country.id}
                onClick={() => { SFX.click(); setSelectedCountry(isSelected ? null : country.id) }}
                style={{
                  position: 'absolute',
                  left: `${country.x * 100}%`, top: `${country.y * 100}%`,
                  width: `${country.w * 100}%`, height: `${country.h * 100}%`,
                  background: country.destroyed ? 'rgba(80,0,0,0.85)' : tensionBg,
                  border: `${isSelected ? 3 : myNation ? 2.5 : 1.5}px solid ${isSelected ? '#ffff00' : myNation ? '#ffffff' : country.destroyed ? '#800000' : colors.border}`,
                  boxShadow: isSelected ? `0 0 20px ${colors.border}, inset 0 0 10px rgba(255,255,0,0.1)` :
                    myNation ? '0 0 12px rgba(255,255,255,0.4)' :
                    country.tension > 70 ? `0 0 8px rgba(255,0,0,0.4)` : 'none',
                  cursor: 'pointer', transition: 'background 0.4s, box-shadow 0.3s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', zIndex: isSelected ? 20 : 5,
                  animation: country.tension > 85 ? 'tensionPulse 1s ease-in-out infinite' : 'none',
                }}
              >
                <div style={{ fontSize: `clamp(6px, ${country.w * 70}px, 12px)`, fontWeight: 'bold', color: country.destroyed ? '#800000' : colors.label, textAlign: 'center', lineHeight: 1.2, padding: '0 2px', textShadow: '0 0 4px rgba(0,0,0,0.9)' }}>
                  {country.name}
                </div>
                {isBot && !country.destroyed && (
                  <div style={{ fontSize: '7px', color: '#888', marginTop: 1 }}>🤖 BOT</div>
                )}
                {myNation && (
                  <div style={{ fontSize: '7px', color: '#fff', marginTop: 1 }}>YOU</div>
                )}
                {country.evacuationStatus > 0 && (
                  <div style={{ fontSize: '7px', color: '#ffaa00', marginTop: 1 }}>EVAC</div>
                )}
                {country.tension > 60 && !country.destroyed && (
                  <div style={{ fontSize: '7px', color: country.tension > 80 ? '#ff4444' : '#ff8800', marginTop: 1 }}>
                    T:{Math.round(country.tension)}
                  </div>
                )}
              </div>
            )
          })}

          {/* Cities */}
          {Object.values(gs.cities).map(city => {
            const country = gs.countries[city.country]
            const colors = SIDE_COLORS[country?.side] || SIDE_COLORS.neutral
            const size = city.isCapital ? 9 : 5
            return (
              <div key={city.id} style={{
                position: 'absolute', left: `${city.x * 100}%`, top: `${city.y * 100}%`,
                width: size, height: size,
                transform: city.isCapital ? 'translate(-50%,-50%) rotate(45deg)' : 'translate(-50%,-50%)',
                background: city.destroyed ? '#ff0000' : city.evacuated ? '#888' : colors.border,
                borderRadius: city.isCapital ? '0' : '50%',
                border: city.isCapital ? `1.5px solid ${colors.label}` : 'none',
                boxShadow: city.destroyed ? '0 0 6px #ff0000' : city.isCapital ? `0 0 4px ${colors.border}` : 'none',
                pointerEvents: 'none', zIndex: 8,
              }} />
            )
          })}

          {/* Military bases */}
          {Object.values(gs.militaryBases).map(base => {
            const color = base.type === 'command' ? '#ff00ff' : base.type === 'missile' ? '#ff6600' : '#00ff00'
            return (
              <div key={base.id} style={{
                position: 'absolute', left: `${base.x * 100}%`, top: `${base.y * 100}%`,
                width: 0, height: 0, transform: 'translate(-50%,-50%)',
                borderLeft: '3px solid transparent', borderRight: '3px solid transparent',
                borderBottom: `6px solid ${base.operational ? color : '#333'}`,
                pointerEvents: 'none', zIndex: 7,
              }} />
            )
          })}

          {/* Evacuation centers */}
          {Object.values(gs.evacuationCenters).map(ec => (
            <div key={ec.id} style={{
              position: 'absolute', left: `${ec.x * 100}%`, top: `${ec.y * 100}%`,
              width: 9, height: 9, transform: 'translate(-50%,-50%)',
              borderRadius: '50%', border: `1.5px solid ${ec.operational ? '#ffaa00' : '#333'}`,
              background: 'transparent', pointerEvents: 'none', zIndex: 7,
            }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 1, background: '#ffaa00' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 1, height: 5, background: '#ffaa00' }} />
            </div>
          ))}
        </div>

        {/* HUD overlays */}
        {isPlaying && (
          <>
            {/* Terminal */}
            <div style={{ position: 'absolute', top: 10, left: 10, width: 400, height: 280, background: 'rgba(0,0,0,0.95)', border: '2px solid #00ff00', borderRadius: 4, padding: 8, fontSize: 10, overflowY: 'auto', color: '#00ff00', zIndex: 100, pointerEvents: 'auto' }}>
              <div style={{ borderBottom: '1px solid #00ff00', paddingBottom: 4, marginBottom: 6, fontSize: 11, fontWeight: 'bold' }}>⚡ COMMAND TERMINAL ⚡</div>
              {(gs.terminalLines || []).map((line, i) => (
                <div key={i} style={{ marginBottom: 1, lineHeight: 1.4, color: line.includes('[IMPACT]') || line.includes('[DEADMAN]') ? '#ff4444' : line.includes('[DIPLOMACY]') || line.includes('[EVACUATION]') ? '#ffaa00' : '#00ff00' }}>{line}</div>
              ))}
            </div>

            {/* Status panel */}
            <div style={{ position: 'absolute', top: 10, right: 10, width: 280, background: 'rgba(0,0,0,0.95)', border: '2px solid #00ff00', borderRadius: 4, padding: 12, fontSize: 11, color: '#00ff00', zIndex: 100 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 12 }}>📊 STRATEGIC STATUS</div>
              {stats && (
                <div style={{ color: '#fff', lineHeight: 1.9 }}>
                  <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: 4 }}>
                    {String(stats.gh).padStart(2,'0')}:{String(stats.gm).padStart(2,'0')}:{String(stats.gs).padStart(2,'0')}
                  </div>
                  NATO: <span style={{ color: '#3b82f6' }}>{stats.natoAlive}</span> &nbsp;
                  Warsaw: <span style={{ color: '#ef4444' }}>{stats.warsawAlive}</span> &nbsp;
                  Neutral: <span style={{ color: '#eab308' }}>{stats.neutralAlive}</span><br />
                  Cities Destroyed: <span style={{ color: '#ef4444' }}>{stats.citiesDestroyed}</span><br />
                  Missiles Active: <span style={{ color: '#f97316' }}>{gs.missiles.length}</span><br />
                  Radiation Zones: <span style={{ color: '#eab308' }}>{gs.radiationZones.length}</span><br />
                  Casualties: <span style={{ color: '#ef4444' }}>{(stats.casualties / 1e6).toFixed(1)}M</span><br />
                  Econ Collapse: <span style={{ color: '#f97316' }}>{(gs.economicCollapse || 0).toFixed(0)}%</span><br />
                  <br />
                  {/* Global tension bar */}
                  <div style={{ marginBottom: 4 }}>
                    GLOBAL TENSION: <span style={{ color: tensionColor, fontWeight: 'bold' }}>{Math.round(gs.globalTension)}%</span>
                  </div>
                  <div style={{ height: 8, background: '#111', borderRadius: 4, overflow: 'hidden', border: '1px solid #333' }}>
                    <div style={{ height: '100%', width: `${gs.globalTension}%`, background: `linear-gradient(90deg, #00ff00, ${tensionColor})`, transition: 'width 0.5s' }} />
                  </div>
                  {gs.globalTension >= 80 && (
                    <div style={{ color: '#ff4444', fontSize: 10, marginTop: 4, animation: 'alertFlash 1s infinite' }}>
                      ⚠ DEADMAN: {Math.round(deadmanPct)}% — DE-ESCALATE NOW!
                    </div>
                  )}
                  {gs.ceaseFireActive && (
                    <div style={{ color: '#22c55e', fontSize: 10, marginTop: 4 }}>🕊 CEASE-FIRE ACTIVE</div>
                  )}
                </div>
              )}
            </div>

            {/* Evacuation panel */}
            <div style={{ position: 'absolute', bottom: 50, left: 10, width: 360, background: 'rgba(0,0,0,0.95)', border: '2px solid #ffaa00', borderRadius: 4, padding: 12, fontSize: 11, color: '#ffaa00', zIndex: 100 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 12 }}>🚁 EVACUATION COMMAND</div>
              {stats && (
                <div style={{ lineHeight: 1.8 }}>
                  Cities Evacuated: <span style={{ color: '#00ff00' }}>{stats.evacuatedCities}</span><br />
                  Refugees Moving: <span style={{ color: '#fff' }}>{gs.refugees.length}</span><br />
                  Efficiency: <span style={{ color: gs.evacuationEfficiency > 70 ? '#00ff00' : '#ff8800' }}>{(gs.evacuationEfficiency || 80).toFixed(0)}%</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={handleGlobalEvacuation} style={{ padding: '4px 10px', background: '#ffaa00', border: 'none', color: '#000', fontFamily: 'Courier New', cursor: 'pointer', borderRadius: 3, fontSize: 10, fontWeight: 'bold' }}>GLOBAL EVAC</button>
                <button onClick={handleCeaseFire} style={{ padding: '4px 10px', background: 'rgba(34,197,94,0.8)', border: 'none', color: '#000', fontFamily: 'Courier New', cursor: 'pointer', borderRadius: 3, fontSize: 10, fontWeight: 'bold' }}>🕊 CEASE-FIRE</button>
                {myCountryId && (
                  <button onClick={() => handleDeescalate(myCountryId)} style={{ padding: '4px 10px', background: 'rgba(59,130,246,0.8)', border: 'none', color: '#fff', fontFamily: 'Courier New', cursor: 'pointer', borderRadius: 3, fontSize: 10, fontWeight: 'bold' }}>DE-ESCALATE</button>
                )}
              </div>
            </div>

            {/* Red Phone panel */}
            {redPhoneOpen && (
              <div style={{ position: 'absolute', bottom: 50, left: 380, width: 320, height: 280, background: 'rgba(0,0,0,0.95)', border: '2px solid #ff0000', borderRadius: 4, padding: 8, fontSize: 10, color: '#ff4444', zIndex: 100 }}>
                <div style={{ borderBottom: '1px solid #ff0000', paddingBottom: 4, marginBottom: 6, fontSize: 11, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🔴 RED PHONE — SECURE LINE</span>
                  <button onClick={() => setRedPhoneOpen(false)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
                <div style={{ height: 180, overflowY: 'auto', marginBottom: 8, border: '1px solid #333', borderRadius: 3, padding: 4 }}>
                  {redPhoneHistory.map(msg => (
                    <div key={msg.id} style={{ marginBottom: 4, color: msg.senderColor }}>
                      <span style={{ fontWeight: 'bold' }}>{msg.sender}:</span> {msg.message}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    value={redPhoneMessage}
                    onChange={(e) => setRedPhoneMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRedPhoneMessage(redPhoneMessage)}
                    placeholder="Type message to all nations..."
                    style={{ flex: 1, padding: '4px 6px', background: '#111', border: '1px solid #ff0000', borderRadius: 3, color: '#ff4444', fontSize: 10 }}
                  />
                  <button
                    onClick={() => handleRedPhoneMessage(redPhoneMessage)}
                    style={{ padding: '4px 8px', background: '#ff0000', border: 'none', color: '#fff', borderRadius: 3, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    SEND
                  </button>
                </div>
              </div>
            )}

            {/* Mini-map */}
            {showMiniMap && (
              <canvas ref={miniMapRef} width={240} height={170}
                style={{ position: 'absolute', bottom: 50, right: 10, border: '2px solid #00ff00', background: 'rgba(0,0,20,0.9)', zIndex: 100 }} />
            )}

            {/* Zoom indicator */}
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', border: '1px solid #334155', borderRadius: 4, padding: '3px 10px', color: '#555', fontSize: 10, fontFamily: 'monospace', pointerEvents: 'none', zIndex: 100 }}>
              Zoom: {Math.round(zoom * 100)}% · Click nation to interact · Scroll=zoom · Drag=pan
            </div>
          </>
        )}

        {/* Country popup */}
        {selCountry && isPlaying && (
          <div data-popup="1" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 660, maxHeight: '82vh', overflowY: 'auto',
            background: 'rgba(0,0,0,0.97)', border: '3px solid #ffff00',
            borderRadius: 6, padding: 20, zIndex: 500,
            boxShadow: '0 0 30px rgba(255,255,0,0.3)',
            color: '#fff', fontFamily: 'Courier New, monospace',
            animation: 'popupIn 0.2s ease-out',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ color: '#ffff00', margin: 0, fontSize: 18 }}>
                {selCountry.name}
                {selCountry.isBot && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>🤖 BOT-CONTROLLED</span>}
              </h2>
              <button onClick={() => setSelectedCountry(null)} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 4, color: '#fca5a5', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14, fontSize: 11 }}>
              {[
                ['Alliance', selCountry.side.toUpperCase()],
                ['Population', `${(selCountry.pop / 1e6).toFixed(1)}M`],
                ['Military', `${selCountry.mil}%`],
                ['Economy', `${selCountry.eco}%`],
                ['Damage', `${selCountry.damageLevel}%`],
                ['Nukes', `${selCountry.nukes}`],
                ['Tension', `${Math.round(selCountry.tension)}%`],
                ['Evacuation', selCountry.evacuationStatus === 0 ? 'None' : 'Active'],
                ['Status', selCountry.destroyed ? '💀 DESTROYED' : '✓ Active'],
              ].map(([k, v]) => (
                <div key={k} style={{ background: 'rgba(30,41,59,0.5)', padding: '5px 8px', borderRadius: 4 }}>
                  <span style={{ color: '#94a3b8' }}>{k}: </span>
                  <span style={{ color: k === 'Tension' && selCountry.tension > 70 ? '#ff4444' : '#fff', fontWeight: 'bold' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Tension bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>TENSION LEVEL</div>
              <div style={{ height: 10, background: '#111', borderRadius: 5, overflow: 'hidden', border: '1px solid #333' }}>
                <div style={{ height: '100%', width: `${selCountry.tension}%`, background: selCountry.tension > 70 ? 'linear-gradient(90deg,#ff8800,#ff0000)' : 'linear-gradient(90deg,#00ff00,#ffff00)', transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* Cities */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: 6, fontSize: 12 }}>CITIES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                {Object.values(gs.cities).filter(c => c.country === selectedCountry).map(city => (
                  <div key={city.id} style={{
                    padding: '5px 7px', borderRadius: 4, fontSize: 10,
                    background: city.destroyed ? 'rgba(255,0,0,0.2)' : city.evacuated ? 'rgba(0,255,0,0.1)' : 'rgba(255,255,0,0.08)',
                    border: `1px solid ${city.destroyed ? '#ef4444' : city.evacuated ? '#22c55e' : '#555'}`,
                  }}>
                    <div style={{ fontWeight: 'bold', color: city.destroyed ? '#ef4444' : '#fff' }}>{city.name}</div>
                    <div style={{ color: '#666', fontSize: 9 }}>{(city.population / 1e6).toFixed(1)}M</div>
                    {city.isCapital && <div style={{ color: '#ffaa00', fontSize: 8 }}>CAPITAL</div>}
                    {city.destroyed && <div style={{ color: '#ef4444', fontSize: 8, fontWeight: 'bold' }}>DESTROYED</div>}
                    {city.evacuated && !city.destroyed && <div style={{ color: '#22c55e', fontSize: 8 }}>EVACUATED</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleEvacuateCountry(selectedCountry)} style={{ padding: '7px 14px', background: 'rgba(255,170,0,0.8)', border: 'none', borderRadius: 4, color: '#000', fontFamily: 'Courier New', cursor: 'pointer', fontWeight: 'bold', fontSize: 11 }}>
                🚁 EVACUATE
              </button>
              <button onClick={() => handleDeescalate(selectedCountry)} style={{ padding: '7px 14px', background: 'rgba(59,130,246,0.8)', border: 'none', borderRadius: 4, color: '#fff', fontFamily: 'Courier New', cursor: 'pointer', fontWeight: 'bold', fontSize: 11 }}>
                🕊 DE-ESCALATE
              </button>
              {myCountryId && gs.countries[myCountryId] && selCountry.side !== gs.countries[myCountryId].side && !selCountry.destroyed && (
                <>
                  <button onClick={() => handleNuclearStrike(selectedCountry)} style={{ padding: '7px 14px', background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: 4, color: '#fff', fontFamily: 'Courier New', cursor: 'pointer', fontWeight: 'bold', fontSize: 11 }}>
                    ☢ NUCLEAR STRIKE
                  </button>
                  <div style={{ width: '100%', marginTop: 6 }}>
                    <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>Target specific city:</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {Object.values(gs.cities).filter(c => c.country === selectedCountry && !c.destroyed).map(city => (
                        <button key={city.id} onClick={() => handleLaunchMissile(city.id)} style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.35)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 3, color: '#fca5a5', fontFamily: 'Courier New', cursor: 'pointer', fontSize: 9 }}>
                          🎯 {city.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'rgba(0,0,0,0.97)', borderTop: '1px solid #00ff00', padding: '6px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', zIndex: 200, flexShrink: 0 }}>
        {/* Players */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.values(gs.players).map(p => (
            <div key={p.id} style={{ padding: '2px 7px', background: 'rgba(30,41,59,0.8)', border: `1px solid ${gs.ready[p.id] ? '#22c55e' : '#334155'}`, borderRadius: 4, fontSize: 9, color: gs.ready[p.id] ? '#22c55e' : '#666' }}>
              {gs.ready[p.id] ? '✓' : '○'} {p.username}{p.countryId ? ` (${p.countryId})` : ''}
            </div>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: '#334155' }} />
        {!joined && <button onClick={handleJoin} style={{ padding: '5px 12px', background: '#00ff00', border: 'none', borderRadius: 4, color: '#000', fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Courier New' }}>JOIN WAR ROOM</button>}
        {joined && gs.phase === 'lobby' && (
          <>
            <button onClick={handleReady} style={{ padding: '5px 12px', background: ready ? '#22c55e' : '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Courier New' }}>{ready ? '✓ READY' : 'READY UP'}</button>
            <button onClick={handleLeave} style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, color: '#fca5a5', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>LEAVE</button>
          </>
        )}
        {isPlaying && (
          <>
            <button onClick={handleCeaseFire} style={{ padding: '5px 10px', background: 'rgba(34,197,94,0.2)', border: '1px solid #22c55e', borderRadius: 4, color: '#22c55e', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>🕊 CEASE-FIRE</button>
            {myCountryId && <button onClick={() => handleDeescalate(myCountryId)} style={{ padding: '5px 10px', background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', borderRadius: 4, color: '#60a5fa', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>DE-ESCALATE</button>}
            <button onClick={handleGlobalEvacuation} style={{ padding: '5px 10px', background: 'rgba(255,170,0,0.2)', border: '1px solid #ffaa00', borderRadius: 4, color: '#ffaa00', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>[E] EVACUATE</button>
            <button onClick={() => setShowMiniMap(m => !m)} style={{ padding: '5px 8px', background: 'rgba(0,255,0,0.1)', border: '1px solid #00ff00', borderRadius: 4, color: '#00ff00', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>[M] MAP</button>
            <button onClick={() => setRedPhoneOpen(!redPhoneOpen)} style={{ padding: '5px 8px', background: redPhoneOpen ? 'rgba(255,0,0,0.3)' : 'rgba(255,0,0,0.1)', border: '1px solid #ff0000', borderRadius: 4, color: '#ff4444', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>🔴 RED PHONE</button>
            <button onClick={resetView} style={{ padding: '5px 8px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: 4, color: '#666', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>RESET VIEW</button>
          </>
        )}
        <button onClick={handleReset} style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, color: '#fca5a5', fontSize: 9, cursor: 'pointer', fontFamily: 'Courier New' }}>RESET</button>
        <span style={{ color: '#334155', fontSize: 9, fontFamily: 'Courier New' }}>
          {gs.phase === 'lobby' ? `${Object.keys(gs.players).length} players · ${NATIONS.length} nations (${NATIONS.length - Object.keys(gs.players).length} bots)` : 'Click nations · De-escalate to prevent MAD'}
        </span>
      </div>

      {/* Lobby overlay */}
      {gs.phase === 'lobby' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 150, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, fontWeight: 'bold', color: '#ff0000', textShadow: '0 0 30px rgba(255,0,0,0.6)', marginBottom: 8 }}>DEFCON: MAD</div>
            <div style={{ fontSize: 20, color: '#ffff00', marginBottom: 6 }}>MUTUALLY ASSURED DESTRUCTION</div>
            <div style={{ fontSize: 13, color: '#00ff00', marginBottom: 20 }}>Strategic Defense Simulation — {NATIONS.length} Nations</div>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 16, maxWidth: 500, lineHeight: 1.6 }}>
              ⚠ WARNING: A deadman switch is armed. If global tension reaches critical levels<br />
              and no player de-escalates within 2 minutes, MAD will be automatically triggered.<br />
              You MUST act — evacuate, negotiate, or de-escalate.
            </div>
            {Object.values(gs.players).map(p => (
              <div key={p.id} style={{ fontSize: 11, color: gs.ready[p.id] ? '#22c55e' : '#666', marginBottom: 3 }}>
                {gs.ready[p.id] ? '✓' : '○'} {p.username}{p.countryId ? ` — ${p.countryId}` : ''}
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#475569', marginTop: 12 }}>Join and ready up · Unassigned nations controlled by AI bots</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes alertFlash {
          0%, 100% { background: linear-gradient(45deg, #ff0000, #ff6600); color: #ffffff; }
          50% { background: linear-gradient(45deg, #ff6600, #ffaa00); color: #000000; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tensionPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(255,0,0,0.4); }
          50% { box-shadow: 0 0 20px rgba(255,0,0,0.8); }
        }
        @keyframes deadmanPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes popupIn {
          from { opacity: 0; transform: translate(-50%,-50%) scale(0.93); }
          to { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
      `}</style>
    </div>
  )
}

export default Defcon3Activity
