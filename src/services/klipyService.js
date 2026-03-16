import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const isTrackingEnabled = () => {
  return localStorage.getItem('klipy_tracking') === 'true'
}

export const setTrackingEnabled = (enabled) => {
  localStorage.setItem('klipy_tracking', enabled ? 'true' : 'false')
}

const getEndpoint = (type) => type === 'gifs' ? '' : type

const searchContent = async (type, query, page = 1, perPage = 24) => {
  const endpoint = getEndpoint(type)
  const response = await api.get(`/gifs${endpoint}/search`, {
    params: {
      q: query,
      pos: page,
      limit: perPage,
      tracking: isTrackingEnabled()
    }
  })
  return response.data
}

const getTrendingContent = async (type, page = 1, perPage = 24) => {
  const endpoint = getEndpoint(type)
  const response = await api.get(`/gifs${endpoint}/trending`, {
    params: {
      page,
      limit: perPage,
      tracking: isTrackingEnabled()
    }
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
  try {
    const response = await api.post(`/gifs${endpoint}/share/${slug}`, {}, {
      params: { tracking: true }
    })
    return response.data
  } catch (error) {
    console.log('Share tracking failed:', error)
    return { result: true, tracked: false }
  }
}

export const searchGifs = (query, page, perPage) => searchContent('gifs', query, page, perPage)
export const getTrendingGifs = (page, perPage) => getTrendingContent('gifs', page, perPage)
export const getGifCategories = () => getContentCategories('gifs')
export const shareGif = (slug) => shareContent('gifs', slug)

export const searchStickers = (query, page, perPage) => searchContent('stickers', query, page, perPage)
export const getTrendingStickers = (page, perPage) => getTrendingContent('stickers', page, perPage)
export const getStickerCategories = () => getContentCategories('stickers')
export const shareSticker = (slug) => shareContent('stickers', slug)

export const searchClips = (query, page, perPage) => searchContent('clips', query, page, perPage)
export const getTrendingClips = (page, perPage) => getTrendingContent('clips', page, perPage)
export const getClipCategories = () => getContentCategories('clips')
export const shareClip = (slug) => shareContent('clips', slug)

export const searchMemes = (query, page, perPage) => searchContent('memes', query, page, perPage)
export const getTrendingMemes = (page, perPage) => getTrendingContent('memes', page, perPage)
export const getMemeCategories = () => getContentCategories('memes')
export const shareMeme = (slug) => shareContent('memes', slug)
