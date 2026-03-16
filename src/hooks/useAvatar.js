import { useState, useEffect, useRef } from 'react'
import { getStoredServer, rewriteUrlForDesktop } from '../services/serverConfig'

const imageCache = new Map()
const FAILED_CACHE_MS = 60 * 1000

const isLocalDevHost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '::1'
const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/

const normalizeInlineImage = (value) => {
  if (!value || typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.length > 64 && BASE64_RE.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/\s+/g, '')}`
  }
  return trimmed
}

const normalizeImageUrl = (url) => {
  if (!url) return url
  const inline = normalizeInlineImage(url)
  const rewrittenUrl = rewriteUrlForDesktop(inline)
  if (!rewrittenUrl || rewrittenUrl.startsWith('data:')) return rewrittenUrl

  try {
    const parsed = new URL(rewrittenUrl)
    if (!isLocalDevHost(parsed.hostname)) return rewrittenUrl

    const activeServer = getStoredServer()
    const activeApiUrl = activeServer?.apiUrl
    if (!activeApiUrl) return rewrittenUrl

    const activeBase = new URL(activeApiUrl)
    if (!isLocalDevHost(activeBase.hostname)) {
      return `${activeBase.origin}${parsed.pathname}${parsed.search}`
    }
  } catch {
    return rewrittenUrl
  }

  return rewrittenUrl
}

const fetchImage = async (url, isLastAttempt = false) => {
  if (!url || url.startsWith('data:')) {
    return { src: url, success: true }
  }

  const normalizedUrl = normalizeImageUrl(url)
  
  if (imageCache.has(normalizedUrl)) {
    const cached = imageCache.get(normalizedUrl)
    if (cached?.failed) {
      if (isLastAttempt || Date.now() - cached.ts < FAILED_CACHE_MS) {
        return { src: null, success: false, final: isLastAttempt }
      }
      imageCache.delete(normalizedUrl)
    } else {
      return { src: cached?.src || null, success: true }
    }
  }

  try {
    const response = await fetch(normalizedUrl)
    if (!response.ok) {
      throw new Error(`Image fetch failed with status ${response.status}`)
    }
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      const json = await response.json()
      const payload = json.data || json.imageUrl || json.image || json.url || null
      if (payload) {
        const src = normalizeInlineImage(payload)
        imageCache.set(normalizedUrl, { src, ts: Date.now(), failed: false })
        return { src, success: true }
      }
    } else if (contentType?.startsWith('image/')) {
      imageCache.set(normalizedUrl, { src: normalizedUrl, ts: Date.now(), failed: false })
      return { src: normalizedUrl, success: true }
    } else {
      imageCache.set(normalizedUrl, { src: normalizedUrl, ts: Date.now(), failed: false })
      return { src: normalizedUrl, success: true }
    }
  } catch (err) {
    imageCache.set(normalizedUrl, { src: null, ts: Date.now(), failed: true })
    return { src: null, success: false, final: isLastAttempt }
  }

  return { src: null, success: false, final: isLastAttempt }
}

export const useAvatar = (avatarUrl, fallbackUrls = []) => {
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!avatarUrl && (!fallbackUrls || fallbackUrls.length === 0)) {
      setAvatarSrc(null)
      return
    }

    const urls = avatarUrl ? [avatarUrl, ...fallbackUrls] : fallbackUrls
    abortRef.current = false

    const fetchAvatar = async () => {
      setLoading(true)
      
      for (let i = 0; i < urls.length; i++) {
        if (abortRef.current) break
        
        const url = urls[i]
        const isLast = i === urls.length - 1
        const result = await fetchImage(url, isLast)
        
        if (result.success && result.src) {
          setAvatarSrc(result.src)
          setLoading(false)
          return
        }
        
        if (result.final || (!result.success && isLast)) {
          console.log('[Avatar] All sources failed, using fallback')
          setAvatarSrc(null)
        }
      }
      
      setLoading(false)
    }

    fetchAvatar()

    return () => {
      abortRef.current = true
    }
  }, [avatarUrl, ...fallbackUrls])

  return { avatarSrc, loading }
}

export const useBanner = (bannerUrl, fallbackUrls = []) => {
  const [bannerSrc, setBannerSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!bannerUrl && (!fallbackUrls || fallbackUrls.length === 0)) {
      setBannerSrc(null)
      return
    }

    const urls = bannerUrl ? [bannerUrl, ...fallbackUrls] : fallbackUrls
    abortRef.current = false

    const fetchBanner = async () => {
      setLoading(true)
      
      for (let i = 0; i < urls.length; i++) {
        if (abortRef.current) break
        
        const url = urls[i]
        const isLast = i === urls.length - 1
        const result = await fetchImage(url, isLast)
        
        if (result.success && result.src) {
          setBannerSrc(result.src)
          setLoading(false)
          return
        }
        
        if (result.final || (!result.success && isLast)) {
          console.log('[Banner] All sources failed, using fallback')
          setBannerSrc(null)
        }
      }
      
      setLoading(false)
    }

    fetchBanner()

    return () => {
      abortRef.current = true
    }
  }, [bannerUrl, ...fallbackUrls])

  return { bannerSrc, loading }
}

export const fetchImageUrl = async (url) => {
  if (!url) return null
  
  const rewrittenUrl = normalizeImageUrl(url)
  
  if (rewrittenUrl.startsWith('data:')) return rewrittenUrl
  if (imageCache.has(rewrittenUrl)) {
    const cached = imageCache.get(rewrittenUrl)
    if (cached?.failed && Date.now() - cached.ts < FAILED_CACHE_MS) return null
    if (cached?.failed) imageCache.delete(rewrittenUrl)
    else return cached?.src || null
  }

  try {
    const response = await fetch(rewrittenUrl)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      const json = await response.json()
      const payload = json.data || json.imageUrl || json.image || json.url || null
      if (payload) {
        const src = normalizeInlineImage(payload)
        imageCache.set(rewrittenUrl, { src, ts: Date.now(), failed: false })
        return src
      }
    }
    imageCache.set(rewrittenUrl, { src: rewrittenUrl, ts: Date.now(), failed: false })
    return rewrittenUrl
  } catch {
    imageCache.set(rewrittenUrl, { src: null, ts: Date.now(), failed: true })
    return null
  }
}
