const PUSH_NOTIFICATIONS_KEY = 'voltchat_push_subscription'

export const pushService = {
  async register() {
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
    try {
      const registration = await navigator.serviceWorker.ready
      return await registration.pushManager.getSubscription()
    } catch (err) {
      console.error('[Push] Get subscription failed:', err)
      return null
    }
  },

  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window
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
