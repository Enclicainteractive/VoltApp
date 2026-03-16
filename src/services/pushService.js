const PUSH_NOTIFICATIONS_KEY = 'voltchat_push_subscription'

const isDesktop = () => {
  return typeof window !== 'undefined' && window.__IS_DESKTOP_APP__ === true
}

export const pushService = {
  async ensurePermission() {
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return false
    }

    if (window.Notification.permission === 'granted') return true
    if (window.Notification.permission === 'denied') return false

    try {
      const result = await window.Notification.requestPermission()
      return result === 'granted'
    } catch (err) {
      console.error('[Push] Notification permission request failed:', err)
      return false
    }
  },

  async register() {
    // Service Workers don't work properly in Electron
    // Use Electron's native notifications instead
    if (isDesktop()) {
      console.log('[Push] Desktop mode - using native Electron notifications')
      return { isDesktop: true }
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] Service Worker or Push Manager not supported')
      return null
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })
      console.log('[Push] Service Worker registered:', registration.scope)
      return registration
    } catch (err) {
      console.error('[Push] Service Worker registration failed:', err)
      return null
    }
  },

  async subscribe(registration, vapidPublicKey) {
    // Desktop uses native notifications
    if (isDesktop() || (registration && registration.isDesktop)) {
      console.log('[Push] Using native desktop notifications')
      localStorage.setItem(PUSH_NOTIFICATIONS_KEY, JSON.stringify({ desktop: true, enabled: true }))
      return { desktop: true }
    }

    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
      })
      console.log('[Push] Push subscription successful')
      localStorage.setItem(PUSH_NOTIFICATIONS_KEY, JSON.stringify(subscription))
      return subscription
    } catch (err) {
      console.error('[Push] Push subscription failed:', err)
      return null
    }
  },

  async unsubscribe() {
    // Desktop uses native notifications
    if (isDesktop()) {
      console.log('[Push] Desktop mode - native notifications remain enabled')
      localStorage.removeItem(PUSH_NOTIFICATIONS_KEY)
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        console.log('[Push] Push subscription removed')
      }
      localStorage.removeItem(PUSH_NOTIFICATIONS_KEY)
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
    }
  },

  async getSubscription() {
    // Desktop uses native notifications
    if (isDesktop()) {
      const stored = localStorage.getItem(PUSH_NOTIFICATIONS_KEY)
      if (stored) {
        return { desktop: true, enabled: true }
      }
      return null
    }

    try {
      const registration = await navigator.serviceWorker.ready
      return await registration.pushManager.getSubscription()
    } catch (err) {
      console.error('[Push] Get subscription failed:', err)
      return null
    }
  },

  isSupported() {
    // Always supported in desktop mode via native notifications
    if (isDesktop()) return true
    return 'serviceWorker' in navigator && 'PushManager' in window
  },

  // Show native desktop notification
  async showNativeNotification(title, options = {}) {
    if (isDesktop() && window.electron?.showNotification) {
      return await window.electron.showNotification({
        title,
        body: options.body || '',
        icon: options.icon,
        deeplink: options.data?.url
      })
    }
    return null
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }
}
