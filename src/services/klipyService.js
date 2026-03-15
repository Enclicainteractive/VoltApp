import axios from 'axios'
import { settingsService } from './settingsService'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const isAdsEnabled = () => {
  return localStorage.getItem('klipy_ads_enabled') === 'true' || settingsService.getSetting('klipyAdsEnabled') !== false
}

export const setAdsEnabled = (enabled) => {
  localStorage.setItem('klipy_ads_enabled', enabled ? 'true' : 'false')
}

export const isTrackingEnabled = () => {
  return localStorage.getItem('klipy_tracking') === 'true' || settingsService.getSetting('klipyTrackingEnabled') === true
}

export const setTrackingEnabled = (enabled) => {
  localStorage.setItem('klipy_tracking', enabled ? 'true' : 'false')
}

export const isAnonymousTracking = () => {
  return localStorage.getItem('klipy_anonymous_tracking') !== 'false' && settingsService.getSetting('klipyAnonymousTracking') !== false
}

export const setAnonymousTracking = (enabled) => {
  localStorage.setItem('klipy_anonymous_tracking', enabled ? 'true' : 'false')
}

const generateAnonymousId = () => {
  const existing = localStorage.getItem('klipy_anonymous_id')
  if (existing) return existing
  
  const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  localStorage.setItem('klipy_anonymous_id', anonymousId)
  return anonymousId
}

const getCustomerId = () => {
  if (!isTrackingEnabled()) return null
  if (isAnonymousTracking()) return generateAnonymousId()
  return settingsService.getSetting('userId') || null
}

const getEndpoint = (type) => {
  switch (type) {
    case 'stickers': return '/stickers'
    case 'clips': return '/clips'
    case 'memes': return '/memes'
    case 'gifs':
    default: return ''
  }
}

const CONTENT_TYPES = {
  gifs: { endpoint: 'gifs', formats: ['gif', 'webp', 'jpg', 'mp4', 'webm'] },
  stickers: { endpoint: 'stickers', formats: ['webp', 'png', 'gif'] },
  clips: { endpoint: 'clips', formats: ['mp4', 'webm'] },
  memes: { endpoint: 'memes', formats: ['webp', 'jpg', 'png'] }
}

const getAdParams = () => {
  if (!isAdsEnabled()) return {}
  
  const screen = window.screen
  const nav = navigator
  
  return {
    'ad-min-width': 50,
    'ad-max-width': Math.min(500, screen?.width || 500),
    'ad-min-height': 50,
    'ad-max-height': 250,
    'ad-device-w': screen?.width,
    'ad-device-h': screen?.height,
    'ad-ppi': screen?.availWidth > 0 ? Math.round(screen.availWidth / screen.availWidth) : 326,
    'ad-pxratio': window.devicePixelRatio || 1,
    'ad-language': navigator.language?.split('-')[0]?.toUpperCase() || 'EN',
    'ad-os': /Mobi|Android/i.test(navigator.userAgent) ? 'android' : /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'web',
    'ad-app-version': '1.0.0'
  }
}

const searchContent = async (type, query, page = 1, perPage = 24) => {
  const endpoint = getEndpoint(type)
  const customerId = getCustomerId()
  
  const params = {
    q: query,
    pos: page,
    limit: perPage,
    tracking: isTrackingEnabled()
  }
  
  if (customerId) {
    params.customer_id = customerId
  }
  
  if (isAdsEnabled()) {
    Object.assign(params, getAdParams())
  }
  
  const response = await api.get(`/gifs${endpoint}/search`, {
    params
  })
  return response.data
}

const getTrendingContent = async (type, page = 1, perPage = 24) => {
  const endpoint = getEndpoint(type)
  const customerId = getCustomerId()
  
  const params = {
    page,
    limit: perPage,
    tracking: isTrackingEnabled()
  }
  
  if (customerId) {
    params.customer_id = customerId
  }
  
  if (isAdsEnabled()) {
    Object.assign(params, getAdParams())
  }
  
  const response = await api.get(`/gifs${endpoint}/trending`, {
    params
  })
  return response.data
}

const getContentCategories = async (type) => {
  const endpoint = getEndpoint(type)
  const response = await api.get(`/gifs${endpoint}/categories`)
  return response.data
}

const shareContent = async (type, slug) => {
  if (!isTrackingEnabled()) return { result: true, tracked: false }
  
  const endpoint = getEndpoint(type)
  const customerId = getCustomerId()
  
  try {
    const response = await api.post(`/gifs${endpoint}/share/${slug}`, {}, {
      params: { tracking: true, customer_id: customerId }
    })
    return response.data
  } catch (error) {
    console.log('Share tracking failed:', error)
    return { result: true, tracked: false }
  }
}

const reportContent = async (type, slug, reason) => {
  const endpoint = getEndpoint(type)
  
  try {
    const response = await api.post(`/gifs${endpoint}/report/${slug}`, {
      reason
    })
    return response.data
  } catch (error) {
    console.log('Report failed:', error)
    return { result: false }
  }
}

// GIFs
export const searchGifs = (query, page, perPage) => searchContent('gifs', query, page, perPage)
export const getTrendingGifs = (page, perPage) => getTrendingContent('gifs', page, perPage)
export const getGifCategories = () => getContentCategories('gifs')
export const shareGif = (slug) => shareContent('gifs', slug)
export const reportGif = (slug, reason) => reportContent('gifs', slug, reason)

// Stickers
export const searchStickers = (query, page, perPage) => searchContent('stickers', query, page, perPage)
export const getTrendingStickers = (page, perPage) => getTrendingContent('stickers', page, perPage)
export const getStickerCategories = () => getContentCategories('stickers')
export const shareSticker = (slug) => shareContent('stickers', slug)
export const reportSticker = (slug, reason) => reportContent('stickers', slug, reason)

// Clips
export const searchClips = (query, page, perPage) => searchContent('clips', query, page, perPage)
export const getTrendingClips = (page, perPage) => getTrendingContent('clips', page, perPage)
export const getClipCategories = () => getContentCategories('clips')
export const shareClip = (slug) => shareContent('clips', slug)
export const reportClip = (slug, reason) => reportContent('clips', slug, reason)

// Memes
export const searchMemes = (query, page, perPage) => searchContent('memes', query, page, perPage)
export const getTrendingMemes = (page, perPage) => getTrendingContent('memes', page, perPage)
export const getMemeCategories = () => getContentCategories('memes')
export const shareMeme = (slug) => shareContent('memes', slug)
export const reportMeme = (slug, reason) => reportContent('memes', slug, reason)

// Utility
export { CONTENT_TYPES }
