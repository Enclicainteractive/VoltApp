import React, { useEffect, useRef, useState } from 'react'
import { X, ShieldAlert, AlertTriangle, ShieldCheck, Camera, RotateCcw, Eye, FileText, ScanLine, Lock, Code, ChevronRight, ChevronLeft, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import * as faceapi from '@vladmandic/face-api'
import { createWorker } from 'tesseract.js'
import { apiService } from '../../services/apiService'
import './Modal.css'
import './AgeVerificationModal.css'

const MODEL_URL = '/models'
const AGE_THRESHOLD = 18
const AGE_BUFFER = 2
const PASS_PROBABILITY = 0.95
const FAIL_PROBABILITY = 0.85
const MIN_VALID_FRAMES = 4
const TARGET_FRAMES = 15
const CAPTURE_DURATION_MS = 5000
const MAX_RETRIES = 3
const MIN_FACE_RATIO = 0.12
const MAX_YAW_DEGREES = 25
const SHARPNESS_THRESHOLD = 30
const LIVENESS_MOTION_THRESHOLD = 2
const LIVENESS_MIN_MOTION_FRAMES = 3
const FACE_MATCH_THRESHOLD = 0.5

const MRZ_WEIGHTS = [7, 3, 1]
const MRZ_CHAR_VALUE = (ch) => {
  if (ch === '<') return 0
  if (ch >= '0' && ch <= '9') return parseInt(ch, 10)
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55
  return 0
}

const computeMrzCheckDigit = (str) => {
  let total = 0
  for (let i = 0; i < str.length; i++) {
    total += MRZ_CHAR_VALUE(str[i]) * MRZ_WEIGHTS[i % 3]
  }
  return total % 10
}

const validateMrzChecksum = (field, check) => {
  return computeMrzCheckDigit(field) === parseInt(check, 10)
}

const parseMrzLines = (lines) => {
  const cleaned = lines.map(l => l.replace(/\s/g, '').toUpperCase())
  const result = { docType: null, country: null, dob: null, ageOver18: false, mrzValid: false, checksumValid: false, layoutValid: false }

  if (cleaned.length === 2 && cleaned[0].length >= 44 && cleaned[1].length >= 44) {
    result.docType = 'passport'
    result.layoutValid = true
    const line1 = cleaned[0]
    const line2 = cleaned[1]
    result.country = line1.substring(2, 5).replace(/</g, '')

    const dobRaw = line2.substring(0, 6)
    const dobCheck = line2[6]
    if (/^\d{6}$/.test(dobRaw)) {
      result.checksumValid = validateMrzChecksum(dobRaw, dobCheck)
      const yy = parseInt(dobRaw.substring(0, 2), 10)
      const mm = parseInt(dobRaw.substring(2, 4), 10)
      const dd = parseInt(dobRaw.substring(4, 6), 10)
      const century = yy > 50 ? 1900 : 2000
      const year = century + yy
      result.dob = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      const today = new Date()
      const birth = new Date(year, mm - 1, dd)
      const ageDiff = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      const dayDiff = today.getDate() - birth.getDate()
      const age = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? ageDiff - 1 : ageDiff
      result.ageOver18 = age >= 18
      result.mrzValid = true
    }
    return result
  }

  if (cleaned.length === 3 && cleaned[0].length >= 30) {
    result.docType = 'id_card'
    result.layoutValid = true
    const line2 = cleaned[1] || ''
    result.country = (cleaned[0].substring(2, 5) || '').replace(/</g, '')
    const dobRaw = line2.substring(0, 6)
    const dobCheck = line2[6]
    if (/^\d{6}$/.test(dobRaw)) {
      result.checksumValid = validateMrzChecksum(dobRaw, dobCheck)
      const yy = parseInt(dobRaw.substring(0, 2), 10)
      const mm = parseInt(dobRaw.substring(2, 4), 10)
      const dd = parseInt(dobRaw.substring(4, 6), 10)
      const century = yy > 50 ? 1900 : 2000
      const year = century + yy
      result.dob = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      const today = new Date()
      const birth = new Date(year, mm - 1, dd)
      const ageDiff = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      const dayDiff = today.getDate() - birth.getDate()
      const age = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? ageDiff - 1 : ageDiff
      result.ageOver18 = age >= 18
      result.mrzValid = true
    }
    return result
  }

  return result
}

const extractDobFromText = (text) => {
  const patterns = [
    /(?:DOB|DATE\s*OF\s*BIRTH|BORN|D\.O\.B)[:\s]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
    /(?:DOB|DATE\s*OF\s*BIRTH|BORN|D\.O\.B)[:\s]*(\d{2,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/i,
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,
    /(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (!m) continue
    let day, month, year
    if (m[3] && m[3].length === 4) {
      day = parseInt(m[1], 10); month = parseInt(m[2], 10); year = parseInt(m[3], 10)
    } else if (m[1] && m[1].length === 4) {
      year = parseInt(m[1], 10); month = parseInt(m[2], 10); day = parseInt(m[3], 10)
    } else continue
    if (year < 1900 || year > new Date().getFullYear() || month < 1 || month > 12 || day < 1 || day > 31) continue
    const dob = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const today = new Date()
    const birth = new Date(year, month - 1, day)
    const ageDiff = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    const dayDiff = today.getDate() - birth.getDate()
    const age = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? ageDiff - 1 : ageDiff
    return { dob, ageOver18: age >= 18 }
  }
  return null
}

const detectDocType = (text) => {
  const upper = text.toUpperCase()
  if (upper.includes('PASSPORT') || /P<[A-Z]{3}/.test(upper)) return 'passport'
  if (upper.includes('DRIVING LIC') || upper.includes('DRIVER')) return 'driving_licence'
  if (upper.includes('IDENTITY') || upper.includes('CARTE') || upper.includes('NATIONAL ID')) return 'id_card'
  return 'unknown'
}

const AgeVerificationModal = ({ channelName, onClose, onVerified }) => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const abortRef = useRef(false)
  const fileInputRef = useRef(null)
  const idCanvasRef = useRef(null)

  const [wizardPage, setWizardPage] = useState(0)
  const [slideDir, setSlideDir] = useState('forward')
  const [modelsReady, setModelsReady] = useState(false)
  const [method, setMethod] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [retriesLeft, setRetriesLeft] = useState(MAX_RETRIES)
  const [progress, setProgress] = useState({ framesCollected: 0, totalTarget: TARGET_FRAMES, validFrames: 0 })
  const [result, setResult] = useState(null)

  const [faceDetected, setFaceDetected] = useState(false)
  const [qualityIssue, setQualityIssue] = useState('')
  const [finalVerdict, setFinalVerdict] = useState(null)

  const [idPhase, setIdPhase] = useState(null)
  const [idStatus, setIdStatus] = useState('')
  const [idResult, setIdResult] = useState(null)
  const [idDocCaptured, setIdDocCaptured] = useState(false)

  const PAGES = ['welcome', 'info', 'method', 'verify', 'result', 'conclude']

  const goToPage = (page) => {
    setSlideDir(page > wizardPage ? 'forward' : 'back')
    setWizardPage(page)
  }

  const phaseRef = useRef(phase)
  const modelsLoadedRef = useRef(false)
  const recognitionLoadedRef = useRef(false)
  const ageResultsRef = useRef([])
  const landmarkHistoryRef = useRef([])
  const liveFaceDescriptorRef = useRef(null)
  const faceProofRef = useRef(null)

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    loadModels()
    return () => {
      abortRef.current = true
      stopCamera()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  const loadModels = async () => {
    try {
      console.log('[AgeVerification] Starting to load models from:', MODEL_URL)
      
      // Add timeout for model loading
      const modelLoadPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
      ])
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Model loading timed out')), 60000)
      )
      
      await Promise.race([modelLoadPromise, timeoutPromise])
      modelsLoadedRef.current = true
      console.log('[AgeVerification] Models loaded successfully')
      setModelsReady(true)
    } catch (err) {
      console.error('[AgeVerification] Failed to load models:', err)
      setError('Failed to load AI models. Please refresh and try again. If the issue persists, your browser may not be supported.')
      // Still set modelsReady to allow the user to at least close the modal
      setModelsReady(true)
    }
  }

  const loadRecognitionModel = async () => {
    if (recognitionLoadedRef.current) return
    
    try {
      // Add timeout for recognition model loading
      const modelLoadPromise = Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Recognition model loading timed out')), 60000)
      )
      
      await Promise.race([modelLoadPromise, timeoutPromise])
      recognitionLoadedRef.current = true
    } catch (err) {
      console.error('[AgeVerification] Failed to load recognition model:', err)
      throw err
    }
  }

  // ── Camera ──

  const startCamera = async (facingMode = 'user') => {
    try {
      console.log('[AgeVerification] Starting camera, facingMode:', facingMode)
      stopCamera()
      abortRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
      })
      console.log('[AgeVerification] Camera stream obtained:', stream.id)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            console.log('[AgeVerification] Video metadata loaded, videoWidth:', videoRef.current.videoWidth)
            videoRef.current.play()
            resolve()
          }
        })
      }
    } catch (err) {
      console.error('[AgeVerification] Camera error:', err)
      setPhase('camera-denied')
      setStatus('Camera access denied. Please allow camera access and try again.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  // ── Image quality helpers ──

  const computeSharpness = (imageData) => {
    const gray = new Float32Array(imageData.width * imageData.height)
    const d = imageData.data
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
    }
    let lapSum = 0
    const w = imageData.width, h = imageData.height
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x
        const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w]
        lapSum += lap * lap
      }
    }
    return lapSum / ((w - 2) * (h - 2))
  }

  const checkExposure = (imageData) => {
    const d = imageData.data
    let sum = 0
    const count = d.length / 4
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const mean = sum / count
    return mean > 40 && mean < 220
  }

  const checkFaceQuality = (detection, videoWidth, videoHeight, imageData) => {
    const box = detection.detection.box
    if (box.width / videoWidth < MIN_FACE_RATIO) return 'Move closer - face too small'
    const landmarks = detection.landmarks
    if (landmarks) {
      const jaw = landmarks.getJawOutline(), nose = landmarks.getNose()
      if (jaw.length > 0 && nose.length > 0) {
        const jawCenter = (jaw[0].x + jaw[jaw.length - 1].x) / 2
        const jawWidth = jaw[jaw.length - 1].x - jaw[0].x
        if (Math.abs(nose[nose.length - 1].x - jawCenter) / jawWidth > 0.2) return 'Face the camera directly'
        const le = landmarks.getLeftEye(), re = landmarks.getRightEye()
        if (le.length > 0 && re.length > 0) {
          const roll = Math.abs(Math.atan2(re[3].y - le[0].y, re[3].x - le[0].x) * 180 / Math.PI)
          if (roll > MAX_YAW_DEGREES * 1.5) return 'Keep your head level'
        }
      }
    }
    if (computeSharpness(imageData) < SHARPNESS_THRESHOLD * 0.8) return 'Image too blurry - hold still'
    if (!checkExposure(imageData)) return 'Adjust lighting - too dark or too bright'
    return null
  }

  const drawFaceOverlay = (detection, good = false) => {
    const canvas = overlayCanvasRef.current, video = videoRef.current
    if (!canvas || !video || !video.videoWidth) return
    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const resized = faceapi.resizeResults(detection, displaySize)
    const box = resized.detection.box
    ctx.strokeStyle = good ? '#22c55e' : '#60a5fa'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.setLineDash([])
    if (resized.landmarks) {
      ctx.fillStyle = '#60a5fa88'
      for (const pt of resized.landmarks.positions) {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  const getImageData = () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  // ── FACE VERIFICATION FLOW ──

  const startFaceVerification = async () => {
    setMethod('face')
    goToPage(3)
    setPhase('face-quality')
    setStatus('Position your face within the frame. Good lighting, face centered.')
    setQualityIssue('')
    setFaceDetected(false)
    await new Promise(r => setTimeout(r, 50))
    await startCamera('user')
    runQualityCheckLoop()
  }

  const runQualityCheckLoop = async () => {
    if (abortRef.current) return
    const video = videoRef.current
    if (!video || video.readyState < 2) { animFrameRef.current = requestAnimationFrame(runQualityCheckLoop); return }
    try {
      // Lower threshold to 0.3 for better face detection reliability
      const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 })).withFaceLandmarks().withAgeAndGender()
      if (det) {
        const imgData = getImageData()
        const issue = imgData ? checkFaceQuality(det, video.videoWidth, video.videoHeight, imgData) : null
        setQualityIssue(issue || ''); setFaceDetected(!issue); drawFaceOverlay(det, !issue)
        if (!issue) {
          setStatus('Face detected. Hold still - starting scan...')
          setTimeout(() => { if (!abortRef.current) startAgeEstimation() }, 500)
          return
        }
      } else {
        setFaceDetected(false); setQualityIssue('No face detected - look at the camera')
        const c = overlayCanvasRef.current; if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
      }
    } catch (err) { console.error('Quality check error:', err) }
    if (!abortRef.current && phaseRef.current !== 'scanning') animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
  }

  const startAgeEstimation = async () => {
    setPhase('scanning'); setStatus('Scanning face - hold still...')
    ageResultsRef.current = []; landmarkHistoryRef.current = []
    const startTime = Date.now()
    let frameCount = 0, validCount = 0

    const captureLoop = async () => {
      if (abortRef.current) return
      if (Date.now() - startTime > CAPTURE_DURATION_MS || validCount >= TARGET_FRAMES) { 
        console.log('[AgeVerification] Scan complete:', { frameCount, validCount, duration: Date.now() - startTime })
        finishAgeEstimation(); return 
      }
      const video = videoRef.current
      if (!video || video.readyState < 2) { 
        animFrameRef.current = requestAnimationFrame(captureLoop); return 
      }
      try {
        // Lower threshold to 0.3 for better detection during scanning
        const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 })).withFaceLandmarks().withAgeAndGender()
        frameCount++
        if (det) {
          drawFaceOverlay(det)
          const imgData = getImageData()
          const issue = imgData ? checkFaceQuality(det, video.videoWidth, video.videoHeight, imgData) : null
          if (!issue) {
            validCount++
            ageResultsRef.current.push({ age: det.age, gender: det.gender, genderProbability: det.genderProbability, score: det.detection.score })
            const lm = det.landmarks
            if (lm) {
              const nt = lm.getNose()[3]
              landmarkHistoryRef.current.push({ x: nt.x, y: nt.y, t: Date.now() })
            }
          }
          setProgress({ framesCollected: frameCount, totalTarget: TARGET_FRAMES, validFrames: validCount })
        } else {
          // No face detected this frame
          setProgress({ framesCollected: frameCount, totalTarget: TARGET_FRAMES, validFrames: validCount })
        }
      } catch (err) { 
        console.error('[AgeVerification] Scan frame error:', err.message) 
      }
      animFrameRef.current = requestAnimationFrame(captureLoop)
    }
    captureLoop()
  }

  const checkPassiveLiveness = () => {
    const h = landmarkHistoryRef.current
    if (h.length < LIVENESS_MIN_MOTION_FRAMES) return false
    let motionFrames = 0
    for (let i = 1; i < h.length; i++) {
      if (Math.abs(h[i].x - h[i - 1].x) > LIVENESS_MOTION_THRESHOLD || Math.abs(h[i].y - h[i - 1].y) > LIVENESS_MOTION_THRESHOLD) motionFrames++
    }
    return motionFrames >= 2
  }

  const finishAgeEstimation = () => {
    const ages = ageResultsRef.current
    if (ages.length < MIN_VALID_FRAMES) {
      setPhase('retry-needed'); setStatus(`Not enough valid frames (${ages.length}/${MIN_VALID_FRAMES}). Try again with better lighting.`); return
    }
    computeFaceVerdict(ages)
  }

  const computeFaceVerdict = (ages) => {
    const vals = ages.map(a => a.age), n = vals.length
    const mu = vals.reduce((s, v) => s + v, 0) / n
    const sigma = Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / n)
    const probOver18 = vals.filter(a => a >= AGE_THRESHOLD).length / n
    const lb = mu - 2 * sigma, ub = mu + 2 * sigma

    let verdict
    if (probOver18 >= PASS_PROBABILITY && lb >= AGE_THRESHOLD + AGE_BUFFER) verdict = 'adult'
    else if (probOver18 <= FAIL_PROBABILITY && ub <= AGE_THRESHOLD - AGE_BUFFER) verdict = 'child'
    else if (probOver18 >= PASS_PROBABILITY || lb >= AGE_THRESHOLD) verdict = 'adult'
    else if (probOver18 <= (1 - PASS_PROBABILITY) || ub <= AGE_THRESHOLD) verdict = 'child'
    else verdict = 'uncertain'

    const faceResult = {
      verdict,
      meanAge: Math.round(mu * 10) / 10,
      stdDev: Math.round(sigma * 10) / 10,
      probOver18: Math.round(probOver18 * 1000) / 1000,
      lowerBound: Math.round(lb * 10) / 10,
      upperBound: Math.round(ub * 10) / 10,
      validFrames: n,
      passiveMotion: checkPassiveLiveness(),
      liveness: { passive: checkPassiveLiveness(), passed: checkPassiveLiveness() },
      modelVersion: 'face-api-vladmandic-1.7'
    }

    faceProofRef.current = faceResult
    setResult(faceResult)

    if (method === 'face') {
      if (verdict === 'adult') { setPhase('pass'); setFinalVerdict('pass'); goToPage(4); submitFinalVerification('face', faceResult, null) }
      else if (verdict === 'child') { setPhase('fail'); setFinalVerdict('fail'); goToPage(4); submitFinalVerification('face', faceResult, null) }
      else { setPhase('retry-needed'); setStatus('Could not determine age with confidence. Try ID verification or retry.') }
    } else if (method === 'hybrid') {
      if (verdict === 'adult') {
        setPhase('pass'); setFinalVerdict('pass'); goToPage(4)
        submitFinalVerification('hybrid', faceResult, idResult)
      } else {
        captureLiveFaceDescriptor()
        setPhase('id-prompt'); setStatus('Face scan inconclusive. Please provide an ID document to complete hybrid verification.')
      }
    }
  }

  const captureLiveFaceDescriptor = async () => {
    try {
      await loadRecognitionModel()
      const video = videoRef.current
      if (!video) return
      const det = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options()).withFaceLandmarks().withFaceDescriptor()
      if (det) liveFaceDescriptorRef.current = det.descriptor
    } catch (err) { console.error('Failed to capture live face descriptor:', err) }
  }

  // ── ID VERIFICATION FLOW ──

  const startIdVerification = async () => {
    if (method !== 'hybrid') setMethod('id')
    goToPage(3)
    setIdDocCaptured(false); setIdResult(null)
    if (method !== 'hybrid') {
      setPhase('id-live-face')
      setStatus('First, we need a live face scan for face matching. Look at the camera.')
      setIdPhase('capture'); setIdStatus('Capture or upload a photo of your ID document (front side).')
      await new Promise(r => setTimeout(r, 50))
      await startCamera('user')
      await captureLiveFaceForId()
    } else {
      setIdPhase('capture'); setIdStatus('Capture or upload a photo of your ID document (front side).')
    }
  }

  const captureLiveFaceForId = async () => {
    try {
      await loadRecognitionModel()
      setPhase('id-live-face'); setStatus('Detecting your live face for ID matching...')
      const waitForFace = async () => {
        if (abortRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2) { animFrameRef.current = requestAnimationFrame(waitForFace); return }
        try {
          const det = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor()
          if (det) {
            drawFaceOverlay(det)
            liveFaceDescriptorRef.current = det.descriptor
            setStatus('Live face captured. Now provide your ID document.')
            stopCamera()
            setIdPhase('capture')
            setPhase('id-capture')
            setIdStatus('Upload a photo of your ID document (front side with MRZ or date of birth visible).')
          } else {
            console.log('[AgeVerification] ID live face: No face detected, retrying...')
            animFrameRef.current = requestAnimationFrame(waitForFace)
          }
        } catch (err) {
          console.error('[AgeVerification] ID live face detection error:', err)
          animFrameRef.current = requestAnimationFrame(waitForFace)
        }
      }
      waitForFace()
    } catch (err) {
      console.error('Live face capture failed:', err); setError('Could not detect face. Please retry.')
    }
  }

  const handleIdFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIdPhase('processing'); setIdStatus('Processing ID document locally... This may take a moment.')
    setPhase('id-processing')
    setStatus('Running local OCR and document checks. No data leaves your device.')

    try {
      const img = await loadImageFromFile(file)
      const idCanvas = idCanvasRef.current || document.createElement('canvas')
      idCanvas.width = img.width; idCanvas.height = img.height
      const ctx = idCanvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imgData = ctx.getImageData(0, 0, img.width, img.height)
      const docSharpness = computeSharpness(imgData)
      const docExposure = checkExposure(imgData)
      if (docSharpness < 30) { setIdStatus('Document image is too blurry. Please retake.'); setIdPhase('capture'); setPhase('id-capture'); return }
      if (!docExposure) { setIdStatus('Document image has poor lighting. Please retake.'); setIdPhase('capture'); setPhase('id-capture'); return }

      setIdStatus('Running local OCR (Tesseract.js)...')
      
      // Add timeout for tesseract worker to prevent hanging
      const workerPromise = createWorker('eng')
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tesseract initialization timed out')), 30000)
      )
      
      let worker
      try {
        worker = await Promise.race([workerPromise, timeoutPromise])
      } catch (err) {
        console.error('[AgeVerification] Tesseract worker failed to initialize:', err)
        setIdStatus('OCR initialization failed. Please try a different verification method.')
        setIdPhase('capture')
        setPhase('id-capture')
        return
      }
      
      const { data } = await worker.recognize(img)
      await worker.terminate()

      const fullText = data.text || ''
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 5)

      const mrzLines = lines.filter(l => /^[A-Z0-9<]{20,}$/.test(l.replace(/\s/g, '')))
      let mrzResult = null
      if (mrzLines.length >= 2) mrzResult = parseMrzLines(mrzLines)

      const detectedDocType = mrzResult?.docType || detectDocType(fullText)
      let dobResult = null
      if (!mrzResult?.dob) dobResult = extractDobFromText(fullText)

      const dob = mrzResult?.dob || dobResult?.dob || null
      const ageOver18 = mrzResult?.ageOver18 || dobResult?.ageOver18 || false

      await loadRecognitionModel()
      let faceMatchResult = { similarity: 0, threshold: FACE_MATCH_THRESHOLD, passed: false }
      try {
        const idFace = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor()
        if (idFace && liveFaceDescriptorRef.current) {
          const distance = faceapi.euclideanDistance(liveFaceDescriptorRef.current, idFace.descriptor)
          const similarity = Math.round((1 - distance) * 100) / 100
          faceMatchResult = { similarity, threshold: FACE_MATCH_THRESHOLD, passed: similarity >= FACE_MATCH_THRESHOLD }
        }
      } catch (err) { console.error('Face match error:', err) }

      const tamperLikely = docSharpness < 40 && !docExposure

      const idVerificationResult = {
        docType: detectedDocType,
        country: mrzResult?.country || null,
        dob,
        ageOver18,
        docAuthenticity: {
          mrzValid: mrzResult?.mrzValid || false,
          checksumValid: mrzResult?.checksumValid || false,
          layoutValid: mrzResult?.layoutValid || (detectedDocType !== 'unknown'),
          tamperLikely
        },
        faceMatch: faceMatchResult,
        extractedBy: 'tesseract-js-local',
        verifiedAt: new Date().toISOString()
      }

      setIdResult(idVerificationResult)
      setIdDocCaptured(true)

      const idValid = (idVerificationResult.docAuthenticity.mrzValid || idVerificationResult.docAuthenticity.layoutValid) && !tamperLikely
      const faceMatchPassed = faceMatchResult.passed
      const idPassed = idValid && faceMatchPassed && ageOver18

      if (method === 'id') {
        if (idPassed) {
          setPhase('pass'); setFinalVerdict('pass'); setIdPhase('done'); goToPage(4)
          submitFinalVerification('id', faceProofRef.current, idVerificationResult)
        } else {
          const reasons = []
          if (!idValid) reasons.push('document authenticity check failed')
          if (!faceMatchPassed) reasons.push('face on ID does not match your live face')
          if (!ageOver18) reasons.push('date of birth indicates under 18')
          if (!dob) reasons.push('could not extract date of birth from document')
          setPhase('fail'); setFinalVerdict('fail'); setStatus(`ID verification failed: ${reasons.join('; ')}.`); setIdPhase('done'); goToPage(4)
          submitFinalVerification('id', null, idVerificationResult)
        }
      } else if (method === 'hybrid') {
        if (idPassed) {
          setPhase('pass'); setFinalVerdict('pass'); setIdPhase('done'); goToPage(4)
          submitFinalVerification('hybrid', faceProofRef.current, idVerificationResult)
        } else {
          const reasons = []
          if (!idValid) reasons.push('document check failed')
          if (!faceMatchPassed) reasons.push('face mismatch')
          if (!ageOver18) reasons.push('DOB indicates under 18')
          if (!dob) reasons.push('no DOB found')
          setPhase('fail'); setFinalVerdict('fail'); setStatus(`Hybrid verification failed: ${reasons.join('; ')}.`); setIdPhase('done'); goToPage(4)
          submitFinalVerification('hybrid', faceProofRef.current, idVerificationResult)
        }
      }

      URL.revokeObjectURL(img.src)
    } catch (err) {
      console.error('ID processing error:', err)
      setError('Failed to process document. Please try again with a clearer image.')
      setIdPhase('capture'); setPhase('id-capture')
    }
  }

  const loadImageFromFile = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  // ── HYBRID FLOW ──

  const startHybridVerification = async () => {
    setMethod('hybrid')
    goToPage(3)
    setPhase('face-quality')
    setStatus('Hybrid mode: Loading recognition models...')
    setQualityIssue('')
    setFaceDetected(false)
    await loadRecognitionModel()
    setStatus('Hybrid mode: Starting with face scan. Position your face within the frame.')
    await new Promise(r => setTimeout(r, 50))
    await startCamera('user')
    runQualityCheckLoop()
  }

  // ── SUBMIT ──

  const submitFinalVerification = async (verificationMethod, faceData, idData) => {
    const category = determineFinalCategory(verificationMethod, faceData, idData)
    try {
      const proofHash = await hashProof({ method: verificationMethod, face: faceData, id: idData, ts: Date.now() })
      const proofSummary = { method: verificationMethod, proofHash }

      if (faceData) {
        proofSummary.face_meanAge = faceData.meanAge
        proofSummary.face_stdDev = faceData.stdDev
        proofSummary.face_probOver18 = faceData.probOver18
        proofSummary.face_validFrames = faceData.validFrames
        proofSummary.face_lowerBound = faceData.lowerBound
        proofSummary.face_upperBound = faceData.upperBound
        proofSummary.face_passiveMotion = faceData.passiveMotion
        proofSummary.face_liveness_passed = faceData.liveness?.passed || false
        proofSummary.face_modelVersion = faceData.modelVersion
        proofSummary.face_verdict = faceData.verdict
      }

      if (idData) {
        proofSummary.id_docType = idData.docType
        proofSummary.id_country = idData.country || ''
        proofSummary.id_dob = idData.dob || ''
        proofSummary.id_ageOver18 = idData.ageOver18
        proofSummary.id_mrzValid = idData.docAuthenticity?.mrzValid || false
        proofSummary.id_checksumValid = idData.docAuthenticity?.checksumValid || false
        proofSummary.id_layoutValid = idData.docAuthenticity?.layoutValid || false
        proofSummary.id_tamperLikely = idData.docAuthenticity?.tamperLikely || false
        proofSummary.id_faceMatch_similarity = idData.faceMatch?.similarity || 0
        proofSummary.id_faceMatch_passed = idData.faceMatch?.passed || false
        proofSummary.id_extractedBy = idData.extractedBy
      }

      proofSummary.decision_passed = category === 'adult'
      proofSummary.decision_threshold = AGE_THRESHOLD
      proofSummary.decision_retries = MAX_RETRIES - retriesLeft

      const estimatedAge = faceData?.meanAge ? Math.round(faceData.meanAge) : (idData?.ageOver18 ? 18 : 13)

      const response = await apiService.submitAgeVerification({
        method: verificationMethod,
        proofSummary,
        category,
        estimatedAge,
        device: { userAgent: navigator.userAgent, locale: navigator.language }
      })
      stopCamera()
      onVerified?.(response.data?.ageVerification)
    } catch (err) {
      console.error('Verification submit failed:', err)
      setError(err?.response?.data?.error || 'Verification submission failed.')
      setPhase('error')
    }
  }

  const determineFinalCategory = (verificationMethod, faceData, idData) => {
    if (verificationMethod === 'face') return faceData?.verdict === 'adult' ? 'adult' : 'child'
    if (verificationMethod === 'id') {
      const idValid = idData && (idData.docAuthenticity?.mrzValid || idData.docAuthenticity?.layoutValid) && !idData.docAuthenticity?.tamperLikely
      return (idValid && idData?.faceMatch?.passed && idData?.ageOver18) ? 'adult' : 'child'
    }
    if (verificationMethod === 'hybrid') {
      if (faceData?.verdict === 'adult') return 'adult'
      const idValid = idData && (idData.docAuthenticity?.mrzValid || idData.docAuthenticity?.layoutValid) && !idData.docAuthenticity?.tamperLikely
      if (idValid && idData?.faceMatch?.passed && idData?.ageOver18) return 'adult'
      return 'child'
    }
    return 'child'
  }

  const hashProof = async (data) => {
    const text = JSON.stringify(data)
    const buf = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
  }

  // ── RETRY / CLOSE ──

  const handleRetry = () => {
    if (retriesLeft <= 0) return
    setRetriesLeft(r => r - 1)
    resetState()
    goToPage(2)
  }

  const resetState = () => {
    setMethod(null); setResult(null); setError(''); setQualityIssue(''); setFinalVerdict(null)
    setPhase('idle'); setStatus('')
    setProgress({ framesCollected: 0, totalTarget: TARGET_FRAMES, validFrames: 0 })
    setIdPhase(null); setIdStatus(''); setIdResult(null); setIdDocCaptured(false)
    ageResultsRef.current = []; landmarkHistoryRef.current = []
    faceProofRef.current = null; liveFaceDescriptorRef.current = null
    abortRef.current = true; cancelAnimationFrame(animFrameRef.current); stopCamera()
    setTimeout(() => { abortRef.current = false }, 100)
  }

  const closeModal = () => {
    abortRef.current = true; stopCamera(); cancelAnimationFrame(animFrameRef.current); onClose?.()
  }

  // ── UI HELPERS ──

  const showVideoFeed = ['face-quality', 'scanning', 'id-live-face'].includes(phase)
  const showIdUpload = ['id-capture', 'id-prompt'].includes(phase)
  const canRetry = (phase === 'retry-needed' || phase === 'fail' || phase === 'error' || phase === 'camera-denied') && retriesLeft > 0
  const verifying = ['face-quality', 'scanning', 'id-live-face', 'id-capture', 'id-processing', 'id-prompt'].includes(phase)
  const currentPageName = PAGES[wizardPage]

  const renderStepDots = () => (
    <div className="wizard-steps">
      {PAGES.map((name, i) => (
        <div key={name} className={`wizard-dot ${i === wizardPage ? 'active' : ''} ${i < wizardPage ? 'done' : ''}`}>
          <div className="dot-circle">{i < wizardPage ? <CheckCircle size={14} /> : i + 1}</div>
          <span className="dot-label">{['Welcome', 'Info', 'Method', 'Verify', 'Result', 'Done'][i]}</span>
        </div>
      ))}
    </div>
  )

  // ── PAGE: Welcome ──
  const renderWelcome = () => (
    <div className="wizard-page welcome-page">
      <div className="welcome-icon"><ShieldAlert size={48} /></div>
      <h2>Age Verification Required</h2>
      <p className="welcome-subtitle">
        Access to <strong>#{channelName || 'this channel'}</strong> requires age verification.
      </p>
      <div className="welcome-features">
        <div className="feature-item">
          <Lock size={20} />
          <div>
            <strong>100% On-Device</strong>
            <span>Everything runs locally in your browser. Nothing is uploaded.</span>
          </div>
        </div>
        <div className="feature-item">
          <Code size={20} />
          <div>
            <strong>Open Source</strong>
            <span>Every line of code is auditable. No black boxes.</span>
          </div>
        </div>
        <div className="feature-item">
          <ShieldCheck size={20} />
          <div>
            <strong>Zero Third-Party Services</strong>
            <span>No external APIs, SDKs, or cloud services involved. Period.</span>
          </div>
        </div>
      </div>
      {!modelsReady && (
        <div className="model-loading-inline">
          <div className="loading-spinner-small" />
          <span>Loading AI models...</span>
        </div>
      )}
      <div className="wizard-nav">
        <div />
        <button className="btn btn-primary" onClick={() => goToPage(1)} disabled={!modelsReady}>
          Get Started <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )

  // ── PAGE: Important Info ──
  const renderInfo = () => (
    <div className="wizard-page info-page">
      <h3>Before You Begin</h3>
      <p className="info-lead">Here is what you need to know about this verification process.</p>

      <div className="info-grid">
        <div className="info-card">
          <h4><Camera size={16} /> How It Works</h4>
          <ul>
            <li>AI models (TensorFlow.js) run directly in your browser</li>
            <li>Camera feed is processed in-memory only</li>
            <li>ID documents are scanned locally with Tesseract.js OCR</li>
            <li>Face on ID is matched to your live face using local embeddings</li>
          </ul>
        </div>
        <div className="info-card">
          <h4><ShieldCheck size={16} /> Privacy Guarantees</h4>
          <ul>
            <li>Zero images stored on disk or sent over the network</li>
            <li>No face embeddings or biometric templates persisted</li>
            <li>No analytics, session replay, or error logging</li>
            <li>No third-party SDKs, APIs, or cloud services</li>
          </ul>
        </div>
        <div className="info-card">
          <h4><Lock size={16} /> What We Store</h4>
          <ul>
            <li>Pass/fail verdict and a hashed proof transcript only</li>
            <li>OCR text discarded immediately after DOB extraction</li>
            <li>Face descriptors are in-memory only, garbage collected on close</li>
          </ul>
        </div>
        <div className="info-card">
          <h4><Eye size={16} /> Tips for Best Results</h4>
          <ul>
            <li>Good, even lighting on your face</li>
            <li>Remove hats, sunglasses, or masks</li>
            <li>For ID: ensure MRZ zone or DOB is clearly visible</li>
            <li>Blink naturally -- liveness checks detect frozen images</li>
          </ul>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={() => goToPage(0)}>
          <ChevronLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={() => goToPage(2)} disabled={!modelsReady}>
          {modelsReady ? <>Continue <ChevronRight size={16} /></> : <>Loading models...</>}
        </button>
      </div>
    </div>
  )

  // ── PAGE: Method Selection ──
  const renderMethodSelect = () => (
    <div className="wizard-page method-page">
      <h3>Choose Verification Method</h3>
      <p className="method-lead">Select how you would like to verify your age. All methods run entirely on your device.</p>
      <div className="method-cards">
        <button className="method-card" onClick={startFaceVerification}>
          <Camera size={32} />
          <strong>Face Scan</strong>
          <span>AI estimates your age from a live camera feed across 24 frames with blink liveness detection. Fastest option.</span>
          <div className="method-tag">~10 seconds</div>
        </button>
        <button className="method-card" onClick={startIdVerification}>
          <FileText size={32} />
          <strong>ID Document</strong>
          <span>Scan your ID locally. OCR extracts date of birth, MRZ checksums are validated, and face is matched to you.</span>
          <div className="method-tag">~30 seconds</div>
        </button>
        <button className="method-card" onClick={startHybridVerification}>
          <ScanLine size={32} />
          <strong>Hybrid</strong>
          <span>Face scan first. If the result is inconclusive, falls back to ID document. Most reliable approach.</span>
          <div className="method-tag recommended">Recommended</div>
        </button>
      </div>
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={() => goToPage(1)}>
          <ChevronLeft size={16} /> Back
        </button>
        <div />
      </div>
    </div>
  )

  // ── PAGE: Verification In Progress ──
  const renderVerification = () => (
    <div className="wizard-page verify-page">
      <canvas ref={idCanvasRef} className="hidden-canvas" aria-hidden="true" />

      {showVideoFeed && (
        <div className="video-shell">
          <video ref={videoRef} autoPlay playsInline muted className="verification-video" />
          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="overlay-canvas" />
        </div>
      )}

      {showIdUpload && (
        <div className="id-upload-area">
          <FileText size={40} className="id-icon" />
          <p>{idStatus || 'Upload a clear photo of the front of your ID document.'}</p>
          <input type="file" ref={fileInputRef} accept="image/*" capture="environment" onChange={handleIdFileUpload} className="hidden-input" />
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <FileText size={16} /> Upload ID Photo
          </button>
        </div>
      )}

      {phase === 'id-processing' && (
        <div className="id-processing-area">
          <div className="loading-spinner-small" />
          <p>{idStatus || 'Processing document locally...'}</p>
        </div>
      )}

      {!showVideoFeed && !showIdUpload && phase !== 'id-processing' && (
        <div className="video-shell">
          <video ref={videoRef} autoPlay playsInline muted className="verification-video" />
          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="overlay-canvas" />
        </div>
      )}

      <div className="verify-status-area">
        {status && <div className="verify-status"><strong>{status}</strong></div>}

        {qualityIssue && phase === 'face-quality' && (
          <div className="quality-hint"><AlertTriangle size={14} /> {qualityIssue}</div>
        )}

        {phase === 'scanning' && (
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${Math.min(100, (progress.validFrames / TARGET_FRAMES) * 100)}%` }} />
            <span className="progress-bar-label">{progress.validFrames}/{TARGET_FRAMES} valid frames</span>
          </div>
        )}

        {phase === 'id-prompt' && (
          <button className="btn btn-primary" onClick={() => { setIdPhase('capture'); setPhase('id-capture'); setIdStatus('Upload a photo of your ID document.') }}>
            <FileText size={16} /> Provide ID Document
          </button>
        )}

        {error && <div className="error-banner"><AlertTriangle size={16} /> {error}</div>}

        {canRetry && (
          <button className="btn btn-primary" onClick={handleRetry}>
            <RotateCcw size={16} /> Retry ({retriesLeft} left)
          </button>
        )}

        {phase === 'retry-needed' && retriesLeft === 0 && (
          <div className="hint-box">No retries left. Close and reopen later to try again.</div>
        )}
      </div>

      <div className="assurance-strip">
        <Lock size={12} /> 100% on-device &middot; open-source &middot; zero third-party services
      </div>
    </div>
  )

  // ── PAGE: Result ──
  const renderResult = () => (
    <div className="wizard-page result-page">
      <div className={`result-icon ${finalVerdict}`}>
        {finalVerdict === 'pass' ? <CheckCircle size={56} /> : <XCircle size={56} />}
      </div>
      <h2>{finalVerdict === 'pass' ? 'Verification Passed' : 'Verification Failed'}</h2>
      <p className="result-subtitle">
        {finalVerdict === 'pass'
          ? 'Your age has been verified as 18+. You now have access to this channel.'
          : status || 'The verification could not confirm you are 18 or older.'}
      </p>

      {result && (
        <div className="result-details">
          <h4>Scan Details</h4>
          <div className="result-grid">
            {result.meanAge !== undefined && <div><strong>Estimated Age</strong><span>{result.meanAge} (&plusmn;{result.stdDev})</span></div>}
            {result.probOver18 !== undefined && <div><strong>P(18+)</strong><span>{(result.probOver18 * 100).toFixed(1)}%</span></div>}
            {result.validFrames !== undefined && <div><strong>Valid Frames</strong><span>{result.validFrames}</span></div>}
            {result.lowerBound !== undefined && <div><strong>Age Range</strong><span>{result.lowerBound} - {result.upperBound}</span></div>}
            {result.passiveMotion !== undefined && <div><strong>Liveness</strong><span>Motion: {result.passiveMotion ? 'detected' : 'none'}</span></div>}
          </div>
        </div>
      )}

      {idResult && (
        <div className="result-details id-details">
          <h4>ID Document Details</h4>
          <div className="result-grid">
            <div><strong>Document</strong><span>{idResult.docType || 'unknown'}</span></div>
            {idResult.country && <div><strong>Country</strong><span>{idResult.country}</span></div>}
            <div><strong>DOB</strong><span>{idResult.dob || 'not found'}</span></div>
            <div><strong>Age 18+</strong><span>{idResult.ageOver18 ? 'Yes' : 'No'}</span></div>
            <div><strong>MRZ Valid</strong><span>{idResult.docAuthenticity?.mrzValid ? 'Yes' : 'No'}</span></div>
            <div><strong>Face Match</strong><span>{idResult.faceMatch?.passed ? `Yes (${(idResult.faceMatch.similarity * 100).toFixed(0)}%)` : `No (${(idResult.faceMatch?.similarity * 100 || 0).toFixed(0)}%)`}</span></div>
          </div>
        </div>
      )}

      <div className="wizard-nav">
        {finalVerdict === 'fail' && canRetry && (
          <button className="btn btn-secondary" onClick={handleRetry}>
            <RotateCcw size={16} /> Retry ({retriesLeft} left)
          </button>
        )}
        {!canRetry && finalVerdict === 'fail' && <div />}
        {finalVerdict === 'pass' && <div />}
        <button className="btn btn-primary" onClick={() => goToPage(5)}>
          {finalVerdict === 'pass' ? <>Continue <ChevronRight size={16} /></> : <>Close <ChevronRight size={16} /></>}
        </button>
      </div>
    </div>
  )

  // ── PAGE: Conclude ──
  const renderConclude = () => (
    <div className="wizard-page conclude-page">
      <div className={`conclude-icon ${finalVerdict}`}>
        {finalVerdict === 'pass' ? <ShieldCheck size={48} /> : <ShieldAlert size={48} />}
      </div>
      <h2>{finalVerdict === 'pass' ? 'You\'re All Set' : 'Verification Incomplete'}</h2>
      {finalVerdict === 'pass' ? (
        <>
          <p className="conclude-text">
            Your 18+ verification is complete and will not expire. You can now access age-restricted channels.
          </p>
          <div className="conclude-reminders">
            <div className="conclude-reminder">
              <Lock size={14} />
              <span>No images, video, or biometric data were stored or transmitted.</span>
            </div>
            <div className="conclude-reminder">
              <Code size={14} />
              <span>Only a pass/fail verdict and hashed proof were recorded.</span>
            </div>
          </div>
        </>
      ) : (
        <p className="conclude-text">
          {retriesLeft > 0
            ? 'You can close this dialog and try again later.'
            : 'No retries remaining. Close and reopen later to try again.'}
        </p>
      )}
      <div className="wizard-nav center">
        <button className="btn btn-primary" onClick={closeModal}>
          {finalVerdict === 'pass' ? <>Enter Channel <ArrowRight size={16} /></> : <>Close <X size={16} /></>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay av-overlay-enter" onClick={closeModal}>
      <div className="modal-content age-verification-modal av-modal-enter" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <ShieldAlert size={20} />
            <span>Age Verification</span>
          </div>
          <button className="modal-close" onClick={closeModal}><X size={18} /></button>
        </div>

        {renderStepDots()}

        <div className="wizard-body">
          <div key={wizardPage} className={`page-transition ${slideDir}`}>
            {currentPageName === 'welcome' && renderWelcome()}
            {currentPageName === 'info' && renderInfo()}
            {currentPageName === 'method' && renderMethodSelect()}
            {currentPageName === 'verify' && renderVerification()}
            {currentPageName === 'result' && renderResult()}
            {currentPageName === 'conclude' && renderConclude()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgeVerificationModal
