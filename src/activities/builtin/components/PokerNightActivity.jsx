import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrophyIcon } from '@heroicons/react/24/outline'

const PokerTableIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="11" rx="7.5" ry="4.5" />
    <path d="M6.5 15.5 5 19" />
    <path d="M17.5 15.5 19 19" />
    <path d="M9.25 9.5h5.5" />
    <path d="M12 7v5" />
  </svg>
)

// Suit SVG components
const SuitSpade = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 2C12 2 3 9 3 14C3 17 5 19 8 19C9.5 19 10.5 18.5 11 18L10 22L14 22L13 18C13.5 18.5 14.5 19 16 19C19 19 21 17 21 14C21 9 12 2 12 2Z" />
  </svg>
)

const SuitHeart = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 21C12 21 3 14 3 9C3 6 5 4 7.5 4C9.5 4 11 5 12 6.5C13 5 14.5 4 16.5 4C19 4 21 6 21 9C21 14 12 21 12 21Z" />
  </svg>
)

const SuitDiamond = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 3L20 12L12 21L4 12Z" />
  </svg>
)

const SuitClub = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <circle cx="8" cy="11" r="4" />
    <circle cx="16" cy="11" r="4" />
    <circle cx="12" cy="7" r="4" />
    <rect x="10" y="15" width="4" height="6" />
    <rect x="8" y="20" width="8" height="2" />
  </svg>
)

// Poker sound manager - creates sounds using Web Audio API
const createPokerSoundManager = () => {
  let audioContext = null
  let masterGain = null
  let muted = false
  let inited = false

  const initAudio = () => {
    if (inited) return
    inited = true
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      masterGain = audioContext.createGain()
      masterGain.connect(audioContext.destination)
      masterGain.gain.value = 0.25
    } catch (e) {
      console.warn('[Poker] Audio not available:', e)
    }
  }

  const playTone = (frequency, duration, type = 'sine', volume = 0.3) => {
    if (!audioContext || muted) return
    try {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime)
      gain.gain.setValueAtTime(volume, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration)
      osc.connect(gain)
      gain.connect(masterGain)
      osc.start()
      osc.stop(audioContext.currentTime + duration)
    } catch (e) {}
  }

  const playChipSound = () => {
    if (!audioContext || muted) return
    try {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(150, audioContext.currentTime)
      osc.frequency.setValueAtTime(100, audioContext.currentTime + 0.05)
      gain.gain.setValueAtTime(0.15, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1)
      osc.connect(gain)
      gain.connect(masterGain)
      osc.start()
      osc.stop(audioContext.currentTime + 0.1)
    } catch (e) {}
  }

  const playCardFlip = () => {
    if (!audioContext || muted) return
    try {
      const noise = audioContext.createBufferSource()
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.05, audioContext.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      }
      noise.buffer = buffer
      const filter = audioContext.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 2000
      const gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.2, audioContext.currentTime)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain)
      noise.start()
    } catch (e) {}
  }

  return {
    init: initAudio,
    ensureInited: () => {
      if (!inited) initAudio()
    },
    mute: () => { muted = true },
    unmute: () => { muted = false },
    isMuted: () => muted,
    toggleMute: () => { muted = !muted; return muted },
    playJoin: () => {
      playTone(440, 0.08, 'sine', 0.2)
      setTimeout(() => playTone(554, 0.1, 'sine', 0.25), 60)
    },
    playLeave: () => {
      playTone(554, 0.08, 'sine', 0.2)
      setTimeout(() => playTone(440, 0.1, 'sine', 0.15), 60)
    },
    playCheck: () => {
      playTone(330, 0.1, 'sine', 0.2)
    },
    playCall: () => {
      playChipSound()
      playTone(440, 0.1, 'sine', 0.25)
    },
    playBet: () => {
      playChipSound()
      playTone(523, 0.12, 'sine', 0.3)
    },
    playRaise: () => {
      playChipSound()
      playTone(659, 0.1, 'sine', 0.3)
      setTimeout(() => playTone(784, 0.1, 'sine', 0.25), 80)
    },
    playFold: () => {
      playTone(300, 0.15, 'sine', 0.2)
      setTimeout(() => playTone(250, 0.2, 'sine', 0.15), 100)
    },
    playAllIn: () => {
      playChipSound()
      playChipSound()
      playTone(784, 0.15, 'sine', 0.35)
      setTimeout(() => playTone(880, 0.15, 'sine', 0.35), 100)
      setTimeout(() => playTone(1047, 0.2, 'sine', 0.4), 200)
    },
    playStart: () => {
      playTone(392, 0.12, 'sine', 0.3)
      setTimeout(() => playTone(523, 0.12, 'sine', 0.3), 100)
      setTimeout(() => playTone(659, 0.15, 'sine', 0.35), 200)
      setTimeout(() => playTone(784, 0.2, 'sine', 0.4), 300)
    },
    playCardDeal: playCardFlip,
    playWin: () => {
      playTone(523, 0.15, 'sine', 0.3)
      setTimeout(() => playTone(659, 0.15, 'sine', 0.3), 120)
      setTimeout(() => playTone(784, 0.2, 'sine', 0.35), 240)
      setTimeout(() => playTone(1047, 0.3, 'sine', 0.4), 360)
    },
    playLose: () => {
      playTone(400, 0.2, 'sine', 0.25)
      setTimeout(() => playTone(350, 0.3, 'sine', 0.2), 200)
    },
    playClick: () => {
      playTone(600, 0.03, 'square', 0.08)
    },
    playHover: () => {
      playTone(500, 0.02, 'sine', 0.05)
    }
  }
}

const pokerSoundManager = createPokerSoundManager()

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const PHASES = {
  LOBBY: 'lobby',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown'
}

const BET_ACTIONS = {
  CHECK: 'check',
  BET: 'bet',
  CALL: 'call',
  RAISE: 'raise',
  FOLD: 'fold',
  ALL_IN: 'all_in'
}

const STARTING_CHIPS = 1000
const SMALL_BLIND = 10
const BIG_BLIND = 20

const SUIT_ALIASES = {
  s: '♠',
  spade: '♠',
  spades: '♠',
  '♠': '♠',
  h: '♥',
  heart: '♥',
  hearts: '♥',
  '♥': '♥',
  d: '♦',
  diamond: '♦',
  diamonds: '♦',
  '♦': '♦',
  c: '♣',
  club: '♣',
  clubs: '♣',
  '♣': '♣'
}

const RANK_ALIASES = {
  '1': 'A',
  ace: 'A',
  a: 'A',
  king: 'K',
  k: 'K',
  queen: 'Q',
  q: 'Q',
  jack: 'J',
  j: 'J',
  '11': 'J',
  '12': 'Q',
  '13': 'K',
  '14': 'A'
}

const RANK_ORDER = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }

const getCardValue = (card) => RANK_ORDER[card.rank] || 0

const evaluateHand = (cards) => {
  if (!cards || cards.length < 5) return { rank: 1, value: 0, name: 'High Card' }
  
  const sorted = [...cards].sort((a, b) => getCardValue(b) - getCardValue(a))
  const values = sorted.map(c => getCardValue(c))
  const ranks = sorted.map(c => c.rank)
  const suits = sorted.map(c => c.suit)
  
  const counts = {}
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1
  const countValues = Object.values(counts).sort((a, b) => b - a)
  
  const isFlush = suits.length >= 5 && new Set(suits).size === 1
  
  const uniqueValues = [...new Set(values)]
  let isStraight = false
  if (uniqueValues.length >= 5) {
    for (let i = 0; i <= uniqueValues.length - 5; i++) {
      const window = uniqueValues.slice(i, i + 5)
      if (window[4] - window[0] === 4 && window.length === 5) {
        isStraight = true
        break
      }
    }
    if (!isStraight && uniqueValues.includes(14) && uniqueValues.includes(2) && uniqueValues.includes(3) && uniqueValues.includes(4) && uniqueValues.includes(5)) {
      isStraight = true
      uniqueValues[uniqueValues.indexOf(14)] = 1
      uniqueValues.sort((a, b) => b - a)
    }
  }
  
  if (isFlush && isStraight) {
    const highCard = Math.max(...uniqueValues.slice(0, 5))
    return { rank: 9, value: highCard, name: 'Straight Flush' }
  }
  
  if (countValues[0] === 4) {
    const quadRank = Object.keys(counts).find(r => counts[r] === 4)
    const kickers = values.filter(v => v !== RANK_ORDER[quadRank]).sort((a, b) => b - a).slice(0, 1)
    return { rank: 8, value: RANK_ORDER[quadRank] * 10000000 + (kickers[0] || 0), name: 'Four of a Kind' }
  }
  
  if (countValues[0] === 3 && countValues[1] >= 2) {
    const tripsRank = Object.keys(counts).find(r => counts[r] === 3)
    const pairRank = Object.keys(counts).find(r => counts[r] >= 2 && r !== tripsRank)
    return { rank: 7, value: RANK_ORDER[tripsRank] * 1000000 + RANK_ORDER[pairRank], name: 'Full House' }
  }
  
  if (isFlush) {
    const flushValues = values.slice(0, 5)
    return { rank: 6, value: flushValues[0] * 100000 + flushValues[1] * 10000 + flushValues[2] * 1000 + flushValues[3] * 100 + flushValues[4], name: 'Flush' }
  }
  
  if (isStraight) {
    const highCard = Math.max(...uniqueValues.slice(0, 5))
    return { rank: 5, value: highCard, name: 'Straight' }
  }
  
  if (countValues[0] === 3) {
    const tripsRank = Object.keys(counts).find(r => counts[r] === 3)
    const kickers = values.filter(v => v !== RANK_ORDER[tripsRank]).sort((a, b) => b - a).slice(0, 2)
    return { rank: 4, value: RANK_ORDER[tripsRank] * 100000 + (kickers[0] || 0) * 1000 + (kickers[1] || 0), name: 'Three of a Kind' }
  }
  
  if (countValues[0] === 2 && countValues[1] === 2) {
    const pairs = Object.keys(counts).filter(r => counts[r] === 2).sort((a, b) => RANK_ORDER[b] - RANK_ORDER[a])
    const kicker = values.find(v => v !== RANK_ORDER[pairs[0]] && v !== RANK_ORDER[pairs[1]])
    return { rank: 3, value: RANK_ORDER[pairs[0]] * 10000 + RANK_ORDER[pairs[1]] * 1000 + (kicker || 0), name: 'Two Pair' }
  }
  
  if (countValues[0] === 2) {
    const pairRank = Object.keys(counts).find(r => counts[r] === 2)
    const kickers = values.filter(v => v !== RANK_ORDER[pairRank]).sort((a, b) => b - a).slice(0, 3)
    return { rank: 2, value: RANK_ORDER[pairRank] * 1000 + (kickers[0] || 0) * 100 + (kickers[1] || 0) * 10 + (kickers[2] || 0), name: 'One Pair' }
  }
  
  return { rank: 1, value: values[0] * 1000000000 + values[1] * 100000000 + values[2] * 10000000 + values[3] * 100000 + values[4] * 1000, name: 'High Card' }
}

const findBestHand = (holeCards, communityCards) => {
  const allCards = [...holeCards, ...communityCards].filter(Boolean)
  if (allCards.length < 5) return null
  
  const allCombos = []
  for (let i = 0; i < allCards.length; i++) {
    for (let j = i + 1; j < allCards.length; j++) {
      for (let k = j + 1; k < allCards.length; k++) {
        for (let l = k + 1; l < allCards.length; l++) {
          for (let m = l + 1; m < allCards.length; m++) {
            const hand = [allCards[i], allCards[j], allCards[k], allCards[l], allCards[m]]
            allCombos.push(hand)
          }
        }
      }
    }
  }
  
  let best = null
  let bestEval = { rank: 0, value: -1 }
  
  for (const combo of allCombos) {
    const evalResult = evaluateHand(combo)
    if (!best || evalResult.rank > bestEval.rank || (evalResult.rank === bestEval.rank && evalResult.value > bestEval.value)) {
      best = combo
      bestEval = evalResult
    }
  }
  
  return { cards: best, evaluation: bestEval }
}

const determineWinner = (players, communityCards) => {
  const activePlayers = players.filter(p => p.cards?.length === 2 && !p.folded)
  if (activePlayers.length === 0) return []
  if (activePlayers.length === 1) return [{ player: activePlayers[0], hand: null, evaluation: null }]
  
  let best = null
  let bestEval = { rank: 0, value: -1 }
  const results = []
  
  for (const player of activePlayers) {
    const result = findBestHand(player.cards, communityCards)
    results.push({ player, hand: result?.cards || [], evaluation: result?.evaluation })
    if (!best || result.evaluation.rank > bestEval.rank || (result.evaluation.rank === bestEval.rank && result.evaluation.value > bestEval.value)) {
      best = result.cards
      bestEval = result.evaluation
    }
  }
  
  return results.filter(r => r.evaluation.rank === bestEval.rank && r.evaluation.value === bestEval.value)
}

const validPhases = new Set(Object.values(PHASES))
const validActions = new Set(Object.values(BET_ACTIONS))

const createDeck = () => {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` })
    }
  }
  return deck.sort(() => Math.random() - 0.5)
}

const sanitizeCard = (card) => {
  if (!card || typeof card !== 'object') return null
  const rawSuit = String(card.suit ?? card.symbol ?? '').trim()
  const rawRank = String(card.rank ?? card.value ?? '').trim()
  const suit = SUIT_ALIASES[rawSuit.toLowerCase()] || SUIT_ALIASES[rawSuit] || null
  const rank = RANK_ALIASES[rawRank.toLowerCase()] || rawRank.toUpperCase()
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null
  return { suit, rank, id: String(card.id || `${rank}${suit}`) }
}

const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  const cards = Array.isArray(player.cards) ? player.cards.map(sanitizeCard).filter(Boolean).slice(0, 2) : []
  return {
    id: String(player.id),
    username: String(player.username || 'Player'),
    chips: Number.isFinite(player.chips) ? Math.max(0, Math.floor(player.chips)) : STARTING_CHIPS,
    currentBet: Number.isFinite(player.currentBet) ? Math.max(0, Math.floor(player.currentBet)) : 0,
    folded: !!player.folded,
    seated: player.seated !== false,
    cards
  }
}

const sanitizeGameState = (incoming, prev) => {
  if (!incoming || typeof incoming !== 'object') return prev

  const playersRaw = Array.isArray(incoming.players) ? incoming.players : prev.players
  const dedup = new Map()
  for (const p of playersRaw) {
    const safe = sanitizePlayer(p)
    if (!safe) continue
    if (!dedup.has(safe.id)) dedup.set(safe.id, safe)
  }
  const players = [...dedup.values()]

  const communityCardsRaw = Array.isArray(incoming.communityCards) ? incoming.communityCards : prev.communityCards
  const communityCards = communityCardsRaw.map(sanitizeCard).filter(Boolean).slice(0, 5)

  return {
    ...prev,
    ...incoming,
    phase: validPhases.has(incoming.phase) ? incoming.phase : prev.phase,
    players,
    communityCards,
    pot: Number.isFinite(incoming.pot) ? Math.max(0, Math.floor(incoming.pot)) : prev.pot,
    currentBet: Number.isFinite(incoming.currentBet) ? Math.max(0, Math.floor(incoming.currentBet)) : prev.currentBet,
    currentPlayerIndex: Number.isInteger(incoming.currentPlayerIndex)
      ? Math.max(0, Math.min(players.length ? players.length - 1 : 0, incoming.currentPlayerIndex))
      : prev.currentPlayerIndex,
    dealerPosition: Number.isInteger(incoming.dealerPosition)
      ? Math.max(0, Math.min(players.length ? players.length - 1 : 0, incoming.dealerPosition))
      : prev.dealerPosition,
    lastAction: typeof incoming.lastAction === 'string' ? incoming.lastAction : prev.lastAction,
    gameNumber: Number.isInteger(incoming.gameNumber) ? Math.max(0, incoming.gameNumber) : prev.gameNumber
  }
}

const baseState = {
  phase: PHASES.LOBBY,
  deck: [],
  communityCards: [],
  players: [],
  pot: 0,
  currentBet: 0,
  dealerPosition: 0,
  currentPlayerIndex: 0,
  winner: null,
  winningHand: null,
  lastAction: '',
  gameNumber: 0
}

const buildEventId = (evt) => {
  const payload = evt?.payload || {}
  if (payload?.actionId) return String(payload.actionId)
  return `${evt?.eventType || 'evt'}:${evt?.ts || Date.now()}:${payload?.playerId || 'unknown'}:${payload?.action || ''}`
}

const rememberEvent = (setRef, eventId) => {
  if (!eventId) return false
  if (setRef.current.has(eventId)) return false
  setRef.current.add(eventId)
  if (setRef.current.size > 300) {
    const first = setRef.current.values().next().value
    setRef.current.delete(first)
  }
  return true
}

const phaseLabels = {
  [PHASES.LOBBY]: 'Lobby',
  [PHASES.PREFLOP]: 'Pre-Flop',
  [PHASES.FLOP]: 'Flop',
  [PHASES.TURN]: 'Turn',
  [PHASES.RIVER]: 'River',
  [PHASES.SHOWDOWN]: 'Showdown'
}

const resetPlayerBetsForNextStreet = (players = []) => (
  players.map((player) => ({ ...player, currentBet: 0 }))
)

const getNextPhase = (phase) => {
  if (phase === PHASES.PREFLOP) return PHASES.FLOP
  if (phase === PHASES.FLOP) return PHASES.TURN
  if (phase === PHASES.TURN) return PHASES.RIVER
  return PHASES.SHOWDOWN
}

const dealCommunityCardsForPhase = (phase, deck, currentCards) => {
  const nextDeck = [...deck]
  const nextCards = [...currentCards]
  const cardsToDeal = phase === PHASES.FLOP ? 3 : phase === PHASES.TURN || phase === PHASES.RIVER ? 1 : 0
  for (let index = 0; index < cardsToDeal; index += 1) {
    if (nextDeck.length > 0) {
      nextCards.push(nextDeck.pop())
    }
  }
  return { deck: nextDeck, communityCards: nextCards }
}

const getNextEligiblePlayerIndex = (players = [], startIndex = 0) => {
  if (!players.length) return 0
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (startIndex + offset) % players.length
    const player = players[index]
    if (player && !player.folded && player.chips > 0) {
      return index
    }
  }
  return startIndex
}

const isBettingRoundComplete = (players = [], currentBet = 0) => {
  const contenders = players.filter((player) => !player.folded)
  if (contenders.length <= 1) return true
  return contenders.every((player) => player.chips === 0 || player.currentBet === currentBet)
}

const seatLayoutsByCount = {
  2: [
    { x: 50, y: 88 },
    { x: 50, y: 14 }
  ],
  3: [
    { x: 50, y: 88 },
    { x: 24, y: 24 },
    { x: 76, y: 24 }
  ],
  4: [
    { x: 50, y: 88 },
    { x: 16, y: 52 },
    { x: 50, y: 14 },
    { x: 84, y: 52 }
  ],
  5: [
    { x: 50, y: 88 },
    { x: 18, y: 66 },
    { x: 26, y: 18 },
    { x: 74, y: 18 },
    { x: 82, y: 66 }
  ],
  6: [
    { x: 50, y: 90 },
    { x: 18, y: 72 },
    { x: 18, y: 30 },
    { x: 50, y: 12 },
    { x: 82, y: 30 },
    { x: 82, y: 72 }
  ],
  7: [
    { x: 50, y: 90 },
    { x: 22, y: 78 },
    { x: 12, y: 48 },
    { x: 24, y: 18 },
    { x: 76, y: 18 },
    { x: 88, y: 48 },
    { x: 78, y: 78 }
  ],
  8: [
    { x: 50, y: 90 },
    { x: 24, y: 80 },
    { x: 10, y: 55 },
    { x: 22, y: 18 },
    { x: 50, y: 8 },
    { x: 78, y: 18 },
    { x: 90, y: 55 },
    { x: 76, y: 80 }
  ]
}

const getSeatLayout = (index, totalPlayers) => {
  const predefined = seatLayoutsByCount[Math.max(2, Math.min(8, totalPlayers))]
  if (predefined?.[index]) return predefined[index]

  const angle = ((Math.PI * 2) / Math.max(totalPlayers, 1)) * index - Math.PI / 2
  return {
    x: 50 + Math.cos(angle) * 38,
    y: 50 + Math.sin(angle) * 34
  }
}

const PokerNightActivity = ({ sdk, currentUser }) => {
  const [gameState, setGameState] = useState(baseState)
  const [myCards, setMyCards] = useState([])
  const [myChips, setMyChips] = useState(STARTING_CHIPS)
  const [myBet, setMyBet] = useState(0)
  const [hasFolded, setHasFolded] = useState(false)
  const [showCards, setShowCards] = useState(false)
  const [loading, setLoading] = useState(!sdk)
  const [hasJoined, setHasJoined] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [raiseAmount, setRaiseAmount] = useState(0)

  const seenEventsRef = useRef(new Set())
  const prevPlayersRef = useRef([])
  const soundInitedRef = useRef(false)
  const minRaise = Math.max(BIG_BLIND, gameState.currentBet)

  // Keep raiseAmount in sync with minRaise (clamped to available chips)
  useEffect(() => {
    setRaiseAmount(prev => {
      const clamped = Math.max(minRaise, Math.min(myChips, prev || minRaise))
      return Number.isFinite(clamped) ? clamped : minRaise
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minRaise, myChips])

  // Initialize sound on first interaction
  useEffect(() => {
    const initSound = () => {
      if (!soundInitedRef.current) {
        pokerSoundManager.init()
        soundInitedRef.current = true
      }
    }
    document.addEventListener('click', initSound, { once: true })
    document.addEventListener('keydown', initSound, { once: true })
    return () => {
      document.removeEventListener('click', initSound)
      document.removeEventListener('keydown', initSound)
    }
  }, [])

  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    if (gameState.phase === PHASES.SHOWDOWN && gameState.communityCards.length >= 3) {
      const winners = determineWinner(gameState.players, gameState.communityCards)
      if (winners.length > 0) {
        setGameState((prev) => ({
          ...prev,
          winner: winners.map(w => w.player.id),
          winningHand: winners[0].evaluation?.name || 'Unknown'
        }))
        pokerSoundManager.ensureInited()
        pokerSoundManager.playWin()
        const winnerNames = winners.map(w => w.player.username).join(', ')
        addNotification(`${winnerNames} wins with ${winners[0].evaluation?.name || 'best hand'}!`, 'success')
      }
    }
  }, [gameState.phase, gameState.communityCards, gameState.players, addNotification])

  useEffect(() => {
    if (sdk && loading) setLoading(false)
  }, [sdk, loading])

  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((st) => {
      const poker = st?.poker
      if (!poker) return

      const prevPlayers = prevPlayersRef.current
      const newPlayers = Array.isArray(poker.players) ? poker.players : []
      
      if (newPlayers.length !== prevPlayers.length || 
          newPlayers.some((p, i) => String(p?.id) !== String(prevPlayers[i]?.id))) {
        prevPlayersRef.current = newPlayers
      }

      setGameState((prev) => sanitizeGameState(poker, prev))

      const me = newPlayers.find((p) => String(p?.id) === String(currentUser?.id))
      const safeMe = sanitizePlayer(me)
      if (safeMe) {
        setMyCards(safeMe.cards || [])
        setMyChips(safeMe.chips)
        setMyBet(safeMe.currentBet || 0)
        setHasFolded(!!safeMe.folded)
        setHasJoined(true)
      }
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eventId = buildEventId(evt)
      if (!rememberEvent(seenEventsRef, eventId)) return

      const payload = evt.payload || {}

      if (evt.eventType === 'poker:action') {
        const action = payload.action
        if (!validActions.has(action)) return
        
        // Play sound for actions
        pokerSoundManager.ensureInited()
        if (action === 'check') pokerSoundManager.playCheck()
        else if (action === 'call') pokerSoundManager.playCall()
        else if (action === 'bet') pokerSoundManager.playBet()
        else if (action === 'raise') pokerSoundManager.playRaise()
        else if (action === 'fold') pokerSoundManager.playFold()
        else if (action === 'all_in') pokerSoundManager.playAllIn()
        
        const amount = Number.isFinite(payload.amount) ? Math.max(0, Math.floor(payload.amount)) : 0
        const actor = payload.playerId === currentUser?.id ? 'You' : String(payload.username || 'Player')

        setGameState((prev) => ({
          ...prev,
          lastAction: `${actor} ${action}${amount > 0 ? ` $${amount}` : ''}`
        }))
        return
      }

      if (evt.eventType === 'poker:join') {
        const safe = sanitizePlayer(payload)
        if (!safe) return
        
        // Play join sound
        pokerSoundManager.ensureInited()
        pokerSoundManager.playJoin()
        
        setGameState((prev) => {
          if (prev.players.some((p) => p.id === safe.id)) return prev
          const nextPlayers = [...prev.players, safe]
          const newState = { ...prev, players: nextPlayers }
          // Update server state so all clients see the new player
          if (payload.isLocal) {
            sdk.updateState({ poker: newState }, { serverRelay: true })
          }
          return newState
        })
        if (safe.id === String(currentUser?.id)) {
          setHasJoined(true)
          addNotification('You joined the table!', 'success')
        } else {
          addNotification(`${safe.username} joined the table`, 'info')
        }
        return
      }

      if (evt.eventType === 'poker:leave') {
        const playerId = payload?.playerId
        if (!playerId) return
        
        // Play leave sound
        pokerSoundManager.ensureInited()
        pokerSoundManager.playLeave()
        
        const leavingPlayer = gameState.players.find((p) => p.id === String(playerId))
        const leavingUsername = leavingPlayer?.username || 'A player'
        
        setGameState((prev) => {
          const nextPlayers = prev.players.filter((p) => p.id !== String(playerId))
          const newState = {
            ...prev,
            players: nextPlayers
          }
          // Update server state so all clients see the player leave
          if (payload.isLocal) {
            sdk.updateState({ poker: newState }, { serverRelay: true })
          }
          return newState
        })
        
        if (String(playerId) === String(currentUser?.id)) {
          setHasJoined(false)
          setMyCards([])
          setMyBet(0)
          setHasFolded(false)
          addNotification('You left the table', 'info')
        } else {
          addNotification(`${leavingUsername} left the table`, 'info')
        }
      }

      if (evt.eventType === 'poker:start') {
        // Play start sound
        pokerSoundManager.ensureInited()
        pokerSoundManager.playStart()
        
        // Play card deal sounds
        for (let i = 0; i < 4; i++) {
          setTimeout(() => pokerSoundManager.playCardDeal(), i * 100)
        }
      }
    })

    return () => {
      offState?.()
      offEvent?.()
    }
  }, [sdk, currentUser?.id, currentUser?.username, addNotification])

  const currentPlayer = gameState.players[gameState.currentPlayerIndex] || null
  const isMyTurn = currentPlayer?.id === String(currentUser?.id)
  const myPlayer = gameState.players.find((p) => p.id === String(currentUser?.id))
  const isTableHost = gameState.players[0]?.id === String(currentUser?.id)
  const playerCount = gameState.players.length

  const canCheck = gameState.currentBet === 0
  const callAmount = Math.max(0, gameState.currentBet - myBet)
  const canCall = callAmount > 0 && myChips >= callAmount
  const canRaise = myChips > minRaise
  const tablePhaseLabel = phaseLabels[gameState.phase] || 'Table'
  const visibleCommunityCards = [...gameState.communityCards]
  while (visibleCommunityCards.length < 5) visibleCommunityCards.push(null)
  const highestStack = gameState.players.reduce((max, player) => Math.max(max, player.chips || 0), 0)
  const tableStatus = gameState.phase === PHASES.SHOWDOWN
    ? 'Cards up. Pot resolving.'
    : isMyTurn
      ? 'Your move'
      : currentPlayer?.username
        ? `${currentPlayer.username} is acting`
        : 'Waiting for the next hand'
  const totalTableChips = gameState.players.reduce((sum, player) => sum + (player.chips || 0), 0) + gameState.pot

  const takeAction = useCallback((action, amount = 0) => {
    if (!isMyTurn || gameState.phase === PHASES.LOBBY || !myPlayer || myPlayer.folded) return
    if (!validActions.has(action)) return

    // Play action sound
    pokerSoundManager.ensureInited()
    if (action === BET_ACTIONS.CHECK) pokerSoundManager.playCheck()
    else if (action === BET_ACTIONS.CALL) pokerSoundManager.playCall()
    else if (action === BET_ACTIONS.BET || action === BET_ACTIONS.RAISE) pokerSoundManager.playRaise()
    else if (action === BET_ACTIONS.FOLD) pokerSoundManager.playFold()
    else if (action === BET_ACTIONS.ALL_IN) pokerSoundManager.playAllIn()

    const normalizedAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
    if ((action === BET_ACTIONS.CALL || action === BET_ACTIONS.RAISE || action === BET_ACTIONS.BET || action === BET_ACTIONS.ALL_IN) && normalizedAmount <= 0) return

    if (action === BET_ACTIONS.CALL && normalizedAmount > myChips) return
    if (action === BET_ACTIONS.RAISE && normalizedAmount < minRaise) return

    const actionId = `poker_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    // Update the game state with the action and sync to all clients
    setGameState((prev) => {
      const players = prev.players.map((p) => {
        if (p.id === String(currentUser?.id)) {
          const newChips = Math.max(0, p.chips - normalizedAmount)
          const newBet = p.currentBet + normalizedAmount
          return {
            ...p,
            chips: newChips,
            currentBet: newBet,
            folded: action === BET_ACTIONS.FOLD ? true : p.folded
          }
        }
        return p
      })

      const maxBet = Math.max(...players.map(p => p.currentBet || 0))
      const activePlayers = players.filter((player) => !player.folded)
      const everyoneSettled = isBettingRoundComplete(players, maxBet)

      let nextPhase = prev.phase
      let nextDeck = prev.deck
      let nextCommunityCards = prev.communityCards
      let nextPlayers = players
      let nextCurrentBet = maxBet
      let nextPlayerIndex = getNextEligiblePlayerIndex(players, prev.currentPlayerIndex)

      if (activePlayers.length <= 1) {
        nextPhase = PHASES.SHOWDOWN
      } else if (everyoneSettled) {
        nextPhase = getNextPhase(prev.phase)
        if (nextPhase !== PHASES.SHOWDOWN) {
          const dealt = dealCommunityCardsForPhase(nextPhase, prev.deck, prev.communityCards)
          nextDeck = dealt.deck
          nextCommunityCards = dealt.communityCards
        }
        nextPlayers = resetPlayerBetsForNextStreet(players)
        nextCurrentBet = 0
        nextPlayerIndex = getNextEligiblePlayerIndex(nextPlayers, prev.dealerPosition)
      }

      const newState = {
        ...prev,
        phase: nextPhase,
        deck: nextDeck,
        communityCards: nextCommunityCards,
        players: nextPlayers,
        pot: prev.pot + normalizedAmount,
        currentBet: nextCurrentBet,
        currentPlayerIndex: nextPlayerIndex,
        lastAction: `${currentUser?.username || 'Player'} ${action}${normalizedAmount > 0 ? ` $${normalizedAmount}` : ''}`
      }

      // Update server state so all clients see the action
      sdk.updateState({ poker: newState }, { serverRelay: true })
      return newState
    })

    sdk.emitEvent('poker:action', {
      playerId: currentUser?.id,
      username: currentUser?.username || 'Player',
      action,
      amount: normalizedAmount,
      currentBet: gameState.currentBet,
      actionId
    }, { serverRelay: true, cue: 'button_click' })

    // Update local state
    if (action === BET_ACTIONS.FOLD) setHasFolded(true)
    if (normalizedAmount > 0) {
      setMyChips((prev) => Math.max(0, prev - normalizedAmount))
      setMyBet((prev) => prev + normalizedAmount)
    }
  }, [sdk, isMyTurn, currentUser?.id, currentUser?.username, gameState.currentBet, gameState.phase, minRaise, myChips, myPlayer, gameState.players, gameState.currentPlayerIndex])

  const startGame = useCallback(() => {
    if (!isTableHost) return
    if (gameState.players.length < 2) return

    // Play start sound
    pokerSoundManager.ensureInited()
    pokerSoundManager.playStart()

    const deck = createDeck()
    const players = gameState.players.map((p) => ({
      ...p,
      cards: [],
      currentBet: 0,
      folded: false,
      seated: true,
      chips: Number.isFinite(p.chips) ? p.chips : STARTING_CHIPS
    }))

    // Deal cards with sound
    for (let i = 0; i < 2; i++) {
      players.forEach((p) => {
        if (deck.length > 0 && !p.folded) p.cards.push(deck.pop())
      })
      // Play card deal sound
      setTimeout(() => pokerSoundManager.playCardDeal(), i * 150 + 200)
    }

    const sbPos = (gameState.dealerPosition + 1) % players.length
    const bbPos = (gameState.dealerPosition + 2) % players.length

    players[sbPos].currentBet = SMALL_BLIND
    players[sbPos].chips = Math.max(0, players[sbPos].chips - SMALL_BLIND)
    players[bbPos].currentBet = BIG_BLIND
    players[bbPos].chips = Math.max(0, players[bbPos].chips - BIG_BLIND)

    const newState = {
      phase: PHASES.PREFLOP,
      deck,
      communityCards: [],
      players,
      pot: SMALL_BLIND + BIG_BLIND,
      currentBet: BIG_BLIND,
      currentPlayerIndex: (bbPos + 1) % players.length,
      dealerPosition: gameState.dealerPosition,
      gameNumber: gameState.gameNumber + 1,
      lastAction: `Blinds: $${SMALL_BLIND}/$${BIG_BLIND}`
    }

    sdk.updateState({ poker: newState }, { serverRelay: true })
    sdk.emitEvent('poker:start', { gameNumber: newState.gameNumber }, { serverRelay: true, cue: 'game_start' })
  }, [sdk, isTableHost, gameState])

  const leaveTable = useCallback(() => {
    if (!currentUser?.id) return
    
    pokerSoundManager.ensureInited()
    pokerSoundManager.playLeave()
    
    const actionId = `poker_leave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    // Update server state immediately so all clients see the player leave
    setGameState((prev) => {
      const nextPlayers = prev.players.filter((p) => p.id !== String(currentUser.id))
      const newState = { ...prev, players: nextPlayers }
      sdk.updateState({ poker: newState }, { serverRelay: true })
      return newState
    })

    sdk.emitEvent('poker:leave', { playerId: currentUser.id, actionId }, { serverRelay: true })
    setHasJoined(false)
  }, [currentUser?.id, sdk])

  const getSuitComponent = (suit, size = 28) => {
    if (suit === '♠') return <SuitSpade size={size} />
    if (suit === '♥') return <SuitHeart size={size} />
    if (suit === '♦') return <SuitDiamond size={size} />
    if (suit === '♣') return <SuitClub size={size} />
    return <span>{suit}</span>
  }

  const renderCard = (card, faceDown = false) => {
    if (faceDown || !card) {
      return (
        <div className="poker-card back">
          <div className="card-back-inner" />
        </div>
      )
    }
    const isRed = card.suit === '♥' || card.suit === '♦'
    return (
      <div className={`poker-card face-up ${isRed ? 'red-suit' : 'black-suit'}`}>
        <div className="card-corner top-left">
          <span className="card-rank-small">{card.rank}</span>
          <span className="card-suit-small icon">{getSuitComponent(card.suit, 10)}</span>
        </div>
        <div className="card-center-suit">
          {getSuitComponent(card.suit, 28)}
        </div>
        <div className="card-corner bottom-right">
          <span className="card-rank-small">{card.rank}</span>
          <span className="card-suit-small icon">{getSuitComponent(card.suit, 10)}</span>
        </div>
      </div>
    )
  }

  const handleButtonHover = (e) => {
    pokerSoundManager.ensureInited()
    pokerSoundManager.playHover()
  }

  const handleButtonClick = (e) => {
    pokerSoundManager.ensureInited()
    pokerSoundManager.playClick()
  }

  const renderSeatMarkers = (playerIndex) => {
    const markers = []
    if (playerIndex === gameState.dealerPosition) markers.push({ label: 'D', className: 'dealer' })
    if (playerCount > 1 && playerIndex === (gameState.dealerPosition + 1) % playerCount) markers.push({ label: `SB ${SMALL_BLIND}`, className: 'small-blind' })
    if (playerCount > 2 && playerIndex === (gameState.dealerPosition + 2) % playerCount) markers.push({ label: `BB ${BIG_BLIND}`, className: 'big-blind' })
    return markers
  }

  if (loading) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading Poker Night...</p></div>
  }

  if (gameState.phase === PHASES.LOBBY) {
    return (
      <div className="builtin-activity-body poker-lobby">
        <div className="poker-header">
          <h2><PokerTableIcon /> <span>Poker Night</span></h2>
          <p>Texas Hold'em - ${STARTING_CHIPS} starting chips</p>
        </div>

        <div className="poker-table-preview">
          <div className="poker-table-circle">
            {playerCount === 0 && <div className="empty-table">Waiting for players...</div>}
            <AnimatePresence>
              {gameState.players.map((player, idx) => {
                const seat = getSeatLayout(idx, Math.max(playerCount, 2))
                return (
                <motion.div
                  key={player.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="player-seat-preview"
                  style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
                >
                  <motion.div 
                    className="player-avatar-preview"
                    whileHover={{ scale: 1.1 }}
                  >
                    {player.username?.[0] || '?'}
                  </motion.div>
                  <span>{player.username}</span>
                </motion.div>
                )
              })}
            </AnimatePresence>
            <div className="poker-table-preview-center">
              <span className="preview-pot-label">Table</span>
              <strong>{playerCount}/8 seated</strong>
            </div>
          </div>
        </div>

        <div className="poker-players-list">
          <h3>Players ({playerCount})</h3>
          <AnimatePresence mode="popLayout">
            {gameState.players.map((player) => (
              <motion.div
                key={player.id}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 50, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="player-item"
              >
                <span className="player-name">{player.username}</span>
                <span className="player-chips">${player.chips}</span>
                {player.id === String(currentUser?.id) && <span className="you-badge">You</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="poker-lobby-actions">
          {!hasJoined ? (
            <button
              className="join-game-btn"
              onClick={() => {
                handleButtonClick()
                if (!currentUser?.id) return
                const nextPlayer = sanitizePlayer({
                  id: currentUser.id,
                  username: currentUser.username || 'Player',
                  chips: STARTING_CHIPS
                })
                if (nextPlayer) {
                  setGameState((prev) => {
                    if (prev.players.some((player) => player.id === nextPlayer.id)) return prev
                    const newState = { ...prev, players: [...prev.players, nextPlayer] }
                    // Update server state so all clients see the new player
                    sdk.updateState({ poker: newState }, { serverRelay: true })
                    return newState
                  })
                }
                sdk.emitEvent('poker:join', {
                  playerId: currentUser.id,
                  username: currentUser.username || 'Player',
                  chips: STARTING_CHIPS,
                  actionId: `poker_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                }, { serverRelay: true })
                setHasJoined(true)
              }}
              onMouseEnter={handleButtonHover}
            >
              Join Table
            </button>
          ) : playerCount >= 2 ? (
            <button 
              className="start-game-btn" 
              onClick={() => { handleButtonClick(); startGame(); }} 
              disabled={!isTableHost}
              onMouseEnter={handleButtonHover}
            >
              {isTableHost ? 'Start Game' : 'Only table host can start'}
            </button>
          ) : (
            <p className="waiting-text">Waiting for more players... (need 2+)</p>
          )}
          {hasJoined && (
            <button 
              className="leave-table-btn" 
              onClick={() => { handleButtonClick(); leaveTable(); }}
              onMouseEnter={handleButtonHover}
            >
              Leave Table
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="builtin-activity-body poker-game">
      <style>{`
        /* ── Proper playing cards ── */
        .poker-card {
          position: relative;
          border-radius: 8px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3);
          overflow: hidden;
          flex-shrink: 0;
        }
        .poker-card.face-up {
          background: #ffffff;
          border: 1px solid #ddd;
        }
        .poker-card.back {
          background: #1e3a5f;
          border: 2px solid #2d5f8a;
        }
        .card-back-inner {
          width: 100%;
          height: 100%;
          background:
            repeating-linear-gradient(
              45deg,
              rgba(45,95,138,0.7) 0px,
              rgba(45,95,138,0.7) 4px,
              rgba(30,58,95,0.7) 4px,
              rgba(30,58,95,0.7) 8px
            );
          border-radius: 4px;
          margin: 4px;
          width: calc(100% - 8px);
          height: calc(100% - 8px);
          box-sizing: border-box;
          border: 1px solid rgba(45,95,138,0.5);
        }
        .poker-card.red-suit { color: #dc2626; }
        .poker-card.black-suit { color: #1a1a1a; }

        /* Card corners */
        .card-corner {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1;
          padding: 2px 3px;
        }
        .card-corner.top-left { top: 2px; left: 2px; }
        .card-corner.bottom-right {
          bottom: 2px; right: 2px;
          transform: rotate(180deg);
        }
        .card-rank-small {
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          font-family: Georgia, 'Times New Roman', serif;
        }
        .card-suit-small {
          font-size: 9px;
          line-height: 1;
        }
        .card-center-suit {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.85;
        }

        /* Larger cards in my-cards area */
        .my-cards .poker-card { width: 64px; height: 90px; }
        .my-cards .card-rank-small { font-size: 15px; }
        .my-cards .card-suit-small { font-size: 12px; }
        .my-cards .card-center-suit svg { width: 34px; height: 34px; }

        /* Community card slots */
        .community-card-slot .poker-card { width: 54px; height: 76px; }
        .community-card-slot .card-rank-small { font-size: 12px; }
        .community-card-slot .card-suit-small { font-size: 10px; }
        .community-card-slot .card-center-suit svg { width: 28px; height: 28px; }

        /* Player seat cards (small) */
        .poker-player-seat .player-cards .poker-card { width: 30px; height: 42px; }
        .poker-player-seat .player-cards .card-rank-small { font-size: 8px; }
        .poker-player-seat .player-cards .card-suit-small { font-size: 7px; }
        .poker-player-seat .player-cards .card-center-suit svg { width: 14px; height: 14px; }

        /* ── Improved table: wooden rail + felt oval ── */
        .poker-table {
          background: radial-gradient(ellipse at 50% 45%,
            #3a7d50 0%,
            #2d6640 40%,
            #1a4f2e 75%,
            #0f3020 100%
          );
          border: 12px solid #5c3a1e;
          box-shadow:
            inset 0 0 80px rgba(0,0,0,0.45),
            inset 0 0 20px rgba(255,255,255,0.03),
            0 8px 40px rgba(0,0,0,0.6),
            0 0 0 2px #3a2410,
            0 0 0 14px #6e4a28,
            0 0 0 16px #3a2410;
        }

        /* ── Pot display improvements ── */
        .poker-pot {
          border: 1px solid rgba(255,215,0,0.25);
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }

        /* ── Action button color-coding ── */
        .action-btn {
          position: relative;
          padding: 11px 22px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          letter-spacing: 0.02em;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
        }
        .action-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.4);
        }
        .action-btn:active:not(:disabled) { transform: translateY(-1px); }
        .action-btn.check {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: #fff;
        }
        .action-btn.call {
          background: linear-gradient(135deg, #22c55e, #15803d);
          color: #fff;
        }
        .action-btn.raise {
          background: linear-gradient(135deg, #f59e0b, #b45309);
          color: #fff;
        }
        .action-btn.all-in {
          background: linear-gradient(135deg, #ef4444, #991b1b);
          color: #fff;
          font-size: 13px;
        }
        .action-btn.fold {
          background: rgba(107,114,128,0.25);
          color: #9ca3af;
          border: 1px solid rgba(107,114,128,0.4);
        }
        .action-btn.fold:hover:not(:disabled) {
          background: rgba(107,114,128,0.4);
          color: #e5e7eb;
        }

        /* ── Raise slider ── */
        .raise-control {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 6px 0;
        }
        .raise-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          outline: none;
          cursor: pointer;
        }
        .raise-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #f59e0b;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .raise-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #f59e0b;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .raise-amount {
          min-width: 56px;
          text-align: right;
          font-size: 15px;
          font-weight: 700;
          color: #fbbf24;
          font-family: monospace;
        }

        /* ── Hand strength badge ── */
        .hand-strength-badge {
          display: inline-block;
          margin-top: 6px;
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.35);
          border: 1px solid currentColor;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          opacity: 0.9;
        }

        /* ── Improved notifications ── */
        .poker-notification {
          padding: 12px 20px 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 6px 20px rgba(0,0,0,0.45);
          border-left: 4px solid transparent;
          backdrop-filter: blur(8px);
          min-width: 220px;
          max-width: 340px;
        }
        .poker-notification.info {
          background: rgba(30,58,138,0.92);
          border-left-color: #60a5fa;
          color: #e0f2fe;
        }
        .poker-notification.success {
          background: rgba(5,46,22,0.92);
          border-left-color: #4ade80;
          color: #dcfce7;
        }
        .poker-notification.warning {
          background: rgba(78,52,3,0.92);
          border-left-color: #fbbf24;
          color: #fef3c7;
        }
        .poker-notification.error {
          background: rgba(69,10,10,0.92);
          border-left-color: #f87171;
          color: #fee2e2;
        }

        /* ── Improved player seat (me highlight) ── */
        .poker-player-seat.me {
          border-color: rgba(99,102,241,0.6);
          box-shadow: 0 0 0 1px rgba(99,102,241,0.3), 0 16px 40px rgba(0,0,0,0.3);
        }
        .poker-player-seat.active {
          border-color: #22c55e;
          box-shadow:
            0 0 0 2px rgba(34,197,94,0.35),
            0 0 16px rgba(34,197,94,0.3),
            0 16px 40px rgba(0,0,0,0.3);
          animation: activeSeatPulse 1.5s ease-in-out infinite;
        }
        @keyframes activeSeatPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.35), 0 0 16px rgba(34,197,94,0.25), 0 16px 40px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 2px rgba(34,197,94,0.6), 0 0 24px rgba(34,197,94,0.5), 0 16px 40px rgba(0,0,0,0.3); }
        }

        /* ── Action buttons container (only for poker) ── */
        .poker-controls .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          width: 100%;
        }
      `}</style>
      <div className="poker-header poker-header-inline">
        <div className="poker-title-lockup">
          <h2><PokerTableIcon /> <span>Poker Night</span></h2>
          <p>{tablePhaseLabel} hand #{Math.max(1, gameState.gameNumber || 1)}</p>
        </div>
        <div className="poker-header-stats">
          <div className="header-stat">
            <span className="header-stat-label">Players</span>
            <strong>{playerCount}</strong>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Pot</span>
            <strong>${gameState.pot}</strong>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Largest Stack</span>
            <strong>${highestStack}</strong>
          </div>
        </div>
      </div>

      <div className="poker-table-stage">
        <div className="poker-stage-rail top">
          <div className="stage-pill">
            <span className="stage-pill-label">Blinds</span>
            <strong>${SMALL_BLIND} / ${BIG_BLIND}</strong>
          </div>
          <div className="stage-pill">
            <span className="stage-pill-label">Table Bank</span>
            <strong>${totalTableChips}</strong>
          </div>
          <div className={`stage-pill ${isMyTurn ? 'urgent' : ''}`}>
            <span className="stage-pill-label">Status</span>
            <strong>{tableStatus}</strong>
          </div>
        </div>

        <div className="poker-table">
          <div className="poker-pot">
            <span className="pot-label">Main Pot</span>
            <span className="pot-amount">${gameState.pot}</span>
            <div className="pot-chip-stack" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="poker-table-inner">
            <div className="community-cards">
              {visibleCommunityCards.map((card, idx) => (
                <div key={card?.id || `community-slot-${idx}`} className={`community-card-slot ${card ? 'dealt' : 'empty'}`}>
                  {renderCard(card, !card)}
                </div>
              ))}
            </div>

            <div className="poker-table-hud">
              <span className="phase-label">{tablePhaseLabel}</span>
              <span className="table-callout">{gameState.currentBet > 0 ? `To call: $${callAmount}` : 'Action is open'}</span>
            </div>
          </div>

          {gameState.lastAction && <div className="last-action">{gameState.lastAction}</div>}
        </div>

        <AnimatePresence>
          {gameState.players.map((player, idx) => {
            const isCurrentPlayer = idx === gameState.currentPlayerIndex
            const isMe = player.id === String(currentUser?.id)
            const showHand = isMe || gameState.phase === PHASES.SHOWDOWN || player.folded
            const seat = getSeatLayout(idx, Math.max(playerCount, 2))
            const seatMarkers = renderSeatMarkers(idx)

            return (
              <motion.div
                key={player.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={`poker-player-seat ${isCurrentPlayer ? 'active' : ''} ${player.folded ? 'folded' : ''} ${isMe ? 'me' : ''}`}
                style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
              >
                <div className="seat-topline">
                  <div className="seat-markers">
                    {seatMarkers.map((marker) => (
                      <span key={marker.label} className={`seat-marker ${marker.className}`}>{marker.label}</span>
                    ))}
                  </div>
                  {player.currentBet > 0 && (
                    <div className="player-chip-bet">
                      <span className="chip-stack-icon" aria-hidden="true" />
                      <span>${player.currentBet}</span>
                    </div>
                  )}
                </div>
                <div className="player-info">
                  <div className="player-avatar-chip">{player.username?.[0] || '?'}</div>
                  <span className="player-name">{player.username}{isMe && ' (You)'}</span>
                  <span className="player-chips">${player.chips}</span>
                </div>
                <div className="player-cards">
                  {showHand ? (
                    player.cards?.map((card, cidx) => <React.Fragment key={cidx}>{renderCard(card, player.folded)}</React.Fragment>)
                  ) : (
                    <>
                      {renderCard(null, true)}
                      {renderCard(null, true)}
                    </>
                  )}
                </div>
                {player.folded && <span className="folded-badge">Folded</span>}
                {isCurrentPlayer && !player.folded && <span className="turn-badge">Acting</span>}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="poker-my-area">
        <div className="my-hand-panel">
          <div className="my-hand">
            <span className="my-label">Your Hand</span>
            <div className="my-cards">
              {(showCards || !hasFolded ? myCards : [null, null]).map((card, idx) => (
                <React.Fragment key={card?.id || `my-card-${idx}`}>{renderCard(card, hasFolded && !showCards)}</React.Fragment>
              ))}
            </div>
            {(() => {
              const visCards = hasFolded && !showCards ? [] : myCards.filter(Boolean)
              const allVisible = [...visCards, ...gameState.communityCards.filter(Boolean)]
              let handLabel = null
              if (visCards.length === 2 && allVisible.length >= 5) {
                const best = findBestHand(visCards, gameState.communityCards.filter(Boolean))
                handLabel = best?.evaluation?.name || 'High Card'
              } else if (visCards.length === 2) {
                handLabel = visCards.length === 2 ? '2 Cards' : null
              }
              if (!handLabel) return null
              const handRank = allVisible.length >= 5 && findBestHand(visCards, gameState.communityCards.filter(Boolean))?.evaluation?.rank || 0
              const handColor = handRank >= 7 ? '#ffd700' : handRank >= 5 ? '#22c55e' : handRank >= 3 ? '#60a5fa' : '#a0d0b0'
              return (
                <div className="hand-strength-badge" style={{ color: handColor }}>
                  {handLabel}
                </div>
              )
            })()}
          </div>
          <div className="my-stats">
            <span>Stack: ${myChips}</span>
            <span>In Pot: ${myBet}</span>
            <span>{hasFolded ? 'Folded' : isMyTurn ? 'Your turn' : 'Waiting'}</span>
          </div>
        </div>

        <div className="poker-controls">
          {hasFolded ? (
            <div className="folded-message">
              You folded this hand
              <button onClick={() => { handleButtonClick(); setShowCards((prev) => !prev); }}>
                {showCards ? 'Hide Cards' : 'Show Cards'}
              </button>
            </div>
          ) : isMyTurn && gameState.phase !== PHASES.SHOWDOWN ? (
            <div className="action-buttons">
              {canCheck && (
                <button
                  className="action-btn check"
                  onClick={() => { handleButtonClick(); takeAction(BET_ACTIONS.CHECK); }}
                  onMouseEnter={handleButtonHover}
                >
                  Check
                </button>
              )}
              {canCall && (
                <button
                  className="action-btn call"
                  onClick={() => { handleButtonClick(); takeAction(BET_ACTIONS.CALL, callAmount); }}
                  onMouseEnter={handleButtonHover}
                >
                  Call ${callAmount}
                </button>
              )}
              {canRaise && (
                <>
                  <div className="raise-control">
                    <input
                      type="range"
                      min={minRaise}
                      max={myChips}
                      value={Math.min(Math.max(raiseAmount, minRaise), myChips)}
                      onChange={(e) => setRaiseAmount(Number(e.target.value))}
                      className="raise-slider"
                    />
                    <span className="raise-amount">${Math.min(Math.max(raiseAmount, minRaise), myChips)}</span>
                  </div>
                  <button
                    className="action-btn raise"
                    onClick={() => { handleButtonClick(); takeAction(BET_ACTIONS.RAISE, Math.min(Math.max(raiseAmount, minRaise), myChips)); }}
                    onMouseEnter={handleButtonHover}
                  >
                    Raise ${Math.min(Math.max(raiseAmount, minRaise), myChips)}
                  </button>
                  <button
                    className="action-btn all-in"
                    onClick={() => { handleButtonClick(); takeAction(BET_ACTIONS.ALL_IN, myChips); }}
                    onMouseEnter={handleButtonHover}
                  >
                    All In (${myChips})
                  </button>
                </>
              )}
              <button
                className="action-btn fold"
                onClick={() => { handleButtonClick(); takeAction(BET_ACTIONS.FOLD); }}
                onMouseEnter={handleButtonHover}
              >
                Fold
              </button>
            </div>
          ) : gameState.phase !== PHASES.SHOWDOWN ? (
            <div className="waiting-message">{isMyTurn ? 'Acting...' : `Waiting for ${currentPlayer?.username || 'player'}...`}</div>
          ) : null}

          {gameState.phase === PHASES.SHOWDOWN && (
            <div className="showdown-message">
              <TrophyIcon width={24} />
              {gameState.winner && gameState.winningHand
                ? `Winner! ${gameState.winningHand}`
                : 'Showdown! Determining winner...'}
            </div>
          )}
        </div>
      </div>

      <div className="poker-notifications">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className={`poker-notification ${notif.type}`}
            >
              {notif.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default PokerNightActivity
