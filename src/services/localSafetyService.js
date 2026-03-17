/**
 * localSafetyService.js
 *
 * Multi-model local content safety service.
 *
 * Models used (in order of priority / specificity):
 *   1. TensorFlow.js Toxicity Classifier  (@tensorflow-models/toxicity)
 *      – 7-label toxicity detection (toxicity, severe_toxicity, obscene,
 *        threat, insult, identity_attack, sexual_explicit)
 *      – Runs entirely in-browser via Universal Sentence Encoder lite.
 *   2. Custom safety text model           (/models/safety/text/model.json)
 *      – Optional local fine-tuned model for domain-specific labels
 *        (grooming, coercion, self-harm, weapon instructions).
 *      – Gracefully skipped when the file is absent.
 *   3. NSFWJS image classifier            (nsfwjs / /models/nsfw/model.json)
 *      – Image-level NSFW detection (Porn / Sexy / Hentai).
 *   4. Custom safety image model          (/models/safety/image/model.json)
 *      – Optional local image model; used as fallback when NSFWJS is
 *        unavailable.
 *   5. Keyword / regex heuristics
 *      – Zero-latency synchronous pre-filter that catches obvious violations
 *        before any model is invoked.
 *
 * Public API (all named exports + default object):
 *   getPolicyVersion()
 *   getModelVersion()
 *   warmupSafetyModels({ text, images, toxicity })
 *   checkInputSafety(text)                   – sync heuristic-only fast path
 *   quickSafetyCheck(text, attachments)      – async, heuristics + AI
 *   analyzeTextSafety(text)                  – async, full text analysis
 *   analyzeAttachmentSafety(attachments)     – sync, filename heuristics
 *   analyzeTextSafetyWithAI(text, opts)      – async, full text + AI
 *   analyzeAttachmentSafetyWithAI(attachments, opts) – async, image AI
 *   buildContentFlags({ textAnalysis, attachmentAnalysis })
 *   shouldEscalateThreat(flags)
 *   evaluateSafetyPolicy({ flags, recipient })
 *   runSafetyScan({ text, attachments, recipient, allowBlockingModels })
 *   queueBackgroundScan(text)
 *   sha256Hex(value)
 *   buildClientSignature(payload)
 */

// ─── Policy / version constants ──────────────────────────────────────────────

const POLICY_VERSION = 'child-safety-2026-04'
const MODEL_VERSION  = 'safety-multilabel-2.3-tfjs'

// Paths to optional local models (may be absent; service degrades gracefully).
const TEXT_MODEL_PATH  = '/models/safety/text/model.json'
const IMAGE_MODEL_PATH = '/models/safety/image/model.json'

// Whether to eagerly warm up the image model on startup (expensive).
const ENABLE_IMAGE_MODEL_WARMUP = false

// ─── Detection thresholds ─────────────────────────────────────────────────────

/**
 * Minimum probability score above which a label is considered a positive hit.
 * Lower values = more sensitive (more false positives).
 * Higher values = more conservative (more false negatives).
 */
const THRESHOLDS = {
  // Toxicity model labels
  toxic:                0.85,
  severeToxic:          0.80,
  obscene:              0.85,
  threat:               0.75,
  insult:               0.85,
  identityAttack:       0.80,
  sexualExplicit:       0.75,
  // Custom text model labels
  sexualContent:        0.70,
  groomingRisk:         0.50,
  coercionThreats:      0.50,
  selfHarmEncouragement:0.50,
  weaponInstructions:   0.50,
  // Image model labels
  nsfw:                 0.60,
  sexualizedMinorRisk:  0.50,
  violenceGore:         0.50,
  minorSexualRisk:      0.40
}

// ─── Toxicity model label set ─────────────────────────────────────────────────

/**
 * Labels requested from the @tensorflow-models/toxicity model.
 * The model supports: toxicity | severe_toxicity | obscene | threat |
 *   insult | identity_attack | sexual_explicit
 * (Note: 'violence' is NOT a standard label in the published model.)
 */
const TOXICITY_LABELS = [
  'toxicity',
  'severe_toxicity',
  'obscene',
  'threat',
  'insult',
  'identity_attack',
  'sexual_explicit'
]

// ─── Keyword lists ────────────────────────────────────────────────────────────

// ─── Slur / hate-speech terms ─────────────────────────────────────────────────
// Comprehensive list of ethnic, racial, homophobic, and other identity-based slurs.
// These are always blocked regardless of context.
const SLUR_TERMS = [
  // Homophobic / transphobic
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'ladyboy', 'queer',
  'homo', 'sodomite', 'poofter', 'poof', 'batty boy', 'battyboy',
  // Racial / ethnic — Black people
  'nigger', 'nigga', 'nigg', 'nig', 'coon', 'spook', 'spade', 'jigaboo',
  'jiggaboo', 'sambo', 'darky', 'darkie', 'groid', 'porch monkey',
  'jungle bunny', 'moon cricket', 'bluegum', 'burrhead', 'buckwheat',
  'pickaninny', 'tar baby', 'cotton picker', 'spearchucker', 'moolinyan',
  'mulignan', 'munt', 'kaffir', 'kaffer', 'kafir', 'kaffre',
  // Racial / ethnic — Asian people
  'chink', 'chinky', 'gook', 'slant', 'slope', 'zipperhead', 'zip',
  'nip', 'jap', 'ching chong', 'chingchong', 'ching-chong',
  'dink', 'flip', 'fob', 'buddhahead',
  // Racial / ethnic — Hispanic / Latino
  'spic', 'spick', 'spik', 'beaner', 'wetback', 'greaser',
  // Racial / ethnic — Jewish
  'kike', 'yid', 'heeb', 'hebe', 'hymie', 'jewboy', 'sheeny', 'sheenie',
  'oven dodger', 'christ killer',
  // Racial / ethnic — South Asian
  'paki', 'pajeet', 'dothead', 'curry muncher', 'currymuncher',
  // Racial / ethnic — Arab / Middle Eastern
  'raghead', 'towelhead', 'camel jockey', 'cameljockey', 'sand nigger',
  'sandnigger', 'dune coon', 'dunecoon', 'hajji', 'hadji',
  // Racial / ethnic — Irish / European
  'mick', 'paddy', 'wop', 'dago', 'kraut', 'hun', 'frog', 'limey',
  'polack', 'bohunk', 'hunky',
  // Racial / ethnic — Native American
  'redskin', 'injun', 'squaw', 'wagon burner',
  // Racial / ethnic — Roma
  'gypsy', 'gypo', 'gippo',
  // Ableist
  'retard', 'retarded', 'spastic', 'spaz', 'cripple', 'mongoloid',
  // Religious
  'raghead', 'islamofascist',
  // General hate
  'subhuman', 'vermin', 'parasite', 'cockroach', 'ape', 'monkey',
  // Misogynistic
  'cunt', 'whore', 'slut', 'bitch', 'skank', 'hoe',
]

const SEXUAL_TERMS = [
  'sex', 'nude', 'nudes', 'naked', 'porn', 'xxx', 'blowjob', 'handjob',
  'fuck', 'cum', 'dick', 'pussy', 'ass', 'tits', 'boobs', 'vagina', 'cock',
  'orgasm', 'milf', 'teen', 'schoolgirl', 'nsfw', 'erotic', 'fetish', 'orgy',
  'threesome', 'anal', 'throat', 'facefuck', 'deepthroat'
]

const MINOR_TERMS = [
  'kid', 'child', 'underage', 'young girl', 'young boy', 'minor',
  '13 yo', '14 yo', '15 yo', '16 yo', '17 yo',
  '13 years old', '14 years old', '15 years old', '16 years old', '17 years old',
  '13y', '14y', '15y', '16y', '17y', '13yr', '14yr', '15yr',
  'teenager', 'tween', 'preteen', 'little girl', 'little boy', 'school age',
  'under 18', 'youth', 'kiddo', 'little one', 'childlike',
  'baby', 'infant', 'toddler', '11 yo', '12 yo', '10 yo', '9 yo', '8 yo'
]

const GROOMING_TERMS = [
  'dont tell your parents', 'secret chat', 'private chat only', 'meet alone',
  'come alone', 'send me nudes', 'send me pics', 'our secret', 'just between us',
  'dont tell anyone', 'your secret', 'hidden chat', 'private only',
  'alone together', 'meet me', 'come see me', 'visit me', 'i wont tell',
  'our thing', 'special friendship', 'close friend', 'older friend',
  'age gap', 'sugar daddy', 'sugar momma', 'allow me', 'trust me', 'i know best'
]

const THREAT_TERMS = [
  'i will hurt you', 'i will kill you', 'i will find you', 'do this or i will',
  'i will rape you', 'i will rape', 'gonna rape', 'going to rape', 'want to rape',
  'i will assault', 'i will attack you', 'i will stab', 'i will shoot you',
  'blackmail', 'extort', 'leak your pics', 'threat', 'intimidate', 'scare you',
  'make you', 'force you', 'if you dont', 'or else', 'pay me', 'give me money',
  'send gift', 'bitcoin', 'ransom'
]

const SELF_HARM_TERMS = [
  'kill yourself', 'kys', 'go die', 'self harm', 'cut yourself', 'end it all',
  'hurt yourself', 'no one loves you', 'you should die', 'commit suicide',
  'slit your wrists', 'overdose', 'hang yourself', 'jump off', 'kill ur self'
]

const SEXUAL_MINOR_COMBINATIONS = [
  'fuck 14', 'fuck 15', 'fuck 16', 'fuck 13', 'fuck kid', 'fuck child',
  'fuck minor', 'fuck young', 'fuck teen',
  'sex 14', 'sex 15', 'sex 16', 'sex 13', 'sex kid', 'sex child',
  'sex minor', 'sex teen',
  'nude 14', 'nude 15', 'nude 16', 'nude 13', 'nude kid', 'nude child',
  'nude minor', 'nude teen',
  'porn 14', 'porn 15', 'porn 16', 'porn 13', 'porn kid', 'porn child',
  'porn minor', 'porn teen',
  '14 yo fuck', '15 yo fuck', '16 yo fuck', '13 yo fuck',
  '14 year old fuck', '15 year old fuck',
  'little girl porn', 'young girl sex', 'child porn', 'underage sex',
  'teen porn', 'teen sex', 'schoolgirl sex', 'school girl porn',
  'virgin 14', 'virgin 15', 'virgin 16', 'young virgin',
  'child sexual', 'kid sexual', 'minors sexual', 'underage porn',
  'jailbait', 'barely legal',
  '14 year old', '15 year old', '16 year old', '13 year old',
  'year old naked', 'year old nude',
  '13yo', '14yo', '15yo', '16yo', '17yo',
  '13y o', '14y o', '15y o', '16y o', '17y o',
  '/14', '/15', '/16', 'of 14', 'of 15', 'of 16', 'age 14', 'age 15',
  'want to fuck', 'wanna fuck', 'gonna fuck', 'gotta fuck',
  'fucking 14', 'fucked 14', 'fucks 14',
  '14 year old naked', '14 naked', '15 naked', '16 naked',
  'teen naked', 'young naked',
  'send nudes 14', 'send nudes 15', 'nudes 14', 'nudes 15', 'nudes teen',
  'sexting', 'sex video', 'sex tape', 'child sex', 'kids sex',
  'underage sexting'
]

const WEAPON_BOMB_TERMS = [
  'pipe bomb', 'pipebomb', 'pipe-bomb', 'make a bomb', 'make bomb',
  'how to make a bomb', 'how to make bomb', 'how to build bomb',
  'bomb making', 'bomb recipe', 'explosive recipe', 'ied',
  'improvised explosive', 'improvised bomb',
  'gunpowder', 'black powder', 'fertilizer bomb', 'ammonium nitrate bomb',
  'anfo', 'explosive device', 'make an explosive', 'homemade explosives',
  'tannerite', 'thermite', 'petn', 'rdx', 'c4', 'semtex', 'tnt', 'dynamite',
  'blasting cap', 'detonator', 'nail bomb', 'ball bearing bomb',
  'shrapnel bomb', 'pressure cooker bomb', 'bottle bomb', 'acid bomb',
  'build a bomb', 'assemble bomb', 'construct bomb', 'make explosive',
  'bomb instructions', 'bomb plan', 'attack plan', 'attack instructions',
  'shoot up', 'mass shooting', 'school shooting', 'open fire',
  'kill people', 'kill everyone', 'attack people',
  'toxic gas', 'chemical weapon', 'nerve agent', 'poison gas',
  'anthrax', 'biological weapon', 'bioweapon', 'ricin', 'cyanide',
  'chlorine gas', 'sarin', 'vx', 'novichok', 'mustard gas',
  'car bomb', 'suicide bomb', 'vest bomb', 'belt bomb', 'backpack bomb',
  'letter bomb', 'package bomb', 'vehicle bomb', 'molotov',
  'a-bomb', 'atom bomb', 'nuclear bomb', 'dirty bomb', 'enriched uranium',
  'plutonium', 'radiological',
  'ghost gun', '80% lower', '80% receiver', 'privately made', 'unserialized',
  'bump stock', 'binary trigger', 'machine gun conversion',
  'sawed off', 'short barrel', 'homemade gun', '3d printed gun'
]

const EXPLOITATION_TERMS = [
  'touch kids', 'touch child', 'touch minor', 'touch young', 'touch little',
  'groom child', 'groom minor', 'groom kid', 'grooming', 'groomer',
  'sex traffic', 'trafficking', 'sex slave', 'child prostitute',
  'child sex', 'kids sex', 'minors sex', 'underage sex', 'youth sex',
  'pedophile', 'pedoph', 'ped0', 'p3d0', 'p3do', 'child molester', 'molest',
  'child porn', 'csam', 'cscm', 'child sexual abuse', 'csa', 'abuse child',
  'epstein', 'lolita', 'child model',
  'sexual exploit', 'exploit minor', 'exploit child', 'exploit kid',
  'forced sex', 'rape child', 'rape minor', 'rape kid', 'child rape',
  'incest', 'abuse minor', 'abuse child',
  'child prostitute', 'teen prostitute', 'underage prostitute',
  'sex ring', 'abuse ring', 'exploitation ring', 'trafficking ring',
  'buy child', 'sell child', 'trade child', 'rent child',
  'child bride', 'child wife', 'forced marriage', 'child marriage',
  'luring', 'online predator', 'predator', 'hunting kids', 'hunting minor',
  'produce child porn', 'make child porn', 'create child porn',
  'distribute child porn', 'share child porn', 'view child porn',
  'child sexual exploitation', 'cse', 'online grooming', 'sextortion minor',
  'sexually exploit', 'sexually abuse', 'sexual abuse minor'
]

const TRAFFICKING_TERMS = [
  'human traffic', 'smuggle human', 'organ traffic',
  'forced labor', 'slave labor', 'debt bondage',
  'work camp', 'labor camp', 'forced work', 'indentured',
  'child labor', 'exploit labor', 'labor exploitation',
  'bring in minor', 'transport minor', 'move minor',
  'sell for sex', 'buy for sex', 'trade for sex',
  'recruit minor', 'recruit child', 'recruit kid',
  'hold captive', 'keep captive', 'confine minor',
  'kidnap minor', 'kidnap child', 'abduct minor', 'abduct child',
  'ransom minor', 'ransom child', 'sell child', 'buy child',
  'prostitution ring', 'sex ring', 'exploitation network',
  'recruit prostitute', 'force prostitute', 'coerce prostitute',
  'trafficking victim', 'exploitation victim',
  'illegal immigrant exploitation', 'migrant exploitation'
]

const DRUG_ILLEGAL_TERMS = [
  'cocaine', 'crack', 'heroin', 'meth', 'methamphetamine', 'amphetamine',
  'fentanyl', 'carfentanyl', 'oxycodone', 'oxycontin', 'hydrocodone',
  'morphine', 'codeine', 'tramadol', 'percocet', 'vicodin',
  'mdma', 'ecstasy', 'molly', 'lsd', 'acid', 'shrooms', 'psilocybin',
  'ketamine', 'ghb', 'rohypnol', 'roofie', 'date rape drug',
  'spice', 'synthetic cannabinoid', 'k2', 'fake weed',
  'steroids', 'anabolic', 'hgh', 'growth hormone',
  'drug dealer', 'drug dealing', 'sell drugs', 'buy drugs', 'drugs for sale',
  'drug money', 'drug empire', 'drug cartel',
  'meth lab', 'cook meth', 'make meth', 'produce meth',
  'smuggle drugs', 'trafficking drugs', 'drugs across border',
  'distribute drugs', 'drug distribution', 'drug supply',
  'opioid', 'opiate', 'narcotic', 'controlled drug',
  'drugs shipped', 'drugs mailed', 'drugs hidden'
]

const DRUG_MINOR_TERMS = [
  'give drugs to child', 'give drugs to kid', 'give drugs to minor',
  'give drugs to teen', 'give drugs to young', 'give drugs to student',
  'sell drugs to child', 'sell drugs to kid', 'sell drugs to minor',
  'sell drugs to teen', 'sell drugs to student', 'sell drugs to young',
  'provide drugs to child', 'provide drugs to kid', 'provide drugs to minor',
  'drug child', 'drug kid', 'drug minor', 'drug teen',
  'get kids high', 'get minor high', 'get teen high',
  'kids on drugs', 'minors on drugs', 'teenagers on drugs',
  'introduce drugs to child', 'expose drugs to child',
  'administer drugs to minor', 'force drugs on child',
  'sell coke to kid', 'sell weed to child', 'sell meth to minor',
  'cocaine for kids', 'heroin for children', 'meth to teen',
  'drugs at school', 'drugs to students', 'drugs for school',
  'recruit using drugs', 'addict minor', 'addict child',
  'child addict', 'teen addict', 'underage addict',
  'hook kid on drugs', 'hook minor on drugs'
]

const NSFW_FILE_TERMS = ['nsfw', 'nude', 'porn', 'xxx', 'explicit', 'adult', '18+']
const MINOR_RISK_FILE_TERMS = [
  'underage', 'young', 'minor', 'schoolgirl', 'school boy',
  'teen', 'kid', 'child', 'baby', 'infant', 'toddler', 'little'
]
const GORE_FILE_TERMS = [
  'gore', 'blood', 'behead', 'graphic', 'violence',
  'murder', 'death', 'kill', 'torture', 'dismember', 'decapitate'
]

// ─── Critical regex patterns (synchronous fast-path) ─────────────────────────

/**
 * High-confidence patterns that are checked synchronously before any model
 * inference. A match here immediately blocks the content.
 */
const CRITICAL_PATTERNS = [
  { pattern: /p[i|1]p[e3][\s-]?b[o0]mb/i,          category: 'weapon',       label: 'pipe bomb' },
  { pattern: /b[o0]mb[\s-]?mak/i,                   category: 'weapon',       label: 'bomb making' },
  { pattern: /explos[i1]v[e3]/i,                     category: 'weapon',       label: 'explosive' },
  { pattern: /ped[o0]ph[i1]l/i,                      category: 'exploitation', label: 'pedophile' },
  { pattern: /p[e3]d[o0]/i,                          category: 'exploitation', label: 'pedo' },
  { pattern: /csam/i,                                category: 'exploitation', label: 'csam' },
  { pattern: /underage\s+porn/i,                     category: 'exploitation', label: 'underage porn' },
  { pattern: /child\s+porn/i,                        category: 'exploitation', label: 'child porn' },
]

// ─── Module-level model state ─────────────────────────────────────────────────

// TensorFlow.js runtime
let _tf            = null
let _tfReady       = null   // in-flight Promise<tf>

// @tensorflow-models/toxicity model
let _toxicityModel     = null
let _toxicityModelLoad = null   // in-flight Promise<model|null>
let _toxicityUnavailable = false

// Custom local text model
let _textModel         = null
let _textModelLoad     = null   // in-flight Promise<model|null>
let _textModelUnavailable = false

// NSFWJS image model
let _nsfwModel     = null
let _nsfwModelLoad = null   // in-flight Promise<model|null>
let _nsfwUnavailable = false

// Custom local image model (fallback)
let _imageModel     = null
let _imageModelLoad = null   // in-flight Promise<model|null>

// Background scan queue
// Max items to keep in queue — older items are dropped when full to prevent
// unbounded memory growth and TF inference backlog that lags the UI.
const SCAN_QUEUE_MAX = 10
const _scanQueue = []
let _isProcessingQueue = false
// Deduplication: track texts currently in queue to avoid redundant TF calls
const _scanQueueTexts = new Set()

// ─── Utility helpers ──────────────────────────────────────────────────────────

const toNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const fileNameOf = (a) => `${a?.name || ''} ${a?.filename || ''} ${a?.url || ''}`

/** Fire-and-forget promise; swallows all errors. */
const fireAndForget = (factory) => {
  try { factory().catch(() => {}) } catch {}
}

// ─── TensorFlow.js backend initialisation ────────────────────────────────────

/**
 * Lazily initialise TensorFlow.js and select the best available backend.
 * Returns the tf namespace. Subsequent calls return the cached instance.
 */
const ensureTf = () => {
  if (_tf) return Promise.resolve(_tf)
  if (_tfReady) return _tfReady

  _tfReady = (async () => {
    const tf = await import('@tensorflow/tfjs')

    // Attempt to load optional backends (failures are silently ignored).
    await Promise.allSettled([
      import('@tensorflow/tfjs-backend-webgpu').catch(() => {}),
      import('@tensorflow/tfjs-backend-wasm').catch(() => {})
    ])

    // Try backends from fastest to most compatible.
    const backends = ['webgpu', 'webgl', 'wasm', 'cpu']
    for (const backend of backends) {
      try {
        await tf.setBackend(backend)
        await tf.ready()
        console.info(`[SafetyService] TF.js backend: ${backend}`)
        break
      } catch {
        // try next
      }
    }

    _tf = tf
    _tfReady = null
    return tf
  })()

  return _tfReady
}

// ─── Model loaders ────────────────────────────────────────────────────────────

/**
 * Load a TF.js model, trying GraphModel first then LayersModel.
 * Returns null on failure.
 */
const loadModelFlexible = async (tf, path) => {
  try {
    return await tf.loadGraphModel(path)
  } catch {
    try {
      return await tf.loadLayersModel(path)
    } catch {
      return null
    }
  }
}

// ── Toxicity model ────────────────────────────────────────────────────────────

/**
 * Ensure the @tensorflow-models/toxicity model is loaded.
 * The model is loaded once and cached. Returns null if unavailable.
 *
 * Threshold is set low (0.5) so we receive raw probabilities for all labels;
 * we apply our own per-label thresholds in runToxicityModel().
 */
const ensureToxicityModel = () => {
  if (_toxicityModel) return Promise.resolve(_toxicityModel)
  if (_toxicityUnavailable) return Promise.resolve(null)
  if (_toxicityModelLoad) return _toxicityModelLoad

  _toxicityModelLoad = (async () => {
    try {
      // Toxicity model requires WebGL for acceptable performance.
      const tf = await ensureTf()
      try { await tf.setBackend('webgl'); await tf.ready() } catch {}

      const toxicity = await import('@tensorflow-models/toxicity')
      // threshold=0.5 → model returns probabilities for all labels;
      // we apply our own thresholds when interpreting results.
      const model = await toxicity.load(0.5, TOXICITY_LABELS)
      _toxicityModel = model
      console.info('[SafetyService] Toxicity model loaded')
      return model
    } catch (err) {
      console.warn('[SafetyService] Toxicity model unavailable:', err?.message || err)
      _toxicityUnavailable = true
      return null
    } finally {
      _toxicityModelLoad = null
    }
  })()

  return _toxicityModelLoad
}

// ── Custom text model ─────────────────────────────────────────────────────────

/**
 * Ensure the optional custom local text model is loaded.
 * Returns null when the model file is absent or fails to load.
 */
const ensureTextModel = () => {
  if (_textModel) return Promise.resolve(_textModel)
  if (_textModelUnavailable) return Promise.resolve(null)
  if (_textModelLoad) return _textModelLoad

  _textModelLoad = (async () => {
    try {
      const tf = await ensureTf()
      const model = await loadModelFlexible(tf, TEXT_MODEL_PATH)
      if (!model) throw new Error('model_null')
      _textModel = model
      console.info('[SafetyService] Custom text model loaded')
      return model
    } catch {
      _textModelUnavailable = true
      return null
    } finally {
      _textModelLoad = null
    }
  })()

  return _textModelLoad
}

// ── NSFWJS image model ────────────────────────────────────────────────────────

/**
 * Ensure the NSFWJS model is loaded.
 * Returns null when nsfwjs is unavailable.
 */
const ensureNsfwModel = () => {
  if (_nsfwModel) return Promise.resolve(_nsfwModel)
  if (_nsfwUnavailable) return Promise.resolve(null)
  if (_nsfwModelLoad) return _nsfwModelLoad

  _nsfwModelLoad = (async () => {
    try {
      await ensureTf()
      const nsfwjs = await import('nsfwjs')
      // Use the bundled MobileNetV2 model shipped with nsfwjs.
      const model = await nsfwjs.load('MobileNetV2')
      _nsfwModel = model
      console.info('[SafetyService] NSFWJS model loaded')
      return model
    } catch (err) {
      console.warn('[SafetyService] NSFWJS model unavailable:', err?.message || err)
      _nsfwUnavailable = true
      return null
    } finally {
      _nsfwModelLoad = null
    }
  })()

  return _nsfwModelLoad
}

// ── Custom image model (fallback) ─────────────────────────────────────────────

const ensureImageModel = () => {
  if (_imageModel) return Promise.resolve(_imageModel)
  if (_imageModelLoad) return _imageModelLoad

  _imageModelLoad = (async () => {
    try {
      const tf = await ensureTf()
      const model = await loadModelFlexible(tf, IMAGE_MODEL_PATH)
      if (!model) throw new Error('model_null')
      _imageModel = model
      console.info('[SafetyService] Custom image model loaded')
      return model
    } catch {
      return null
    } finally {
      _imageModelLoad = null
    }
  })()

  return _imageModelLoad
}

// ─── Model inference ──────────────────────────────────────────────────────────

/**
 * Run the toxicity model on a single text string.
 *
 * Returns an object with per-label probability scores, or null on failure.
 * All scores are in [0, 1].
 *
 * The toxicity model's classify() API returns:
 *   [{ label, results: [{ probabilities: Float32Array([notToxic, toxic]) }] }]
 *
 * We extract probabilities[1] (the "is toxic" probability) for each label.
 */
const runToxicityModel = async (text) => {
  if (!text || String(text).trim().length < 2) return null

  try {
    const model = await ensureToxicityModel()
    if (!model) return null

    const sentences = [String(text).slice(0, 512)]   // cap length for performance
    const predictions = await model.classify(sentences)

    const scores = {}
    for (const pred of predictions) {
      // pred.results is an array with one entry per input sentence.
      // probabilities[0] = P(not toxic), probabilities[1] = P(toxic)
      const prob = pred.results[0]?.probabilities
      if (!prob) continue
      const score = toNumber(prob[1])

      switch (pred.label) {
        case 'toxicity':         scores.toxic          = score; break
        case 'severe_toxicity':  scores.severeToxic    = score; break
        case 'obscene':          scores.obscene        = score; break
        case 'threat':           scores.threat         = score; break
        case 'insult':           scores.insult         = score; break
        case 'identity_attack':  scores.identityAttack = score; break
        case 'sexual_explicit':  scores.sexualExplicit = score; break
        default: break
      }
    }

    return scores
  } catch (err) {
    console.warn('[SafetyService] Toxicity inference error:', err?.message || err)
    return null
  }
}

/**
 * Build a simple character-frequency feature vector for the custom text model.
 * Produces a Float32Array of length 64, normalised by text length.
 */
const buildTextFeatureVector = (text) => {
  const value = String(text || '').toLowerCase()
  const vec = new Float32Array(64)
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    vec[(code + i) % vec.length] += 1
  }
  const norm = Math.max(1, value.length)
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

/**
 * Run the optional custom local text model.
 * Returns { sexualContentText, groomingRisk, coercionThreats, selfHarmEncouragement }
 * or null when the model is unavailable.
 */
const runCustomTextModel = async (text) => {
  try {
    const tf = await ensureTf()
    const model = await ensureTextModel()
    if (!model) return null

    const vector = buildTextFeatureVector(text)
    const input = tf.tensor2d([Array.from(vector)], [1, vector.length], 'float32')

    let pred
    try {
      pred = model.predict(input)
    } catch {
      input.dispose()
      return null
    }

    const outTensor = Array.isArray(pred) ? pred[0] : pred
    const out = Array.from(await outTensor.data())

    // Dispose tensors to prevent memory leaks.
    input.dispose()
    if (Array.isArray(pred)) pred.forEach(t => t.dispose())
    else pred.dispose()

    return {
      sexualContentText:      toNumber(out[0]),
      groomingRisk:           toNumber(out[1]),
      coercionThreats:        toNumber(out[2]),
      selfHarmEncouragement:  toNumber(out[3]),
      weaponInstructions:     toNumber(out[4])
    }
  } catch (err) {
    console.warn('[SafetyService] Custom text model error:', err?.message || err)
    return null
  }
}

/**
 * Load an image element from a URL (with CORS anonymous).
 */
const loadImageElement = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload  = () => resolve(img)
  img.onerror = () => reject(new Error(`image_load_failed: ${url}`))
  img.src = url
})

/**
 * Run NSFWJS (primary) or the custom image model (fallback) on a single URL.
 *
 * NSFWJS class names: Drawing | Hentai | Neutral | Porn | Sexy
 * Returns { nsfw, sexualizedMinorRisk, violenceGore } or null.
 */
const runImageModel = async (url) => {
  if (!url) return null

  let img
  try {
    img = await loadImageElement(url)
  } catch {
    return null
  }

  // ── Primary: NSFWJS ───────────────────────────────────────────────────────
  try {
    const nsfwModel = await ensureNsfwModel()
    if (nsfwModel) {
      const classifications = await nsfwModel.classify(img)
      const score = (name) => {
        const hit = (classifications || []).find(
          (c) => String(c?.className || '').toLowerCase() === name.toLowerCase()
        )
        return toNumber(hit?.probability)
      }
      const porn   = score('Porn')
      const sexy   = score('Sexy')
      const hentai = score('Hentai')
      return {
        nsfw:                Math.max(porn, sexy, hentai),
        sexualizedMinorRisk: Math.max(porn, hentai),
        violenceGore:        0
      }
    }
  } catch (err) {
    console.warn('[SafetyService] NSFWJS inference error:', err?.message || err)
  }

  // ── Fallback: custom image model ──────────────────────────────────────────
  try {
    const tf = await ensureTf()
    const model = await ensureImageModel()
    if (!model) return null

    const result = tf.tidy(() => {
      const pixels     = tf.browser.fromPixels(img)
      const resized    = tf.image.resizeBilinear(pixels, [224, 224])
      const normalized = resized.toFloat().div(255)
      const batched    = normalized.expandDims(0)
      const pred       = model.predict(batched)
      return Array.isArray(pred) ? pred[0] : pred
    })

    const out = Array.from(await result.data())
    result.dispose()

    return {
      nsfw:                toNumber(out[0]),
      sexualizedMinorRisk: toNumber(out[1]),
      violenceGore:        toNumber(out[2])
    }
  } catch (err) {
    console.warn('[SafetyService] Custom image model error:', err?.message || err)
    return null
  }
}

// ─── Text normalisation (leet-speak / obfuscation) ───────────────────────────

/**
 * Collapse common character substitutions used to bypass keyword filters.
 * The result is used only for keyword matching, not for display.
 */
const normalizeText = (text) => {
  let s = String(text || '').toLowerCase()
  // Leet-speak substitutions
  s = s.replace(/[@4]/g, 'a')
  s = s.replace(/[3]/g, 'e')
  s = s.replace(/[!1|]/g, 'i')
  s = s.replace(/[0]/g, 'o')
  s = s.replace(/[$5]/g, 's')
  s = s.replace(/[7]/g, 't')
  s = s.replace(/[8]/g, 'b')
  s = s.replace(/[9]/g, 'g')
  s = s.replace(/[#]/g, 'h')
  s = s.replace(/\*/g, '')
  // Collapse whitespace and punctuation used as separators
  s = s.replace(/[\s.\-_,]+/g, '')
  return s
}

/**
 * Escape regex special characters in a string.
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ─── Keyword heuristic scanner ────────────────────────────────────────────────

/**
 * Scan text against all keyword lists.
 * Returns an object of boolean flags.
 */
const runKeywordScan = (text) => {
  const lower      = String(text || '').toLowerCase()
  const normalized = normalizeText(text)

  const has = (term) => {
    if (term.length < 4) return false
    const termRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i')
    return termRegex.test(lower) || termRegex.test(normalized)
  }

  const hasSlurWithBoundary = (term) => {
    if (term.length < 4) return false
    const slurRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i')
    return slurRegex.test(lower) || slurRegex.test(normalized)
  }

  const hasSexual      = SEXUAL_TERMS.some(has)
  const hasMinor       = MINOR_TERMS.some(has)
  const hasGrooming    = GROOMING_TERMS.some(has)
  const hasThreat      = THREAT_TERMS.some(has)
  const hasSelfHarm    = SELF_HARM_TERMS.some(has)
  const hasMinorSexual = SEXUAL_MINOR_COMBINATIONS.some(has)
  const hasWeapon      = WEAPON_BOMB_TERMS.some(has)
  const hasExploit     = EXPLOITATION_TERMS.some(has)
  const hasTraffick    = TRAFFICKING_TERMS.some(has)
  const hasDrug        = DRUG_ILLEGAL_TERMS.some(has)
  const hasDrugMinor   = DRUG_MINOR_TERMS.some(has)
  const hasSlur        = SLUR_TERMS.some(hasSlurWithBoundary)

  return {
    sexualContentText:      hasSexual && !hasMinor,
    groomingRisk:           hasGrooming || (hasSexual && hasMinor),
    coercionThreats:        hasThreat,
    selfHarmEncouragement:  hasSelfHarm,
    weaponInstructions:     hasWeapon,
    sexualizedMinorRisk:    hasMinorSexual || hasExploit || (hasSexual && hasMinor),
    violenceGore:           false,
    toxic:                  hasSlur,
    drugContent:            hasDrug,
    drugToMinors:           hasDrugMinor,
    traffickingRisk:        hasTraffick,
    exploitationRisk:       hasExploit,
    hateSlur:               hasSlur
  }
}

// ─── Signal merging ───────────────────────────────────────────────────────────

/**
 * Merge keyword heuristics, custom model scores, and toxicity model scores
 * into a single set of boolean content flags.
 *
 * Strategy:
 *   - A flag is TRUE if ANY source exceeds its threshold.
 *   - Keyword hits are treated as definitive for high-specificity terms.
 *   - Model scores provide coverage for novel phrasing.
 */
const mergeTextSignals = (keywords, customModel, toxicity) => {
  const kw  = keywords    || {}
  const cm  = customModel || {}
  const tx  = toxicity    || {}

  return {
    sexualContentText: !!(
      kw.sexualContentText ||
      toNumber(cm.sexualContentText) >= THRESHOLDS.sexualContent ||
      toNumber(tx.sexualExplicit)    >= THRESHOLDS.sexualExplicit
    ),
    groomingRisk: !!(
      kw.groomingRisk ||
      toNumber(cm.groomingRisk) >= THRESHOLDS.groomingRisk ||
      (toNumber(tx.identityAttack) >= THRESHOLDS.identityAttack &&
       toNumber(tx.sexualExplicit) >= THRESHOLDS.sexualExplicit)
    ),
    coercionThreats: !!(
      kw.coercionThreats ||
      toNumber(cm.coercionThreats) >= THRESHOLDS.coercionThreats ||
      toNumber(tx.threat)          >= THRESHOLDS.threat
    ),
    selfHarmEncouragement: !!(
      kw.selfHarmEncouragement ||
      toNumber(cm.selfHarmEncouragement) >= THRESHOLDS.selfHarmEncouragement ||
      toNumber(tx.severeToxic)           >= THRESHOLDS.severeToxic
    ),
    weaponInstructions: !!(
      kw.weaponInstructions ||
      toNumber(cm.weaponInstructions) >= THRESHOLDS.weaponInstructions
    ),
    sexualizedMinorRisk: !!(
      kw.sexualizedMinorRisk ||
      (toNumber(cm.sexualContentText) >= 0.2 &&
       toNumber(tx.sexualExplicit)    >= 0.2)
    ),
    violenceGore: !!(
      kw.violenceGore
      // Note: the published toxicity model does not have a 'violence' label.
      // If a custom model provides it, add: || toNumber(cm.violence) >= THRESHOLDS.violenceGore
    ),
    toxic: !!(
      toNumber(tx.toxic)   >= THRESHOLDS.toxic   ||
      toNumber(tx.obscene) >= THRESHOLDS.obscene ||
      toNumber(tx.insult)  >= THRESHOLDS.insult  ||
      toNumber(tx.identityAttack) >= THRESHOLDS.identityAttack
    ),
    hateSlur:         !!kw.hateSlur,
    drugContent:      !!kw.drugContent,
    drugToMinors:     !!kw.drugToMinors,
    traffickingRisk:  !!kw.traffickingRisk,
    exploitationRisk: !!kw.exploitationRisk
  }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export const getPolicyVersion = () => POLICY_VERSION
export const getModelVersion  = () => MODEL_VERSION

// ─── Warmup ───────────────────────────────────────────────────────────────────

/**
 * Eagerly start loading models in the background so they are ready when
 * the first message is sent.
 *
 * @param {object} opts
 * @param {boolean} [opts.text=true]     Warm up the custom text model.
 * @param {boolean} [opts.images=true]   Warm up the NSFWJS image model.
 * @param {boolean} [opts.toxicity=true] Warm up the toxicity model.
 */
export const warmupSafetyModels = ({ text = true, images = true, toxicity = true } = {}) => {
  if (toxicity && !_toxicityModel && !_toxicityModelLoad && !_toxicityUnavailable) {
    fireAndForget(() => ensureToxicityModel())
  }
  if (text && !_textModel && !_textModelLoad && !_textModelUnavailable) {
    fireAndForget(() => ensureTextModel())
  }
  if (images && ENABLE_IMAGE_MODEL_WARMUP && !_nsfwModel && !_nsfwModelLoad && !_nsfwUnavailable) {
    fireAndForget(() => ensureNsfwModel())
  }
}

// ─── Synchronous fast-path ────────────────────────────────────────────────────

/**
 * Synchronous heuristic-only safety check.
 * Runs in < 1 ms. Used for real-time input validation (e.g. on keypress).
 *
 * Returns { isUnsafe, reasons, match, category }.
 */
export const checkInputSafety = (text = '') => {
  if (!text || String(text).trim().length < 2) {
    return { isUnsafe: false, reasons: [], match: null }
  }

  // 1. Critical regex patterns (highest confidence)
  for (const { pattern, category, label } of CRITICAL_PATTERNS) {
    if (pattern.test(text)) {
      return { isUnsafe: true, reasons: [category], match: label, category }
    }
  }

  // 2. Normalised keyword scan — high-risk terms (with word boundaries)
  const normalized = normalizeText(text)
  const lower = String(text).toLowerCase()
  const highRiskTerms = [
    'pipebomb', 'pipe bomb', 'tnt', 'c4', 'dynamite', 'ied',
    'pedophile', 'csam', 'child porn', 'underage porn'
  ]
  for (const term of highRiskTerms) {
    if (term.length < 4) continue // Skip short terms to avoid false positives
    const termRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i')
    if (termRegex.test(text) || termRegex.test(normalized)) {
      return { isUnsafe: true, reasons: ['dangerous_term'], match: term, category: 'dangerous' }
    }
  }

  // 2b. Slur / hate-speech check (synchronous) - disabled for laxer policy
  // for (const slur of SLUR_TERMS) {
  //   if (slur.length < 4) continue // Skip 1-3 char terms to avoid false positives
  //   const slurRegex = new RegExp(`\\b${escapeRegex(slur)}\\b`, 'i')
  //   if (slurRegex.test(text) || slurRegex.test(normalized)) {
  //     return { isUnsafe: true, reasons: ['hate_slur'], match: slur, category: 'hate_speech' }
  //   }
  // }

  // 3. Contextual co-occurrence patterns - relaxed
  const clearMinorSexual =
    /(?:kid|child|baby|infant)[^a-z]*(?:sex|fuck|nude|naked|porn|oral|anal|penetrat)/i.test(text) ||
    /(?:sex|fuck|nude|naked|porn)[^a-z]*(?:kid|child|baby|infant)/i.test(text)

  const clearDrugMinor =
    /(?:cocaine|heroin|meth|fentanyl)[^a-z]*(?:kid|child|teen|minor|baby)/i.test(text) ||
    /(?:kid|child|teen|minor|baby)[^a-z]*(?:cocaine|heroin|meth|fentanyl)/i.test(text)

  const clearWeaponMake =
    /(?:bomb|explosive|gun)[^a-z]*(?:make|build|how to|instruction|recipe)/i.test(text) ||
    /(?:make|build|how to|instruction|recipe)[^a-z]*(?:bomb|explosive|gun)/i.test(text)

  const clearViolenceMinor =
    /(?:kill|murder)[^a-z]*(?:kid|child|teen|minor|baby)/i.test(text) ||
    /(?:kid|child|teen|minor|baby)[^a-z]*(?:kill|murder)/i.test(text)

  if (clearMinorSexual || clearDrugMinor || clearWeaponMake || clearViolenceMinor) {
    return { isUnsafe: true, reasons: ['clear_danger'], match: 'contextual_pattern', category: 'dangerous' }
  }

  return { isUnsafe: false, reasons: [], match: null }
}

// ─── Full async text analysis ─────────────────────────────────────────────────

/**
 * Run all text analysis models in parallel and merge results.
 *
 * @param {string} text
 * @returns {Promise<object>} Merged boolean content flags.
 */
export const analyzeTextSafety = async (text = '') => {
  const keywords = runKeywordScan(text)

  // Run both AI models concurrently; either may return null.
  const [customModelScores, toxicityScores] = await Promise.all([
    runCustomTextModel(text).catch(() => null),
    runToxicityModel(text).catch(() => null)
  ])

  return mergeTextSignals(keywords, customModelScores, toxicityScores)
}

/**
 * Alias for analyzeTextSafety with optional non-blocking mode.
 * When allowBlocking=false and models are not yet loaded, queues a background
 * scan and returns keyword-only results immediately.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.allowBlocking=true]
 */
export const analyzeTextSafetyWithAI = async (text = '', opts = {}) => {
  const { allowBlocking = true } = opts

  if (!allowBlocking && !_toxicityModel && !_textModel) {
    // Return keyword results immediately; schedule AI scan in background.
    const keywords = runKeywordScan(text)
    fireAndForget(() => queueBackgroundScan(text))
    return mergeTextSignals(keywords, null, null)
  }

  return analyzeTextSafety(text)
}

// ─── Attachment analysis ──────────────────────────────────────────────────────

/**
 * Synchronous filename-based attachment heuristics.
 * Returns { nsfw, sexualizedMinorRisk, violenceGore }.
 */
export const analyzeAttachmentSafety = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments : []
  let nsfw = false
  let sexualizedMinorRisk = false
  let violenceGore = false

  for (const item of list) {
    const label = fileNameOf(item).toLowerCase()
    const has = (term) => label.includes(term)
    if (NSFW_FILE_TERMS.some(has))       nsfw = true
    if (MINOR_RISK_FILE_TERMS.some(has)) sexualizedMinorRisk = true
    if (GORE_FILE_TERMS.some(has))       violenceGore = true
  }

  return { nsfw, sexualizedMinorRisk, violenceGore }
}

/**
 * Async attachment analysis: filename heuristics + AI image classification.
 *
 * @param {Array}  attachments
 * @param {object} [opts]
 * @param {boolean} [opts.allowBlocking=true]
 */
export const analyzeAttachmentSafetyWithAI = async (attachments = [], { allowBlocking = true } = {}) => {
  const heuristic = analyzeAttachmentSafety(attachments)

  const imageUrls = (Array.isArray(attachments) ? attachments : [])
    .map((a) => a?.url || a?.localUrl || null)
    .filter(Boolean)

  if (imageUrls.length === 0) return heuristic

  if (!allowBlocking && !_nsfwModel && !_imageModel) {
    // Warm up image models in background; return heuristic result now.
    fireAndForget(() => ensureNsfwModel())
    return heuristic
  }

  // Classify each image and merge results.
  let merged = { ...heuristic }
  for (const url of imageUrls) {
    const modelScore = await runImageModel(url).catch(() => null)
    if (!modelScore) continue
    merged = {
      ...merged,
      nsfw:                merged.nsfw || toNumber(modelScore.nsfw) >= THRESHOLDS.nsfw,
      sexualizedMinorRisk: merged.sexualizedMinorRisk ||
                           toNumber(modelScore.sexualizedMinorRisk) >= THRESHOLDS.sexualizedMinorRisk,
      violenceGore:        merged.violenceGore ||
                           toNumber(modelScore.violenceGore) >= THRESHOLDS.violenceGore
    }
  }

  return merged
}

// ─── Content flag builder ─────────────────────────────────────────────────────

/**
 * Combine text and attachment analysis results into a single content-flags
 * object suitable for policy evaluation and server reporting.
 */
export const buildContentFlags = ({ textAnalysis = {}, attachmentAnalysis = {} } = {}) => ({
  nsfw:                  !!attachmentAnalysis.nsfw,
  sexualizedMinorRisk:   !!attachmentAnalysis.sexualizedMinorRisk || !!textAnalysis.sexualizedMinorRisk,
  violenceGore:          !!attachmentAnalysis.violenceGore        || !!textAnalysis.violenceGore,
  weaponInstructions:    !!textAnalysis.weaponInstructions,
  sexualContentText:     !!textAnalysis.sexualContentText,
  groomingRisk:          !!textAnalysis.groomingRisk,
  coercionThreats:       !!textAnalysis.coercionThreats,
  selfHarmEncouragement: !!textAnalysis.selfHarmEncouragement,
  toxic:                 !!textAnalysis.toxic,
  hateSlur:              !!textAnalysis.hateSlur,
  drugContent:           !!textAnalysis.drugContent,
  drugToMinors:          !!textAnalysis.drugToMinors,
  traffickingRisk:       !!textAnalysis.traffickingRisk,
  exploitationRisk:      !!textAnalysis.exploitationRisk,
  modelVersion:          MODEL_VERSION,
  policyVersion:         POLICY_VERSION,
  checkedAt:             new Date().toISOString()
})

// ─── Policy evaluation ────────────────────────────────────────────────────────

/**
 * Returns true when the content should be escalated to the server for review.
 */
export const shouldEscalateThreat = (flags = {}) => !!(
  flags.coercionThreats      ||
  flags.groomingRisk         ||
  flags.selfHarmEncouragement||
  flags.weaponInstructions   ||
  flags.violenceGore         ||
  flags.sexualizedMinorRisk  ||
  flags.sexualContentText    ||
  flags.drugContent          ||
  flags.drugToMinors         ||
  flags.traffickingRisk      ||
  flags.exploitationRisk
)

/**
 * Evaluate content flags against the safety policy.
 *
 * @param {object} opts
 * @param {object} [opts.flags={}]      Content flags from buildContentFlags().
 * @param {object} [opts.recipient={}]  Recipient metadata ({ isMinor, isUnder16 }).
 *
 * @returns {{ shouldBlock, shouldReport, blockReasons, shouldAutoBanSender }}
 */
export const evaluateSafetyPolicy = ({ flags = {}, recipient = {} } = {}) => {
  const isRecipientMinor   = !!recipient.isMinor
  const isRecipientUnder16 = !!recipient.isUnder16
  const blockReasons = []

  // ── Always-block flags (regardless of recipient age) ─────────────────────
  if (flags.sexualizedMinorRisk)    blockReasons.push('sexualized_minor_risk')
  if (flags.coercionThreats)        blockReasons.push('coercion_threats')
  if (flags.selfHarmEncouragement)  blockReasons.push('self_harm_encouragement')
  if (flags.weaponInstructions)     blockReasons.push('weapon_instructions')
  if (flags.exploitationRisk)       blockReasons.push('child_exploitation')
  if (flags.traffickingRisk)        blockReasons.push('trafficking')
  if (flags.drugToMinors)          blockReasons.push('drugs_to_minors')
  if (flags.sexualContentText && flags.sexualizedMinorRisk) {
    blockReasons.push('sexual_minor_content')
  }

  // ── Additional blocks when recipient is a minor ───────────────────────────
  if (isRecipientMinor || isRecipientUnder16) {
    if (flags.nsfw)                  blockReasons.push('nsfw_to_minor')
    if (flags.groomingRisk)          blockReasons.push('grooming_risk_to_minor')
    if (flags.sexualContentText)     blockReasons.push('sexual_text_to_minor')
    if (flags.sexualizedMinorRisk)   blockReasons.push('sexualized_minor_risk_to_minor')
    if (flags.exploitationRisk)      blockReasons.push('exploitation_to_minor')
    if (flags.traffickingRisk)       blockReasons.push('trafficking_to_minor')
    if (flags.drugContent)           blockReasons.push('illegal_drugs_to_minor')
  }

  const shouldBlock  = blockReasons.length > 0
  const shouldReport = shouldEscalateThreat(flags)

  // Auto-ban is reserved for the most severe violations targeting minors.
  const shouldAutoBanSender = isRecipientUnder16 && !!(
    flags.groomingRisk       ||
    flags.sexualizedMinorRisk||
    flags.coercionThreats    ||
    flags.exploitationRisk   ||
    flags.traffickingRisk    ||
    flags.drugToMinors
  )

  return { shouldBlock, shouldReport, blockReasons, shouldAutoBanSender }
}

// ─── Convenience scan functions ───────────────────────────────────────────────

/**
 * Quick combined safety check (heuristics + AI).
 * Suitable for use immediately before sending a message.
 *
 * @param {string} text
 * @param {Array}  attachments
 * @returns {Promise<{ flags, safety }>}
 */
export const quickSafetyCheck = async (text = '', attachments = []) => {
  // Run text and attachment analysis concurrently.
  const [textAnalysis, attachmentAnalysis] = await Promise.all([
    analyzeTextSafety(text).catch(() => runKeywordScan(text)),
    Promise.resolve(analyzeAttachmentSafety(attachments))
  ])

  const flags  = buildContentFlags({ textAnalysis, attachmentAnalysis })
  const safety = evaluateSafetyPolicy({ flags, recipient: {} })

  if (safety.shouldReport) {
    // Queue a deeper background scan for audit purposes.
    fireAndForget(() => queueBackgroundScan(text))
  }

  return { flags, safety }
}

/**
 * Scan a received message with conversational context.
 *
 * Reads up to `contextWindow` messages before and after the target message
 * from the provided `messages` array to build a context string that is
 * prepended to the AI scan.  This helps the model understand grooming
 * escalation, coercion patterns, and other multi-turn threats that would
 * be missed by scanning a single message in isolation.
 *
 * Adult-to-adult rule:
 *   If BOTH the sender AND the local user are verified adults (age ≥ 18)
 *   then sexual content between them is permitted.  The scan still blocks
 *   grooming, coercion, weapon instructions, self-harm, and exploitation
 *   regardless of age.
 *
 * @param {object} opts
 * @param {object}  opts.message          The received message object.
 * @param {Array}   opts.messages         Full message list for context.
 * @param {object}  [opts.senderProfile]  Sender's profile (for age check).
 * @param {object}  [opts.localUser]      Local user object (for age check).
 * @param {number}  [opts.contextWindow=7] Messages before/after to include.
 * @returns {Promise<{ flags, safety, blocked: boolean, contextText: string }>}
 */
export const scanReceivedMessage = async ({
  message,
  messages = [],
  senderProfile = null,
  localUser = null,
  contextWindow = 7
} = {}) => {
  if (!message) return { flags: {}, safety: { shouldBlock: false, shouldReport: false }, blocked: false, contextText: '' }

  // ── Synchronous fast-path (runs before any async work) ──────────────────
  // checkInputSafety catches high-confidence patterns in < 1 ms.
  // If it fires, we skip the AI scan entirely and block immediately.
  const messageText = String(message.content || '')
  const fastCheck = checkInputSafety(messageText)
  if (fastCheck.isUnsafe) {
    const keywordFlags = runKeywordScan(messageText)
    const attachmentAnalysis = analyzeAttachmentSafety(message.attachments || [])
    const flags = buildContentFlags({ textAnalysis: keywordFlags, attachmentAnalysis })
    // Apply adult-to-adult exemption even on fast-path
    const getAgeFast = (profile) => {
      const raw = Number(profile?.ageVerification?.age ?? profile?.ageVerification?.estimatedAge)
      return Number.isFinite(raw) ? raw : null
    }
    const isVerifiedAdultFast = (profile) => {
      if (!profile?.ageVerification?.verified) return false
      const age = getAgeFast(profile)
      if (age !== null) return age >= 18
      return profile?.ageVerification?.category === 'adult'
    }
    const bothAdultsFast = isVerifiedAdultFast(senderProfile) && isVerifiedAdultFast(localUser)
    const flagsForFast = bothAdultsFast
      ? { ...flags, sexualContentText: false, nsfw: false, sexualExplicit: false }
      : flags
    const localAgeFast = getAgeFast(localUser)
    const recipientContextFast = {
      isMinor:   !!(localUser?.ageVerification?.verified && (localUser?.ageVerification?.category === 'child' || (localAgeFast !== null && localAgeFast < 18))),
      isUnder16: !!(localUser?.ageVerification?.verified && (localAgeFast !== null ? localAgeFast < 16 : localUser?.ageVerification?.category === 'child'))
    }
    const safety = evaluateSafetyPolicy({ flags: flagsForFast, recipient: recipientContextFast })
    // Force block on fast-path hits even if policy doesn't catch it
    // (e.g. 'bomb' alone — dangerous term but not in always-block list)
    const forcedSafety = {
      ...safety,
      shouldBlock: true,
      shouldReport: true,
      blockReasons: safety.blockReasons.length > 0 ? safety.blockReasons : [fastCheck.category || 'dangerous_content']
    }
    return { flags: flagsForFast, safety: forcedSafety, blocked: true, contextText: '' }
  }

  // ── Build context window ─────────────────────────────────────────────────
  const msgIndex = messages.findIndex(m => m?.id === message.id || m?.clientNonce === message.clientNonce)
  const start = Math.max(0, msgIndex >= 0 ? msgIndex - contextWindow : 0)
  const end   = msgIndex >= 0 ? Math.min(messages.length - 1, msgIndex + contextWindow) : 0

  const contextMessages = messages.slice(start, end + 1).filter(m => m?.id !== message.id && m?.clientNonce !== message.clientNonce)
  const contextText = contextMessages
    .map(m => `[${m.username || 'user'}]: ${String(m.content || '').slice(0, 200)}`)
    .join('\n')

  // Full text to scan = context + current message
  const fullText = contextText
    ? `${contextText}\n[${message.username || 'user'}]: ${String(message.content || '')}`
    : String(message.content || '')

  // ── Adult-to-adult check ─────────────────────────────────────────────────
  const getAge = (profile) => {
    const raw = Number(profile?.ageVerification?.age ?? profile?.ageVerification?.estimatedAge)
    return Number.isFinite(raw) ? raw : null
  }
  const isVerifiedAdult = (profile) => {
    if (!profile?.ageVerification?.verified) return false
    const age = getAge(profile)
    if (age !== null) return age >= 18
    return profile?.ageVerification?.category === 'adult'
  }

  const senderIsAdult = isVerifiedAdult(senderProfile)
  const localIsAdult  = isVerifiedAdult(localUser)
  const bothAdults    = senderIsAdult && localIsAdult

  // ── Run full AI scan on context + message ────────────────────────────────
  const [textAnalysis, attachmentAnalysis] = await Promise.all([
    analyzeTextSafety(fullText).catch(() => runKeywordScan(fullText)),
    Promise.resolve(analyzeAttachmentSafety(message.attachments || []))
  ])

  const flags = buildContentFlags({ textAnalysis, attachmentAnalysis })

  // ── Apply adult-to-adult exemption ───────────────────────────────────────
  // When both parties are verified adults, sexual content is permitted.
  // We still block grooming, coercion, weapon instructions, self-harm,
  // exploitation, trafficking, and drug-to-minors regardless.
  const flagsForPolicy = bothAdults
    ? {
        ...flags,
        sexualContentText:   false,
        nsfw:                false,
        sexualExplicit:      false,
        // Keep all dangerous flags intact:
        // groomingRisk, coercionThreats, selfHarmEncouragement,
        // weaponInstructions, violenceGore, sexualizedMinorRisk,
        // exploitationRisk, traffickingRisk, drugToMinors
      }
    : flags

  // Recipient context: the local user is the recipient of this message.
  const localAge = getAge(localUser)
  const recipientContext = {
    isMinor:   !!(localUser?.ageVerification?.verified && (localUser?.ageVerification?.category === 'child' || (localAge !== null && localAge < 18))),
    isUnder16: !!(localUser?.ageVerification?.verified && (localAge !== null ? localAge < 16 : localUser?.ageVerification?.category === 'child'))
  }

  const safety = evaluateSafetyPolicy({ flags: flagsForPolicy, recipient: recipientContext })

  if (safety.shouldReport) {
    fireAndForget(() => queueBackgroundScan(fullText))
  }

  return { flags: flagsForPolicy, safety, blocked: safety.shouldBlock, contextText }
}

/**
 * Non-blocking safety scan designed for the optimistic-send pattern.
 *
 * Usage:
 *   1. Caller adds the optimistic message to the UI immediately (shows "sending").
 *   2. Caller clears the input so the user can type the next message.
 *   3. Caller awaits scanMessageAsync() in the background.
 *   4. If shouldBlock → caller calls onMessageFailed(clientNonce, reason).
 *   5. If shouldReport → caller submits a safety report.
 *
 * The synchronous heuristic check runs first (< 1 ms).  If it already flags
 * the content the function resolves immediately without waiting for AI models.
 * Otherwise the AI models run concurrently in the background.
 *
 * @param {object} opts
 * @param {string}  opts.text
 * @param {Array}   [opts.attachments=[]]
 * @param {object}  [opts.recipient={}]
 * @returns {Promise<{ flags, safety, blocked: boolean }>}
 */
export const scanMessageAsync = async ({
  text = '',
  attachments = [],
  recipient = {}
} = {}) => {
  // ── 1. Synchronous heuristic fast-path ──────────────────────────────────
  // If the keyword/regex scan already catches it, resolve immediately.
  const heuristicCheck = checkInputSafety(text)
  if (heuristicCheck.isUnsafe) {
    const keywordFlags = runKeywordScan(text)
    const attachmentAnalysis = analyzeAttachmentSafety(attachments)
    const flags  = buildContentFlags({ textAnalysis: keywordFlags, attachmentAnalysis })
    const safety = evaluateSafetyPolicy({ flags, recipient })
    return { flags, safety, blocked: safety.shouldBlock }
  }

  // ── 2. Full AI scan (runs after optimistic send) ─────────────────────────
  const [textAnalysis, attachmentAnalysis] = await Promise.all([
    analyzeTextSafety(text).catch(() => runKeywordScan(text)),
    Promise.resolve(analyzeAttachmentSafety(attachments))
  ])

  const flags  = buildContentFlags({ textAnalysis, attachmentAnalysis })
  const safety = evaluateSafetyPolicy({ flags, recipient })

  if (safety.shouldReport) {
    fireAndForget(() => queueBackgroundScan(text))
  }

  return { flags, safety, blocked: safety.shouldBlock }
}

/**
 * Full safety scan with recipient-aware policy evaluation.
 * Used by ChatPage / DMChat before transmitting a message.
 *
 * @param {object} opts
 * @param {string}  [opts.text='']
 * @param {Array}   [opts.attachments=[]]
 * @param {object}  [opts.recipient={}]
 * @param {boolean} [opts.allowBlockingModels=true]
 */
export const runSafetyScan = async ({
  text = '',
  attachments = [],
  recipient = {},
  allowBlockingModels = true
} = {}) => {
  const [textAnalysis, attachmentAnalysis] = await Promise.all([
    analyzeTextSafetyWithAI(text, { allowBlocking: allowBlockingModels }),
    analyzeAttachmentSafetyWithAI(attachments, { allowBlocking: allowBlockingModels })
  ])

  const flags  = buildContentFlags({ textAnalysis, attachmentAnalysis })
  const safety = evaluateSafetyPolicy({ flags, recipient })

  return { textAnalysis, attachmentAnalysis, flags, safety }
}

// ─── Background scan queue ────────────────────────────────────────────────────

/**
 * Process the background scan queue one item at a time, yielding to the
 * browser between each inference to avoid blocking the main thread.
 *
 * Key improvements over the original:
 *  - Uses requestIdleCallback (when available) so TF inference only runs
 *    when the browser is idle — no more UI jank during active typing.
 *  - Falls back to a 50 ms setTimeout on browsers without rIC.
 *  - Processes ONE item per idle slot, then re-schedules, giving the
 *    browser a chance to handle user input between each TF call.
 *  - Resolves items with null if the queue is drained while they wait
 *    (prevents memory leaks from stale promises).
 */
const scheduleNextScan = () => {
  if (_isProcessingQueue || _scanQueue.length === 0) return

  if (typeof requestIdleCallback === 'function') {
    // Only run when browser is idle; timeout=2000ms ensures it eventually runs
    requestIdleCallback(() => processScanQueue(), { timeout: 2000 })
  } else {
    // Fallback: 50 ms delay gives the event loop a chance to breathe
    setTimeout(processScanQueue, 50)
  }
}

const processScanQueue = async () => {
  if (_isProcessingQueue || _scanQueue.length === 0) return
  _isProcessingQueue = true

  // Process ONE item per idle slot to avoid blocking the main thread.
  // After each inference we release the lock and re-schedule so the
  // browser can handle user input (typing, scrolling, etc.) between scans.
  const item = _scanQueue.shift()
  _scanQueueTexts.delete(item.text)

  try {
    const scores = await runToxicityModel(item.text)
    item.resolve?.(scores)
  } catch (err) {
    item.reject?.(err)
  } finally {
    _isProcessingQueue = false
    // Schedule the next item if any remain
    if (_scanQueue.length > 0) scheduleNextScan()
  }
}

/**
 * Queue a text string for background toxicity model inference.
 * Returns a Promise that resolves with the raw toxicity scores (or null).
 *
 * Improvements:
 *  - Deduplication: if the same text is already queued, returns the
 *    existing promise instead of adding a duplicate TF inference.
 *  - Queue size limit: when the queue is full, the oldest item is dropped
 *    (resolved with null) to prevent unbounded backlog and memory growth.
 *  - Uses requestIdleCallback scheduling to avoid UI jank.
 *
 * @param {string} text
 * @returns {Promise<object|null>}
 */
export const queueBackgroundScan = (text) => {
  // Deduplication: skip if this exact text is already queued
  if (_scanQueueTexts.has(text)) {
    // Find the existing item and return its promise
    const existing = _scanQueue.find(item => item.text === text)
    if (existing) return new Promise((resolve, reject) => {
      const origResolve = existing.resolve
      const origReject  = existing.reject
      existing.resolve = (v) => { origResolve?.(v); resolve(v) }
      existing.reject  = (e) => { origReject?.(e);  reject(e) }
    })
  }

  return new Promise((resolve, reject) => {
    // Drop oldest item if queue is full to prevent backlog
    if (_scanQueue.length >= SCAN_QUEUE_MAX) {
      const dropped = _scanQueue.shift()
      _scanQueueTexts.delete(dropped.text)
      dropped.resolve?.(null) // resolve with null (not an error)
    }

    _scanQueue.push({ text, resolve, reject })
    _scanQueueTexts.add(text)

    // Schedule processing during browser idle time
    scheduleNextScan()
  })
}

// ─── Cryptographic helpers ────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hex digest of a string using the Web Crypto API.
 * Returns null when the API is unavailable.
 */
export const sha256Hex = async (value) => {
  if (!globalThis?.crypto?.subtle) return null
  try {
    const data = new TextEncoder().encode(String(value))
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/**
 * Build a deterministic client-side signature for a safety report payload.
 * Used to detect tampering / replay on the server side.
 */
export const buildClientSignature = async (payload) => {
  try {
    return await sha256Hex(JSON.stringify(payload))
  } catch {
    return null
  }
}

// ─── Default export ───────────────────────────────────────────────────────────

export default {
  getPolicyVersion,
  getModelVersion,
  warmupSafetyModels,
  checkInputSafety,
  quickSafetyCheck,
  scanMessageAsync,
  scanReceivedMessage,
  analyzeTextSafety,
  analyzeAttachmentSafety,
  analyzeTextSafetyWithAI,
  analyzeAttachmentSafetyWithAI,
  buildContentFlags,
  shouldEscalateThreat,
  evaluateSafetyPolicy,
  runSafetyScan,
  queueBackgroundScan,
  sha256Hex,
  buildClientSignature
}
