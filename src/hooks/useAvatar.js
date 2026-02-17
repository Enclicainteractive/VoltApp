import { useState, useEffect } from 'react'

const imageCache = new Map()

export const useAvatar = (avatarUrl) => {
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!avatarUrl) {
      setAvatarSrc(null)
      return
    }

    if (avatarUrl.startsWith('data:')) {
      setAvatarSrc(avatarUrl)
      return
    }

    if (imageCache.has(avatarUrl)) {
      setAvatarSrc(imageCache.get(avatarUrl))
      return
    }

    const fetchAvatar = async () => {
      setLoading(true)
      try {
        const response = await fetch(avatarUrl)
        const contentType = response.headers.get('content-type')
        
        if (contentType?.includes('application/json')) {
          const json = await response.json()
          if (json.data) {
            const src = json.data.startsWith('data:') ? json.data : `data:image/png;base64,${json.data}`
            imageCache.set(avatarUrl, src)
            setAvatarSrc(src)
          }
        } else if (contentType?.startsWith('image/')) {
          imageCache.set(avatarUrl, avatarUrl)
          setAvatarSrc(avatarUrl)
        } else {
          imageCache.set(avatarUrl, avatarUrl)
          setAvatarSrc(avatarUrl)
        }
      } catch (err) {
        console.error('[Avatar] Failed to load:', err)
        setAvatarSrc(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAvatar()
  }, [avatarUrl])

  return { avatarSrc, loading }
}

export const useBanner = (bannerUrl) => {
  const [bannerSrc, setBannerSrc] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bannerUrl) {
      setBannerSrc(null)
      return
    }

    if (bannerUrl.startsWith('data:')) {
      setBannerSrc(bannerUrl)
      return
    }

    if (imageCache.has(bannerUrl)) {
      setBannerSrc(imageCache.get(bannerUrl))
      return
    }

    const fetchBanner = async () => {
      setLoading(true)
      try {
        const response = await fetch(bannerUrl)
        const contentType = response.headers.get('content-type')
        
        if (contentType?.includes('application/json')) {
          const json = await response.json()
          if (json.data) {
            const src = json.data.startsWith('data:') ? json.data : `data:image/png;base64,${json.data}`
            imageCache.set(bannerUrl, src)
            setBannerSrc(src)
          }
        } else if (contentType?.startsWith('image/')) {
          imageCache.set(bannerUrl, bannerUrl)
          setBannerSrc(bannerUrl)
        } else {
          imageCache.set(bannerUrl, bannerUrl)
          setBannerSrc(bannerUrl)
        }
      } catch (err) {
        console.error('[Banner] Failed to load:', err)
        setBannerSrc(null)
      } finally {
        setLoading(false)
      }
    }

    fetchBanner()
  }, [bannerUrl])

  return { bannerSrc, loading }
}

export const fetchImageUrl = async (url) => {
  if (!url) return null
  if (url.startsWith('data:')) return url
  if (imageCache.has(url)) return imageCache.get(url)

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      const json = await response.json()
      if (json.data) {
        const src = json.data.startsWith('data:') ? json.data : `data:image/png;base64,${json.data}`
        imageCache.set(url, src)
        return src
      }
    }
    imageCache.set(url, url)
    return url
  } catch {
    return null
  }
}
