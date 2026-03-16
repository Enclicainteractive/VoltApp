const POLICY_VERSION = 'child-safety-2026-02'
const MODEL_VERSION = 'safety-multilabel-2.1-tfjs'
const TEXT_MODEL_PATH = '/models/safety/text/model.json'
const IMAGE_MODEL_PATH = '/models/safety/image/model.json'
const ENABLE_IMAGE_MODEL_WARMUP = false

const THRESHOLDS = {
  sexualizedMinorRisk: 0.7,
  sexualContent: 0.85,
  groomingRisk: 0.7,
  coercionThreats: 0.7,
  selfHarmEncouragement: 0.7,
  nsfw: 0.75,
  violenceGore: 0.75
}

const SEXUAL_TERMS = ['sex', 'nude', 'nudes', 'naked', 'porn', 'xxx', 'blowjob', 'handjob', 'fuck', 'cum', 'dick', 'pussy']
const MINOR_TERMS = ['kid', 'child', 'underage', 'young girl', 'young boy', 'minor', '13 yo', '14 yo', '15 yo', '13 years old', '14 years old', '15 years old']
const GROOMING_TERMS = ['dont tell your parents', 'secret chat', 'private chat only', 'meet alone', 'come alone', 'send me nudes', 'send me pics']
const THREAT_TERMS = ['i will hurt you', 'i will kill you', 'i will find you', 'do this or i will', 'blackmail', 'extort', 'leak your pics']
const SELF_HARM_TERMS = ['kill yourself', 'kys', 'go die', 'self harm', 'cut yourself', 'end it all']

const NSFW_FILE_TERMS = ['nsfw', 'nude', 'porn', 'xxx']
const MINOR_RISK_FILE_TERMS = ['underage', 'young', 'minor', 'schoolgirl']
const GORE_FILE_TERMS = ['gore', 'blood', 'behead']

const fileNameOf = (a) => `${a?.name || ''} ${a?.filename || ''} ${a?.url || ''}`
const toNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

let _tf = null
let _tfReady = null
let _textModel = null
let _textModelLoad = null
let _textModelUnavailable = false
let _imageModel = null
let _imageModelLoad = null
let _nsfw = null
let _nsfwLoad = null

export const getPolicyVersion = () => POLICY_VERSION
export const getModelVersion = () => MODEL_VERSION

const warmupPromise = (factory) => {
  try {
    return factory().catch(() => null)
  } catch {
    return Promise.resolve(null)
  }
}

const ensureTf = async () => {
  if (_tf) return _tf
  if (_tfReady) return _tfReady

  _tfReady = (async () => {
    const tf = await import('@tensorflow/tfjs')
    try { await import('@tensorflow/tfjs-backend-webgpu') } catch {}
    try { await import('@tensorflow/tfjs-backend-wasm') } catch {}

    const backends = ['webgpu', 'wasm', 'webgl', 'cpu']
    for (const backend of backends) {
      try {
        await tf.setBackend(backend)
        await tf.ready()
        break
      } catch {}
    }
    _tf = tf
    return tf
  })()

  return _tfReady
}

const loadModelFlexible = async (tf, path) => {
  try {
    return await tf.loadGraphModel(path)
  } catch {
    return await tf.loadLayersModel(path)
  }
}

const ensureTextModel = async () => {
  if (_textModel) return _textModel
  if (_textModelUnavailable) return null
  if (_textModelLoad) return _textModelLoad
  _textModelLoad = (async () => {
    try {
      const tf = await ensureTf()
      _textModel = await loadModelFlexible(tf, TEXT_MODEL_PATH)
      return _textModel
    } catch {
      _textModelUnavailable = true
      return null
    } finally {
      _textModelLoad = null
    }
  })()
  return _textModelLoad
}

const ensureImageModel = async () => {
  if (_imageModel) return _imageModel
  if (_imageModelLoad) return _imageModelLoad
  _imageModelLoad = (async () => {
    const tf = await ensureTf()
    _imageModel = await loadModelFlexible(tf, IMAGE_MODEL_PATH)
    return _imageModel
  })()
  return _imageModelLoad
}

const ensureNsfwModel = async () => {
  if (_nsfw) return _nsfw
  if (_nsfwLoad) return _nsfwLoad
  _nsfwLoad = (async () => {
    await ensureTf()
    const nsfwjs = await import('nsfwjs')
    // Uses the open bundled MobileNetV2 model packaged with nsfwjs.
    _nsfw = await nsfwjs.load('MobileNetV2')
    return _nsfw
  })()
  return _nsfwLoad
}

export const warmupSafetyModels = ({ text = true, images = true } = {}) => {
  if (text) {
    if (!_textModel && !_textModelLoad && !_textModelUnavailable) {
      warmupPromise(() => ensureTextModel())
    } else if (!_textModel && _textModelLoad) {
      warmupPromise(() => _textModelLoad)
    }
  }

  if (images && ENABLE_IMAGE_MODEL_WARMUP) {
    if (!_nsfw && !_nsfwLoad) {
      warmupPromise(() => ensureNsfwModel())
    } else if (!_nsfw && _nsfwLoad) {
      warmupPromise(() => _nsfwLoad)
    }
  }
}

const buildTextFeatureVector = (text) => {
  const value = String(text || '').toLowerCase()
  const vec = new Float32Array(64)
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const idx = (code + i) % vec.length
    vec[idx] += 1
  }
  const norm = Math.max(1, value.length)
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

const runTextModel = async (text, { allowBlocking = true } = {}) => {
  try {
    if (!allowBlocking && !_textModel && !_textModelUnavailable) {
      warmupSafetyModels({ text: true, images: false })
      return null
    }
    const tf = await ensureTf()
    const model = await ensureTextModel()
    if (!model) return null
    const vector = buildTextFeatureVector(text)
    const input = tf.tensor2d([Array.from(vector)], [1, vector.length], 'float32')
    const pred = model.predict(input)
    const outTensor = Array.isArray(pred) ? pred[0] : pred
    const out = Array.from(await outTensor.data())
    tf.dispose([input, pred])
    return {
      sexualContentText: toNumber(out[0]),
      groomingRisk: toNumber(out[1]),
      coercionThreats: toNumber(out[2]),
      selfHarmEncouragement: toNumber(out[3])
    }
  } catch {
    return null
  }
}

const loadImageElement = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = url
})

const runSingleImageModel = async (url) => {
  try {
    if (!url) return null
    const model = await ensureNsfwModel()
    if (!model) return null
    const img = await loadImageElement(url)
    const classifications = await model.classify(img)
    const score = (name) => {
      const hit = (classifications || []).find((c) => String(c?.className || '').toLowerCase() === name.toLowerCase())
      return toNumber(hit?.probability)
    }
    const porn = score('Porn')
    const sexy = score('Sexy')
    const hentai = score('Hentai')
    return {
      nsfw: Math.max(porn, sexy, hentai),
      sexualizedMinorRisk: Math.max(porn, hentai),
      violenceGore: 0
    }
  } catch {
    // Optional custom local image model fallback.
    try {
      const tf = await ensureTf()
      const model = await ensureImageModel()
      if (!model) return null
      const img = await loadImageElement(url)
      const result = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(img)
        const resized = tf.image.resizeBilinear(pixels, [224, 224])
        const normalized = resized.toFloat().div(255)
        const batched = normalized.expandDims(0)
        const pred = model.predict(batched)
        return Array.isArray(pred) ? pred[0] : pred
      })
      const out = Array.from(await result.data())
      result.dispose()
      return {
        nsfw: toNumber(out[0]),
        sexualizedMinorRisk: toNumber(out[1]),
        violenceGore: toNumber(out[2])
      }
    } catch {
      return null
    }
  }
}

export const analyzeTextSafety = (text = '') => {
  const value = String(text || '').toLowerCase()
  const has = (term) => value.includes(term)
  const sexualContentText = SEXUAL_TERMS.some(has)
  const minorTerm = MINOR_TERMS.some(has)
  const groomingRisk = GROOMING_TERMS.some(has) || (sexualContentText && minorTerm)
  const coercionThreats = THREAT_TERMS.some(has)
  const selfHarmEncouragement = SELF_HARM_TERMS.some(has)
  const explicitSexual = ['fuck', 'blowjob', 'handjob', 'cum', 'dick', 'pussy', 'nude', 'nudes'].some(has)

  return {
    sexualContentText,
    groomingRisk,
    coercionThreats,
    selfHarmEncouragement,
    explicitSexual
  }
}

export const analyzeAttachmentSafety = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments : []

  let nsfw = false
  let sexualizedMinorRisk = false
  let violenceGore = false

  for (const item of list) {
    const fileLabel = fileNameOf(item).toLowerCase()
    const has = (term) => fileLabel.includes(term)
    if (NSFW_FILE_TERMS.some(has)) nsfw = true
    if (MINOR_RISK_FILE_TERMS.some(has)) sexualizedMinorRisk = true
    if (GORE_FILE_TERMS.some(has)) violenceGore = true
  }

  return {
    nsfw,
    sexualizedMinorRisk,
    violenceGore
  }
}

const mergeTextSignals = (heuristic, modelScore) => {
  if (!modelScore) return heuristic
  return {
    ...heuristic,
    sexualContentText: heuristic.sexualContentText || modelScore.sexualContentText >= THRESHOLDS.sexualContent,
    groomingRisk: heuristic.groomingRisk || modelScore.groomingRisk >= THRESHOLDS.groomingRisk,
    coercionThreats: heuristic.coercionThreats || modelScore.coercionThreats >= THRESHOLDS.coercionThreats,
    selfHarmEncouragement: heuristic.selfHarmEncouragement || modelScore.selfHarmEncouragement >= THRESHOLDS.selfHarmEncouragement
  }
}

const mergeImageSignals = (heuristic, modelScore) => {
  if (!modelScore) return heuristic
  return {
    ...heuristic,
    nsfw: heuristic.nsfw || modelScore.nsfw >= THRESHOLDS.nsfw,
    sexualizedMinorRisk: heuristic.sexualizedMinorRisk || modelScore.sexualizedMinorRisk >= THRESHOLDS.sexualizedMinorRisk,
    violenceGore: heuristic.violenceGore || modelScore.violenceGore >= THRESHOLDS.violenceGore
  }
}

export const analyzeTextSafetyWithAI = async (text = '', options = {}) => {
  const heuristic = analyzeTextSafety(text)
  const modelScore = await runTextModel(text, options)
  return mergeTextSignals(heuristic, modelScore)
}

export const analyzeAttachmentSafetyWithAI = async (attachments = [], { allowBlocking = true } = {}) => {
  const heuristic = analyzeAttachmentSafety(attachments)
  const imageUrls = (Array.isArray(attachments) ? attachments : [])
    .map((a) => a?.url || a?.localUrl || null)
    .filter(Boolean)

  if (imageUrls.length === 0) return heuristic

  if (!allowBlocking && !_nsfw && !_imageModel) {
    warmupSafetyModels({ text: false, images: true })
    return heuristic
  }

  let merged = { ...heuristic }
  for (const url of imageUrls) {
    const modelScore = await runSingleImageModel(url)
    merged = mergeImageSignals(merged, modelScore)
  }
  return merged
}

export const buildContentFlags = ({ textAnalysis = {}, attachmentAnalysis = {} } = {}) => ({
  nsfw: !!attachmentAnalysis.nsfw,
  sexualizedMinorRisk: !!attachmentAnalysis.sexualizedMinorRisk,
  violenceGore: !!attachmentAnalysis.violenceGore,
  sexualContentText: !!textAnalysis.sexualContentText,
  groomingRisk: !!textAnalysis.groomingRisk,
  coercionThreats: !!textAnalysis.coercionThreats,
  selfHarmEncouragement: !!textAnalysis.selfHarmEncouragement,
  modelVersion: MODEL_VERSION,
  policyVersion: POLICY_VERSION,
  checkedAt: new Date().toISOString()
})

export const shouldEscalateThreat = (flags = {}) => {
  return !!(flags.coercionThreats || flags.groomingRisk || flags.selfHarmEncouragement)
}

export const evaluateSafetyPolicy = ({ flags = {}, recipient = {} } = {}) => {
  const isRecipientMinor = !!recipient.isMinor
  const isRecipientUnder16 = !!recipient.isUnder16
  const blockReasons = []

  if (flags.sexualizedMinorRisk) blockReasons.push('sexualized_minor_risk')
  if (flags.coercionThreats) blockReasons.push('coercion_threats')
  if (flags.selfHarmEncouragement) blockReasons.push('self_harm_encouragement')

  if (isRecipientMinor) {
    if (flags.nsfw) blockReasons.push('nsfw_to_minor')
    if (flags.groomingRisk) blockReasons.push('grooming_risk_to_minor')
    if (flags.sexualContentText) blockReasons.push('sexual_text_to_minor')
    // Borderline-to-flag behavior for minors.
    if (flags.violenceGore) blockReasons.push('gore_to_minor')
  }

  const shouldBlock = blockReasons.length > 0
  const shouldReport = shouldEscalateThreat(flags)

  return {
    shouldBlock,
    shouldReport,
    blockReasons,
    shouldAutoBanSender: isRecipientUnder16 && (flags.groomingRisk || flags.sexualizedMinorRisk || flags.coercionThreats)
  }
}

export const runSafetyScan = async ({ text = '', attachments = [], recipient = {}, allowBlockingModels = true } = {}) => {
  const [textAnalysis, attachmentAnalysis] = await Promise.all([
    analyzeTextSafetyWithAI(text, { allowBlocking: allowBlockingModels }),
    analyzeAttachmentSafetyWithAI(attachments, { allowBlocking: allowBlockingModels })
  ])
  const flags = buildContentFlags({ textAnalysis, attachmentAnalysis })
  const safety = evaluateSafetyPolicy({ flags, recipient })
  return { textAnalysis, attachmentAnalysis, flags, safety }
}

export const sha256Hex = async (value) => {
  if (!window?.crypto?.subtle) return null
  const data = new TextEncoder().encode(value)
  const hash = await window.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const buildClientSignature = async (payload) => {
  try {
    const stable = JSON.stringify(payload)
    return await sha256Hex(stable)
  } catch {
    return null
  }
}

export default {
  getPolicyVersion,
  getModelVersion,
  warmupSafetyModels,
  analyzeTextSafety,
  analyzeAttachmentSafety,
  analyzeTextSafetyWithAI,
  analyzeAttachmentSafetyWithAI,
  buildContentFlags,
  shouldEscalateThreat,
  evaluateSafetyPolicy,
  runSafetyScan,
  sha256Hex,
  buildClientSignature
}
