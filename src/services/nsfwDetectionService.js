import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-wasm'

const MODEL_BASE = '/models/nsfw'
const MODEL_VERSION = 'nsfw-tfjs-local-1.0'
const POLICY_VERSION = 'nsfw-gate-2026-02'
const INPUT_SIZE = 224
// NSFWJS class order:
// [0]=Drawing, [1]=Hentai, [2]=Neutral, [3]=Porn, [4]=Sexy
const NSFW_CLASS_INDEXES = [1, 3, 4]

const ADULT_THRESHOLD = 0.9
const MINOR_THRESHOLD = 0.6

let backendReadyPromise = null
let modelPromise = null
let loadedVariant = null

const isImageFile = (file) => {
  const name = String(file?.name || '')
  const type = String(file?.type || '')
  return type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name)
}

const ensureBackendReady = async () => {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      try {
        await tf.setBackend('webgpu')
      } catch {
        try {
          await tf.setBackend('wasm')
        } catch {
          try {
            await tf.setBackend('webgl')
          } catch {
            await tf.setBackend('cpu')
          }
        }
      }
      await tf.ready()
    })()
  }
  return backendReadyPromise
}

const readConfiguredVariant = () => {
  const candidate = (typeof localStorage !== 'undefined' && localStorage.getItem('nsfw_model_variant')) || 'mobilenet_v2'
  const allowed = new Set(['mobilenet_v2', 'mobilenet_v2_mid', 'inception_v3'])
  return allowed.has(candidate) ? candidate : 'mobilenet_v2'
}

const resolveModelUrl = (variant) => {
  if (variant === 'mobilenet_v2') return `${MODEL_BASE}/model.json`
  return `${MODEL_BASE}/${variant}/model.json`
}

const loadModel = async () => {
  const variant = readConfiguredVariant()
  if (!modelPromise || loadedVariant !== variant) {
    modelPromise = (async () => {
      await ensureBackendReady()
      const modelUrl = resolveModelUrl(variant)
      const model = await tf.loadGraphModel(modelUrl)
      loadedVariant = variant
      return model
    })()
  }
  return modelPromise
}

const readProbability = async (prediction) => {
  const outputTensor = Array.isArray(prediction) ? prediction[0] : prediction
  const values = await outputTensor.data()
  if (!values || values.length === 0) return 1
  if (values.length === 1) return values[0]
  if (values.length >= 5) {
    return Math.max(...NSFW_CLASS_INDEXES.map((i) => values[i] || 0))
  }
  return values[values.length - 1]
}

const classifyImageSource = async (source, { threshold, failClosed }) => {
  const checkedAt = new Date().toISOString()
  try {
    const model = await loadModel()
    const payload = tf.tidy(() => {
      const pixels = tf.browser.fromPixels(source).toFloat()
      const resized = tf.image.resizeBilinear(pixels, [INPUT_SIZE, INPUT_SIZE])
      // Match NSFWJS preprocessing for MobileNet models.
      const normalized = resized.div(255).sub(0.5).mul(2).expandDims(0)
      return model.predict(normalized)
    })

    const confidence = await readProbability(payload)
    if (Array.isArray(payload)) {
      payload.forEach((tensor) => tensor.dispose())
    } else if (payload?.dispose) {
      payload.dispose()
    }

    return {
      nsfw: confidence >= threshold,
      confidence,
      threshold,
      modelVersion: MODEL_VERSION,
      policyVersion: POLICY_VERSION,
      checkedAt,
      status: 'ok'
    }
  } catch {
    return {
      nsfw: !!failClosed,
      confidence: null,
      threshold,
      modelVersion: MODEL_VERSION,
      policyVersion: POLICY_VERSION,
      checkedAt,
      status: 'model_unavailable'
    }
  }
}

const loadImageFromBlob = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(url)
    resolve(img)
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('image_load_failed'))
  }
  img.src = url
})

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const classifyImageFileForNsfw = async (file, opts = {}) => {
  const threshold = opts.threshold ?? ADULT_THRESHOLD
  const failClosed = opts.failClosed ?? false
  const maxRetries = opts.maxRetries ?? 3
  
  if (!isImageFile(file)) return null
  
  let lastError = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const image = await loadImageFromBlob(file)
      const result = await classifyImageSource(image, { threshold, failClosed })
      if (result.status === 'ok' || result.status === 'model_unavailable') {
        return result
      }
      lastError = new Error(result.status)
    } catch (err) {
      lastError = err
    }
    
    if (attempt < maxRetries) {
      await sleep(500 * attempt)
    }
  }
  
  return {
    nsfw: failClosed,
    confidence: null,
    threshold,
    modelVersion: MODEL_VERSION,
    policyVersion: POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    status: 'scan_failed'
  }
}

export const classifyImageUrlForNsfw = async (url, opts = {}) => {
  const threshold = opts.threshold ?? ADULT_THRESHOLD
  const failClosed = opts.failClosed ?? false
  const maxRetries = opts.maxRetries ?? 3
  
  let lastError = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        if (attempt === maxRetries) {
          return {
            nsfw: failClosed,
            confidence: null,
            threshold,
            modelVersion: MODEL_VERSION,
            policyVersion: POLICY_VERSION,
            checkedAt: new Date().toISOString(),
            status: 'fetch_failed'
          }
        }
        await sleep(500 * attempt)
        continue
      }
      
      const blob = await response.blob()
      const image = await loadImageFromBlob(blob)
      const result = await classifyImageSource(image, { threshold, failClosed })
      
      if (result.status === 'ok' || result.status === 'model_unavailable') {
        return result
      }
      lastError = new Error(result.status)
    } catch (err) {
      lastError = err
    }
    
    if (attempt < maxRetries) {
      await sleep(500 * attempt)
    }
  }
  
  return {
    nsfw: failClosed,
    confidence: null,
    threshold,
    modelVersion: MODEL_VERSION,
    policyVersion: POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    status: 'scan_failed'
  }
}

export const scanSelectedImageFiles = async (files = []) => {
  const list = Array.isArray(files) ? files : Array.from(files || [])
  const results = await Promise.all(list.map(async (file) => {
    if (!isImageFile(file)) return null
    return await classifyImageFileForNsfw(file, { threshold: ADULT_THRESHOLD, failClosed: false, maxRetries: 3 })
  }))
  return results
}

export const buildTransmitContentFlags = (scanResult) => ({
  nsfw: !!scanResult?.nsfw,
  policyVersion: scanResult?.policyVersion || POLICY_VERSION
})

export const getNsfwThresholds = () => ({
  adult: ADULT_THRESHOLD,
  minor: MINOR_THRESHOLD
})

export const getNsfwPolicyVersion = () => POLICY_VERSION

export const getAvailableNsfwModelVariants = () => ([
  { id: 'mobilenet_v2', label: 'MobileNet V2 (fast)' },
  { id: 'mobilenet_v2_mid', label: 'MobileNet V2 Mid (balanced)' },
  { id: 'inception_v3', label: 'Inception V3 (heavier)' }
])
