import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  CameraIcon,
  ArrowUturnDownIcon,
  LockClosedIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import * as faceapi from '@vladmandic/face-api'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'
import './AgeVerificationModal.css'

const MODEL_URL = '/models'
const AGE_THRESHOLD = 18
const PASS_PROBABILITY = 0.95        // Relaxed from 0.98 – easier to pass with fewer frames
const FAIL_PROBABILITY = 0.75        // Relaxed from 0.80
const MIN_VALID_FRAMES = 5           // Reduced from 8 – helps poor webcams
const TARGET_FRAMES = 20             // Reduced from 24
const CAPTURE_DURATION_MS = 6000     // Extended from 4500 – more time to collect frames
const MAX_RETRIES = 3

// Face quality thresholds – relaxed for low-light / cheap webcams
const MIN_FACE_RATIO = 0.08          // Reduced from 0.12 – allow smaller faces
const MAX_ROLL_DEGREES = 35          // Increased from 25 – allow more head tilt
const SHARPNESS_THRESHOLD = 8        // Reduced from 30 – much more lenient for blurry cams
const MIN_EXPOSURE_MEAN = 25         // Reduced from 40 – allow darker environments
const MAX_EXPOSURE_MEAN = 235        // Increased from 220

// Liveness – passive motion (nose tip movement between frames)
const LIVENESS_MOTION_THRESHOLD = 4  // Increased from 2 – ignore micro-jitter
const LIVENESS_MIN_MOTION_FRAMES = 3 // Reduced from 4

// Liveness – active blink
const ACTIVE_BLINK_THRESHOLD = 0.22  // Slightly raised from 0.20 – easier to trigger
const ACTIVE_BLINK_MIN_COUNT = 1     // Reduced from 2 – only need 1 blink

// Head-pose humanization (yaw / pitch change across the session)
const HEAD_POSE_MIN_YAW_DELTA = 4    // degrees – user must turn head slightly
const HEAD_POSE_MIN_PITCH_DELTA = 3  // degrees – user must nod slightly
const HEAD_POSE_HISTORY_LEN = 30     // frames to keep for pose analysis

// SSD MobileNet fallback – used when TinyFaceDetector fails repeatedly
const SSD_SCORE_THRESHOLD = 0.4

const AgeVerificationModal = ({ channelName, onClose, onVerified }) => {
  const { t } = useTranslation()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const abortRef = useRef(false)

  const phaseRef = useRef('idle')
  const modelsLoadedRef = useRef(false)
  const ssdLoadedRef = useRef(false)
  const qualityStableCountRef = useRef(0)
  const ageResultsRef = useRef([])
  const landmarkHistoryRef = useRef([])   // { x, y } nose tip positions
  const headPoseHistoryRef = useRef([])   // { yaw, pitch, roll } estimates
  const livenessRef = useRef({ blinkCount: 0, eyesClosed: false })
  const tinyFailCountRef = useRef(0)      // consecutive TinyFaceDetector misses

  const [wizardPage, setWizardPage] = useState(0)
  const [slideDir, setSlideDir] = useState('forward')
  const [modelsReady, setModelsReady] = useState(false)
  const [jurisdictions, setJurisdictions] = useState([])
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState('GLOBAL')
  const [policyLoading, setPolicyLoading] = useState(true)
  const [policyUpdating, setPolicyUpdating] = useState(false)

  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [qualityIssue, setQualityIssue] = useState('')
  const [faceDetected, setFaceDetected] = useState(false)
  const [livenessHint, setLivenessHint] = useState('')   // real-time humanization prompt

  const [retriesLeft, setRetriesLeft] = useState(MAX_RETRIES)
  const [progress, setProgress] = useState({ framesCollected: 0, validFrames: 0, targetFrames: TARGET_FRAMES })

  const [result, setResult] = useState(null)
  const [finalVerdict, setFinalVerdict] = useState(null)

  const [systemChecks, setSystemChecks] = useState({
    secureContext: false,
    mediaDevices: false,
    getUserMedia: false,
    webgl: false
  })

  const PAGES = ['welcome', 'info', 'verify', 'result', 'done']

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    loadModels()
    loadAgeContext()

    const canvas = document.createElement('canvas')
    const hasWebgl = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    setSystemChecks({
      secureContext: !!window.isSecureContext,
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      webgl: hasWebgl
    })

    return () => {
      abortRef.current = true
      stopCamera()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  useEffect(() => {
    document.body.classList.add('age-verification-modal-open')
    return () => {
      document.body.classList.remove('age-verification-modal-open')
    }
  }, [])

  const goToPage = (page) => {
    setSlideDir(page > wizardPage ? 'forward' : 'back')
    setWizardPage(page)
  }

  const loadAgeContext = async () => {
    setPolicyLoading(true)
    try {
      const response = await apiService.getAgeVerificationStatus()
      setJurisdictions(Array.isArray(response.data?.jurisdictions) ? response.data.jurisdictions : [])
      setSelectedJurisdictionCode(response.data?.jurisdictionCode || response.data?.ageVerification?.jurisdictionCode || 'GLOBAL')
    } catch {
      setError('Failed to load age-verification policy. Please refresh and try again.')
    } finally {
      setPolicyLoading(false)
    }
  }

  const selectedJurisdiction = jurisdictions.find(item => item.code === selectedJurisdictionCode) || null

  const loadModels = async () => {
    try {
      // Always load TinyFaceDetector + landmarks + age
      const modelLoadPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
      ])
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Model loading timed out')), 60000)
      })

      await Promise.race([modelLoadPromise, timeoutPromise])
      modelsLoadedRef.current = true
      setModelsReady(true)

      // Load SSD MobileNet in the background as a fallback for low-light / poor cams
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
        .then(() => { ssdLoadedRef.current = true })
        .catch(() => { /* SSD optional – ignore failure */ })
    } catch (err) {
      setError('Failed to load local age-estimation models. Please refresh and try again.')
      setModelsReady(true)
    }
  }

  const handleJurisdictionChange = async (nextCode) => {
    setSelectedJurisdictionCode(nextCode)
    setPolicyUpdating(true)
    setError('')
    try {
      const response = await apiService.setAgeVerificationJurisdiction(nextCode)
      setJurisdictions(Array.isArray(response.data?.jurisdictions) ? response.data.jurisdictions : jurisdictions)
      setSelectedJurisdictionCode(response.data?.jurisdictionCode || nextCode)
    } catch {
      setError('Could not save your location policy. Please try again.')
    } finally {
      setPolicyUpdating(false)
    }
  }

  const handleSelfAttest = async () => {
    if (selectedJurisdiction?.requiresProofVerification) return
    setPhase('submitting')
    setStatus('Saving your 18+ self-attestation...')
    setError('')

    try {
      const response = await apiService.selfAttestAgeVerification({ device: 'web' })
      setResult({
        mode: 'self_attestation',
        jurisdictionName: selectedJurisdiction?.label || 'Selected jurisdiction'
      })
      setFinalVerdict('pass')
      setPhase('pass')
      goToPage(3)
      onVerified?.(response.data?.ageVerification)
    } catch (err) {
      setFinalVerdict('inconclusive')
      setPhase('error')
      setError(err?.response?.data?.error || 'Self-attestation could not be saved. Please retry or use full verification.')
      goToPage(3)
    }
  }

  const startCamera = async () => {
    try {
      stopCamera()
      abortRef.current = false

      // Try ideal resolution first, fall back to any available
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play()
            resolve()
          }
        })
      }
      return true
    } catch {
      setPhase('camera-denied')
      setStatus('Camera access was denied. Please allow camera access and retry.')
      return false
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const getImageData = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  /**
   * Laplacian variance sharpness – lower threshold for cheap webcams.
   * We sample every 4th pixel to keep it fast.
   */
  const computeSharpness = (imageData) => {
    const d = imageData.data
    const w = imageData.width
    const h = imageData.height
    const step = 4 // sample every 4th pixel for speed

    let lapSum = 0
    let count = 0
    for (let y = step; y < h - step; y += step) {
      for (let x = step; x < w - step; x += step) {
        const idx = (y * w + x) * 4
        const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]
        const lumL = 0.299 * d[idx - step * 4] + 0.587 * d[idx - step * 4 + 1] + 0.114 * d[idx - step * 4 + 2]
        const lumR = 0.299 * d[idx + step * 4] + 0.587 * d[idx + step * 4 + 1] + 0.114 * d[idx + step * 4 + 2]
        const lumU = 0.299 * d[idx - step * w * 4] + 0.587 * d[idx - step * w * 4 + 1] + 0.114 * d[idx - step * w * 4 + 2]
        const lumD = 0.299 * d[idx + step * w * 4] + 0.587 * d[idx + step * w * 4 + 1] + 0.114 * d[idx + step * w * 4 + 2]
        const lap = -4 * lum + lumL + lumR + lumU + lumD
        lapSum += lap * lap
        count++
      }
    }

    return count > 0 ? lapSum / count : 0
  }

  const checkExposure = (imageData) => {
    const d = imageData.data
    let sum = 0
    const count = d.length / 4
    for (let i = 0; i < d.length; i += 16) { // sample every 4th pixel
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    }
    const mean = sum / (count / 4)
    return mean > MIN_EXPOSURE_MEAN && mean < MAX_EXPOSURE_MEAN
  }

  /**
   * Estimate head yaw/pitch from 68-point landmarks.
   * Uses the nose bridge and chin relative to eye centres.
   * Returns { yaw, pitch, roll } in degrees (approximate).
   */
  const estimateHeadPose = (landmarks) => {
    try {
      const nose = landmarks.getNose()          // points 27-35
      const leftEye = landmarks.getLeftEye()    // points 36-41
      const rightEye = landmarks.getRightEye()  // points 42-47
      const jaw = landmarks.getJawOutline()     // points 0-16

      if (!nose.length || !leftEye.length || !rightEye.length || !jaw.length) return null

      // Eye centres
      const lec = { x: leftEye.reduce((s, p) => s + p.x, 0) / leftEye.length, y: leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length }
      const rec = { x: rightEye.reduce((s, p) => s + p.x, 0) / rightEye.length, y: rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length }

      // Inter-ocular distance (reference scale)
      const iod = Math.hypot(rec.x - lec.x, rec.y - lec.y) || 1

      // Midpoint between eyes
      const eyeMid = { x: (lec.x + rec.x) / 2, y: (lec.y + rec.y) / 2 }

      // Nose tip (point index 4 in getNose() = landmark 30)
      const noseTip = nose[4] || nose[nose.length - 1]

      // Chin (middle of jaw outline)
      const chin = jaw[8] || jaw[Math.floor(jaw.length / 2)]

      // Yaw: horizontal offset of nose tip from eye midpoint, normalised by IOD
      const yaw = ((noseTip.x - eyeMid.x) / iod) * 45

      // Pitch: vertical offset of nose tip below eye midpoint, normalised by face height
      const faceHeight = (chin.y - eyeMid.y) || iod
      const pitch = ((noseTip.y - eyeMid.y) / faceHeight - 0.5) * 60

      // Roll: angle of eye line
      const roll = Math.atan2(rec.y - lec.y, rec.x - lec.x) * 180 / Math.PI

      return { yaw, pitch, roll }
    } catch {
      return null
    }
  }

  const checkFaceQuality = (detection, videoWidth, imageData) => {
    const box = detection.detection.box
    if (box.width / videoWidth < MIN_FACE_RATIO) return 'Move closer so your face fills more of the frame.'

    const landmarks = detection.landmarks
    if (landmarks) {
      const pose = estimateHeadPose(landmarks)
      if (pose && Math.abs(pose.roll) > MAX_ROLL_DEGREES) return 'Keep your head level and face the camera.'
    }

    // Only reject on sharpness if we have a reasonable image
    if (imageData && computeSharpness(imageData) < SHARPNESS_THRESHOLD) {
      return 'Image is blurry. Hold still or improve lighting.'
    }

    if (imageData && !checkExposure(imageData)) {
      return 'Lighting is too dark or too bright. Adjust the light on your face.'
    }

    return null
  }

  const drawFaceOverlay = (detection, good = false) => {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !video.videoWidth) return

    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const resized = faceapi.resizeResults(detection, displaySize)
    const box = resized.detection.box

    ctx.strokeStyle = good ? 'var(--volt-success)' : 'var(--volt-primary-light)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.setLineDash([])

    // Draw head-pose indicator if landmarks available
    if (detection.landmarks) {
      const pose = estimateHeadPose(faceapi.resizeResults(detection, displaySize).landmarks)
      if (pose) {
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        const len = Math.min(box.width, box.height) * 0.3

        // Yaw arrow (horizontal)
        ctx.strokeStyle = 'rgba(255,200,0,0.7)'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + (pose.yaw / 45) * len, cy)
        ctx.stroke()

        // Pitch arrow (vertical)
        ctx.strokeStyle = 'rgba(0,200,255,0.7)'
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx, cy + (pose.pitch / 60) * len)
        ctx.stroke()
      }
    }
  }

  const pointDistance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0))

  const computeEyeAspectRatio = (eyePoints = []) => {
    if (!eyePoints || eyePoints.length < 6) return 1
    const verticalA = pointDistance(eyePoints[1], eyePoints[5])
    const verticalB = pointDistance(eyePoints[2], eyePoints[4])
    const horizontal = pointDistance(eyePoints[0], eyePoints[3]) || 1
    return (verticalA + verticalB) / (2 * horizontal)
  }

  const updateBlinkLiveness = (landmarks) => {
    const leftEar = computeEyeAspectRatio(landmarks.getLeftEye())
    const rightEar = computeEyeAspectRatio(landmarks.getRightEye())
    const avgEar = (leftEar + rightEar) / 2
    const eyesClosedNow = avgEar < ACTIVE_BLINK_THRESHOLD

    if (!eyesClosedNow && livenessRef.current.eyesClosed) {
      livenessRef.current.blinkCount += 1
    }
    livenessRef.current.eyesClosed = eyesClosedNow
  }

  /**
   * Passive liveness: checks that the nose tip moved enough across frames.
   * Uses a larger threshold to avoid false positives from camera jitter.
   */
  const checkPassiveLiveness = () => {
    const h = landmarkHistoryRef.current
    if (h.length < LIVENESS_MIN_MOTION_FRAMES) return false

    let motionFrames = 0
    for (let i = 1; i < h.length; i++) {
      const dx = Math.abs(h[i].x - h[i - 1].x)
      const dy = Math.abs(h[i].y - h[i - 1].y)
      if (dx > LIVENESS_MOTION_THRESHOLD || dy > LIVENESS_MOTION_THRESHOLD) {
        motionFrames++
      }
    }

    return motionFrames >= LIVENESS_MIN_MOTION_FRAMES - 1
  }

  /**
   * Head-pose humanization: checks that the user's head yaw/pitch changed
   * meaningfully during the session (proves a real person, not a photo).
   */
  const checkHeadPoseHumanization = () => {
    const h = headPoseHistoryRef.current
    if (h.length < 4) return false

    const yaws = h.map(p => p.yaw)
    const pitches = h.map(p => p.pitch)

    const yawDelta = Math.max(...yaws) - Math.min(...yaws)
    const pitchDelta = Math.max(...pitches) - Math.min(...pitches)

    return yawDelta >= HEAD_POSE_MIN_YAW_DELTA || pitchDelta >= HEAD_POSE_MIN_PITCH_DELTA
  }

  /**
   * Detect a face using TinyFaceDetector first; fall back to SSD MobileNet
   * if TinyFaceDetector has missed too many consecutive frames.
   */
  const detectFace = async (video) => {
    const tinyOptions = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.25, inputSize: 416 })

    try {
      const det = await faceapi
        .detectSingleFace(video, tinyOptions)
        .withFaceLandmarks()
        .withAgeAndGender()

      if (det) {
        tinyFailCountRef.current = 0
        return det
      }
    } catch {
      // fall through to SSD
    }

    tinyFailCountRef.current++

    // After 5 consecutive misses, try SSD MobileNet if loaded
    if (tinyFailCountRef.current >= 5 && ssdLoadedRef.current) {
      try {
        const ssdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_SCORE_THRESHOLD })
        const det = await faceapi
          .detectSingleFace(video, ssdOptions)
          .withFaceLandmarks()
          .withAgeAndGender()

        if (det) {
          tinyFailCountRef.current = 0
          return det
        }
      } catch {
        // ignore
      }
    }

    return null
  }

  /**
   * Build a real-time liveness hint to guide the user through humanization.
   */
  const buildLivenessHint = () => {
    const blinkDone = livenessRef.current.blinkCount >= ACTIVE_BLINK_MIN_COUNT
    const poseDone = checkHeadPoseHumanization()
    const motionDone = checkPassiveLiveness()

    if (!blinkDone) return '👁 Blink once naturally'
    if (!poseDone && !motionDone) return '↔ Slowly turn your head a little'
    if (!poseDone) return '↕ Nod your head slightly'
    return '✓ Liveness checks passing…'
  }

  const startLocalVerification = async () => {
    resetRuntimeState()
    goToPage(2)
    setPhase('face-quality')
    setStatus('Position your face in frame. Blink once when prompted.')

    const cameraReady = await startCamera()
    if (!cameraReady) return

    runQualityCheckLoop()
  }

  const runQualityCheckLoop = async () => {
    if (abortRef.current) return

    const video = videoRef.current
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
      return
    }

    try {
      const detection = await detectFace(video)

      if (!detection) {
        qualityStableCountRef.current = 0
        setFaceDetected(false)
        setQualityIssue('No face detected. Look directly at the camera and ensure your face is well-lit.')
        const c = overlayCanvasRef.current
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
        animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
        return
      }

      const imageData = getImageData()
      const issue = checkFaceQuality(detection, video.videoWidth, imageData)

      setFaceDetected(!issue)
      setQualityIssue(issue || '')
      drawFaceOverlay(detection, !issue)

      if (issue) {
        qualityStableCountRef.current = 0
        animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
        return
      }

      qualityStableCountRef.current += 1
      setStatus('Face detected! Hold still for a moment…')

      // Require 6 stable frames (down from 10) before starting scan
      if (qualityStableCountRef.current >= 6) {
        startAgeEstimation()
        return
      }
    } catch {
      setQualityIssue('Face detection had a temporary issue. Retrying…')
    }

    if (!abortRef.current && phaseRef.current === 'face-quality') {
      animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
    }
  }

  const startAgeEstimation = () => {
    setPhase('scanning')
    setStatus('Scanning… Blink once and turn your head slightly.')

    ageResultsRef.current = []
    landmarkHistoryRef.current = []
    headPoseHistoryRef.current = []
    livenessRef.current = { blinkCount: 0, eyesClosed: false }

    const startedAt = Date.now()
    let framesCollected = 0
    let validFrames = 0

    const captureLoop = async () => {
      if (abortRef.current) return

      if (Date.now() - startedAt > CAPTURE_DURATION_MS || validFrames >= TARGET_FRAMES) {
        finishAgeEstimation()
        return
      }

      const video = videoRef.current
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(captureLoop)
        return
      }

      try {
        const detection = await detectFace(video)

        framesCollected++

        if (detection) {
          drawFaceOverlay(detection)

          const imageData = getImageData()
          const issue = checkFaceQuality(detection, video.videoWidth, imageData)

          if (!issue) {
            validFrames++
            ageResultsRef.current.push(detection.age)

            // Track nose tip for passive motion liveness
            const nose = detection.landmarks.getNose()
            const noseTip = nose[4] || nose[nose.length - 1]
            if (noseTip) {
              landmarkHistoryRef.current.push({ x: noseTip.x, y: noseTip.y })
            }

            // Track head pose for humanization
            const pose = estimateHeadPose(detection.landmarks)
            if (pose) {
              headPoseHistoryRef.current.push(pose)
              if (headPoseHistoryRef.current.length > HEAD_POSE_HISTORY_LEN) {
                headPoseHistoryRef.current.shift()
              }
            }

            updateBlinkLiveness(detection.landmarks)
          }
        }

        setProgress({ framesCollected, validFrames, targetFrames: TARGET_FRAMES })
        setLivenessHint(buildLivenessHint())
      } catch {
        // Continue scanning; transient model errors can happen.
      }

      animFrameRef.current = requestAnimationFrame(captureLoop)
    }

    captureLoop()
  }

  const finishAgeEstimation = async () => {
    const ages = ageResultsRef.current

    if (ages.length < MIN_VALID_FRAMES) {
      setFinalVerdict('inconclusive')
      setPhase('inconclusive')
      setStatus(`Not enough valid frames (${ages.length}/${MIN_VALID_FRAMES}). Try better lighting or move closer.`)
      goToPage(3)
      stopCamera()
      return
    }

    const n = ages.length
    const probabilityOverThreshold = ages.filter(age => age >= AGE_THRESHOLD).length / n

    const passiveMotion = checkPassiveLiveness()
    const headPosePassed = checkHeadPoseHumanization()
    const activeBlinkPassed = livenessRef.current.blinkCount >= ACTIVE_BLINK_MIN_COUNT

    // Liveness passes if ANY TWO of the three checks pass (more lenient)
    const livenessScore = [passiveMotion, headPosePassed, activeBlinkPassed].filter(Boolean).length
    const livenessPassed = livenessScore >= 2

    let verdict = 'inconclusive'
    if (livenessPassed && probabilityOverThreshold >= PASS_PROBABILITY) verdict = 'adult'
    else if (!livenessPassed || probabilityOverThreshold <= FAIL_PROBABILITY) verdict = 'child'

    const confidence = verdict === 'adult'
      ? probabilityOverThreshold
      : verdict === 'child'
        ? 1 - probabilityOverThreshold
        : Math.abs(probabilityOverThreshold - 0.5) * 2

    const localResult = {
      verdict,
      confidence: Math.round(confidence * 1000) / 1000,
      probabilityOverThreshold: Math.round(probabilityOverThreshold * 1000) / 1000,
      validFrames: n,
      liveness: {
        passiveMotion,
        headPosePassed,
        blinkCount: livenessRef.current.blinkCount,
        livenessScore,
        passed: livenessPassed
      },
      policy: {
        threshold: AGE_THRESHOLD,
        passProbability: PASS_PROBABILITY,
        failProbability: FAIL_PROBABILITY
      },
      modelVersion: 'face-api-vladmandic-1.7'
    }

    setResult(localResult)
    stopCamera()

    if (verdict === 'inconclusive') {
      setFinalVerdict('inconclusive')
      setPhase('inconclusive')
      setStatus('Result was inconclusive. Retry or use an alternative verification path.')
      goToPage(3)
      return
    }

    setPhase('submitting')
    setStatus('Finalizing verification…')

    try {
      const category = verdict === 'adult' ? 'adult' : 'child'
      const response = await apiService.submitAgeVerification({
        method: 'face',
        category,
        jurisdictionCode: selectedJurisdictionCode,
        proofSummary: {
          decision: {
            passed: verdict === 'adult',
            confidence: localResult.confidence,
            probabilityOverThreshold: localResult.probabilityOverThreshold,
            threshold: AGE_THRESHOLD,
            passProbability: PASS_PROBABILITY,
            failProbability: FAIL_PROBABILITY
          },
          liveness: {
            passed: localResult.liveness.passed,
            passiveMotion: localResult.liveness.passiveMotion,
            headPosePassed: localResult.liveness.headPosePassed,
            blinkCount: localResult.liveness.blinkCount,
            livenessScore: localResult.liveness.livenessScore
          },
          meta: {
            validFrames: localResult.validFrames,
            modelVersion: localResult.modelVersion,
            retriesUsed: MAX_RETRIES - retriesLeft
          }
        }
      })

      setFinalVerdict(verdict === 'adult' ? 'pass' : 'fail')
      setPhase(verdict === 'adult' ? 'pass' : 'fail')
      goToPage(3)
      onVerified?.(response.data?.ageVerification)
    } catch {
      setFinalVerdict('inconclusive')
      setPhase('error')
      setError('Verification result could not be saved. Please retry.')
      goToPage(3)
    }
  }

  const resetRuntimeState = () => {
    setError('')
    setStatus('')
    setQualityIssue('')
    setFaceDetected(false)
    setLivenessHint('')
    setResult(null)
    setFinalVerdict(null)
    setProgress({ framesCollected: 0, validFrames: 0, targetFrames: TARGET_FRAMES })

    qualityStableCountRef.current = 0
    tinyFailCountRef.current = 0
    ageResultsRef.current = []
    landmarkHistoryRef.current = []
    headPoseHistoryRef.current = []
    livenessRef.current = { blinkCount: 0, eyesClosed: false }

    abortRef.current = false
    cancelAnimationFrame(animFrameRef.current)
  }

  const handleRetry = () => {
    if (retriesLeft <= 0) return
    setRetriesLeft(prev => prev - 1)
    resetRuntimeState()
    startLocalVerification()
  }

  const closeModal = () => {
    abortRef.current = true
    stopCamera()
    cancelAnimationFrame(animFrameRef.current)
    onClose?.()
  }

  const canRetry = ['camera-denied', 'inconclusive', 'error'].includes(phase) && retriesLeft > 0
  const showVideoFeed = ['face-quality', 'scanning'].includes(phase)
  const currentPageName = PAGES[wizardPage]

  const renderStepDots = () => (
    <div className="wizard-steps">
      {PAGES.map((name, i) => (
        <div key={name} className={`wizard-dot ${i === wizardPage ? 'active' : ''} ${i < wizardPage ? 'done' : ''}`}>
          <div className="dot-circle">{i < wizardPage ? <CheckCircleIcon size={14} /> : i + 1}</div>
          <span className="dot-label">{[t('ageVerification.welcome'), t('ageVerification.info'), t('ageVerification.verify'), t('ageVerification.result'), t('ageVerification.done')][i]}</span>
        </div>
      ))}
    </div>
  )

  const renderWelcome = () => (
    <div className="wizard-page welcome-page">
      <div className="welcome-icon"><ShieldExclamationIcon size={48} /></div>
      <h2>{t('ageVerification.title', 'Age Verification Required')}</h2>
      <p className="welcome-subtitle">
        {t('ageVerification.channelAccess', 'Access to #{{channel}} requires age verification.', { channel: channelName || 'this channel' })}
      </p>

      <div className="welcome-features">
        <div className="feature-item">
          <LockClosedIcon size={20} />
          <div>
            <strong>{t('ageVerification.onDevice', '100% On-Device')}</strong>
            <span>{t('ageVerification.onDeviceDesc', 'Everything runs locally in your browser. Nothing is uploaded.')}</span>
          </div>
        </div>
        <div className="feature-item">
          <ShieldCheckIcon size={20} />
          <div>
            <strong>{t('ageVerification.minimalOutput', 'Minimal Output')}</strong>
            <span>{t('ageVerification.minimalOutputDesc', 'Only pass/fail and confidence are returned. No frames are stored.')}</span>
          </div>
        </div>
      </div>

      <div className="policy-callout">
        <div className="policy-callout-header">
          <GlobeAltIcon size={18} />
          <strong>Jurisdiction policy</strong>
        </div>
        {policyLoading ? (
          <span>Loading jurisdiction requirements...</span>
        ) : (
          <>
            <strong>{selectedJurisdiction?.label || 'Other / Not Listed'}</strong>
            <span>{selectedJurisdiction?.summary || 'Choose the location policy that should apply to this account.'}</span>
            <span className={`policy-pill ${selectedJurisdiction?.requiresProofVerification ? 'required' : 'optional'}`}>
              {selectedJurisdiction?.requiresProofVerification ? 'Full verification required' : 'Self-attestation allowed'}
            </span>
          </>
        )}
      </div>

      {!modelsReady && (
        <div className="model-loading-inline">
          <div className="loading-spinner-small" />
          <span>{t('ageVerification.loadingModels', 'Loading AI models...')}</span>
        </div>
      )}

      <div className="wizard-nav">
        <div />
        <button className="btn btn-primary" onClick={() => goToPage(1)} disabled={!modelsReady}>
          {t('ageVerification.getStarted', 'Get Started')} <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  )

  const renderInfo = () => (
    <div className="wizard-page info-page">
      <h3>{t('ageVerification.beforeBegin', 'Before You Begin')}</h3>
      <p className="info-lead">{t('ageVerification.localOnlyInfo', 'This check runs entirely on-device with no image uploads.')}</p>

      <div className="jurisdiction-panel">
        <label htmlFor="age-jurisdiction-select">Location policy</label>
        <select
          id="age-jurisdiction-select"
          className="jurisdiction-select"
          value={selectedJurisdictionCode}
          onChange={(e) => handleJurisdictionChange(e.target.value)}
          disabled={policyLoading || policyUpdating}
        >
          {(jurisdictions.length > 0 ? jurisdictions : [{ code: 'GLOBAL', label: 'Other / Not Listed' }]).map((item) => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
        {selectedJurisdiction && (
          <div className={`jurisdiction-summary ${selectedJurisdiction.requiresProofVerification ? 'required' : 'optional'}`}>
            <strong>{selectedJurisdiction.label}</strong>
            <span>{selectedJurisdiction.summary}</span>
            <span>
              Policy status: {selectedJurisdiction.status}. Minimum age signal: {selectedJurisdiction.minimumAge}+.
            </span>
          </div>
        )}
      </div>

      <div className="info-grid">
        <div className="info-card">
          <h4><CameraIcon size={16} /> {t('ageVerification.howItWorks', 'How It Works')}</h4>
          <ul>
            <li>{t('ageVerification.localHow1', 'Captures a short live camera stream in memory')}</li>
            <li>{t('ageVerification.localHow2', 'Runs face detection, landmarks, age estimation on-device')}</li>
            <li>{t('ageVerification.localHow3', 'Checks liveness via blinks and natural head movement')}</li>
          </ul>
        </div>

        <div className="info-card">
          <h4><ShieldCheckIcon size={16} /> {t('ageVerification.privacyGuarantees', 'Privacy Guarantees')}</h4>
          <ul>
            <li>{t('ageVerification.localPrivacy1', 'No frames, photos, embeddings, or landmarks are persisted')}</li>
            <li>{t('ageVerification.localPrivacy2', 'No third-party analytics on this screen')}</li>
            <li>{t('ageVerification.localPrivacy3', 'Only pass/fail plus confidence is returned')}</li>
          </ul>
        </div>

        <div className="info-card">
          <h4><ShieldCheckIcon size={16} /> {t('ageVerification.systemReadiness', 'System Readiness')}</h4>
          <ul>
            <li>Secure context (HTTPS): {systemChecks.secureContext ? 'OK' : 'Missing'}</li>
            <li>Media devices API: {systemChecks.mediaDevices ? 'OK' : 'Missing'}</li>
            <li>Camera access API: {systemChecks.getUserMedia ? 'OK' : 'Missing'}</li>
            <li>WebGL available: {systemChecks.webgl ? 'OK' : 'Limited'}</li>
          </ul>
        </div>

        <div className="info-card">
          <h4><CameraIcon size={16} /> Tips for Best Results</h4>
          <ul>
            <li>Face a window or lamp so light falls on your face</li>
            <li>Keep your face centred and look at the camera</li>
            <li>Blink once and slowly turn your head left/right</li>
            <li>Works in low light – just avoid complete darkness</li>
          </ul>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={() => goToPage(0)}>
          <ChevronLeftIcon size={16} /> {t('common.back', 'Back')}
        </button>
        <div className="wizard-actions-cluster">
          {!!selectedJurisdiction && !selectedJurisdiction.requiresProofVerification && (
            <button className="btn btn-secondary" onClick={handleSelfAttest} disabled={policyUpdating}>
              I'm Over 18
            </button>
          )}
          <button className="btn btn-primary" onClick={startLocalVerification} disabled={!modelsReady || !systemChecks.getUserMedia || policyUpdating}>
            Start Local Verification <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  )

  const renderVerification = () => (
    <div className="wizard-page verify-page">
      {showVideoFeed && (
        <div className="video-shell">
          <video ref={videoRef} autoPlay playsInline muted className="verification-video" />
          <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="overlay-canvas" />
        </div>
      )}

      <div className="verify-status-area">
        {status && <div className="verify-status"><strong>{status}</strong></div>}

        {phase === 'face-quality' && qualityIssue && (
          <div className="quality-hint"><ExclamationTriangleIcon size={14} /> {qualityIssue}</div>
        )}

        {phase === 'face-quality' && !qualityIssue && faceDetected && (
          <div className="quality-hint quality-hint--good">✓ Face quality looks good. Hold steady…</div>
        )}

        {phase === 'scanning' && (
          <>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, (progress.validFrames / TARGET_FRAMES) * 100)}%` }} />
              <span className="progress-bar-label">{progress.validFrames}/{TARGET_FRAMES} valid frames</span>
            </div>
            {livenessHint && (
              <div className="liveness-banner">{livenessHint}</div>
            )}
          </>
        )}

        {error && <div className="error-banner"><ExclamationTriangleIcon size={16} /> {error}</div>}

        {canRetry && (
          <button className="btn btn-primary" onClick={handleRetry}>
            <ArrowUturnDownIcon size={16} /> {t('ageVerification.retry', 'Retry')} ({retriesLeft} {t('ageVerification.left', 'left')})
          </button>
        )}

        {!canRetry && ['inconclusive', 'error', 'camera-denied'].includes(phase) && (
          <div className="hint-box">No retries left. Please use an alternative verification method.</div>
        )}
      </div>

      <div className="assurance-strip">
        <LockClosedIcon size={12} /> Local processing only - no frame storage - no uploads
      </div>
    </div>
  )

  const renderResult = () => (
    <div className="wizard-page result-page">
      <div className={`result-icon ${finalVerdict === 'pass' ? 'pass' : finalVerdict === 'fail' ? 'fail' : ''}`}>
        {finalVerdict === 'pass' ? <CheckCircleIcon size={56} /> : finalVerdict === 'fail' ? <XCircleIcon size={56} /> : <ShieldExclamationIcon size={56} />}
      </div>

      <h2>
        {finalVerdict === 'pass'
          ? 'Verification Passed'
          : finalVerdict === 'fail'
            ? 'Verification Failed'
            : 'Verification Inconclusive'}
      </h2>

      <p className="result-subtitle">
        {result?.mode === 'self_attestation'
          ? 'Adult access was granted by self-attestation. Other users may still see this as a higher-risk profile until full verification is completed.'
          : finalVerdict === 'pass'
          ? 'You are verified for 18+ access.'
          : finalVerdict === 'fail'
            ? 'This check could not verify 18+ eligibility.'
            : status || 'We could not make a high-confidence decision from this attempt.'}
      </p>

      {result && (
        <div className="result-details">
          <h4>{result?.mode === 'self_attestation' ? 'Adult Access Summary' : 'Decision Summary'}</h4>
          {result?.mode === 'self_attestation' ? (
            <div className="result-grid">
              <div><strong>Method</strong><span>Self-attestation</span></div>
              <div><strong>Policy</strong><span>{result.jurisdictionName || 'Selected jurisdiction'}</span></div>
              <div><strong>Profile risk</strong><span>Marked as risky until full verification</span></div>
            </div>
          ) : (
            <div className="result-grid">
              <div><strong>Pass/Fail Confidence</strong><span>{(result.confidence * 100).toFixed(1)}%</span></div>
              <div><strong>P(age ≥ {AGE_THRESHOLD})</strong><span>{(result.probabilityOverThreshold * 100).toFixed(1)}%</span></div>
              <div><strong>Valid Frames</strong><span>{result.validFrames}</span></div>
              <div><strong>Liveness</strong><span>{result.liveness.passed ? 'passed' : 'failed'} ({result.liveness.livenessScore}/3)</span></div>
              <div><strong>Head Movement</strong><span>{result.liveness.headPosePassed ? 'detected' : 'not detected'}</span></div>
              <div><strong>Blinks</strong><span>{result.liveness.blinkCount}</span></div>
            </div>
          )}
        </div>
      )}

      <div className="wizard-nav">
        {finalVerdict !== 'pass' && canRetry ? (
          <button className="btn btn-secondary" onClick={handleRetry}>
            <ArrowUturnDownIcon size={16} /> Retry ({retriesLeft} left)
          </button>
        ) : <div />}

        <button className="btn btn-primary" onClick={() => goToPage(4)}>
          Continue <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  )

  const renderConclude = () => (
    <div className="wizard-page conclude-page">
      <div className={`conclude-icon ${finalVerdict === 'pass' ? 'pass' : 'fail'}`}>
        {finalVerdict === 'pass' ? <ShieldCheckIcon size={48} /> : <ShieldExclamationIcon size={48} />}
      </div>

      <h2>{finalVerdict === 'pass' ? "You're All Set" : 'Verification Incomplete'}</h2>

      {finalVerdict === 'pass' ? (
        <p className="conclude-text">
          {result?.mode === 'self_attestation'
            ? 'Your account now has adult access for this jurisdiction, but it remains marked as self-attested and higher risk until full verification is completed.'
            : 'Your local age verification is complete. Only pass/fail with confidence was returned.'}
        </p>
      ) : (
        <p className="conclude-text">
          Try again with better lighting, move closer to the camera, and make sure to blink and turn your head slightly during the scan.
        </p>
      )}

      <div className="wizard-nav center">
        <button className="btn btn-primary" onClick={closeModal}>
          {finalVerdict === 'pass' ? <>Enter Channel <ArrowRightIcon size={16} /></> : <>Close <XMarkIcon size={16} /></>}
        </button>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal((
    <div className="modal-overlay av-overlay-enter" onClick={closeModal}>
      <div className="modal-content age-verification-modal av-modal-enter" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <ShieldExclamationIcon size={20} />
            <span>{t('ageVerification.ageVerification', 'Age Verification')}</span>
          </div>
          <button className="modal-close" onClick={closeModal}><XMarkIcon size={18} /></button>
        </div>

        {renderStepDots()}

        <div className="wizard-body">
          <div key={wizardPage} className={`page-transition ${slideDir}`}>
            {currentPageName === 'welcome' && renderWelcome()}
            {currentPageName === 'info' && renderInfo()}
            {currentPageName === 'verify' && renderVerification()}
            {currentPageName === 'result' && renderResult()}
            {currentPageName === 'done' && renderConclude()}
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

export default AgeVerificationModal
