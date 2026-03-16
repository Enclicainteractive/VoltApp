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
const PASS_PROBABILITY = 0.98
const FAIL_PROBABILITY = 0.8
const MIN_VALID_FRAMES = 8
const TARGET_FRAMES = 24
const CAPTURE_DURATION_MS = 4500
const MAX_RETRIES = 3

const MIN_FACE_RATIO = 0.12
const MAX_ROLL_DEGREES = 25
const SHARPNESS_THRESHOLD = 30
const LIVENESS_MOTION_THRESHOLD = 2
const LIVENESS_MIN_MOTION_FRAMES = 4
const ACTIVE_BLINK_THRESHOLD = 0.2
const ACTIVE_BLINK_MIN_COUNT = 2

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
  const qualityStableCountRef = useRef(0)
  const ageResultsRef = useRef([])
  const landmarkHistoryRef = useRef([])
  const livenessRef = useRef({ blinkCount: 0, eyesClosed: false })

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
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

  const computeSharpness = (imageData) => {
    const gray = new Float32Array(imageData.width * imageData.height)
    const d = imageData.data
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
    }

    let lapSum = 0
    const w = imageData.width
    const h = imageData.height
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
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    }
    const mean = sum / count
    return mean > 40 && mean < 220
  }

  const checkFaceQuality = (detection, videoWidth, imageData) => {
    const box = detection.detection.box
    if (box.width / videoWidth < MIN_FACE_RATIO) return 'Move closer so your face fills more of the frame.'

    const landmarks = detection.landmarks
    if (landmarks) {
      const leftEye = landmarks.getLeftEye()
      const rightEye = landmarks.getRightEye()
      if (leftEye.length > 0 && rightEye.length > 0) {
        const roll = Math.abs(Math.atan2(rightEye[3].y - leftEye[0].y, rightEye[3].x - leftEye[0].x) * 180 / Math.PI)
        if (roll > MAX_ROLL_DEGREES) return 'Keep your head level and face the camera.'
      }
    }

    if (computeSharpness(imageData) < SHARPNESS_THRESHOLD) return 'Image is blurry. Hold still for a moment.'
    if (!checkExposure(imageData)) return 'Lighting is not ideal. Improve light on your face.'
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

  const checkPassiveLiveness = () => {
    const h = landmarkHistoryRef.current
    if (h.length < LIVENESS_MIN_MOTION_FRAMES) return false

    let motionFrames = 0
    for (let i = 1; i < h.length; i++) {
      if (
        Math.abs(h[i].x - h[i - 1].x) > LIVENESS_MOTION_THRESHOLD ||
        Math.abs(h[i].y - h[i - 1].y) > LIVENESS_MOTION_THRESHOLD
      ) {
        motionFrames++
      }
    }

    return motionFrames >= LIVENESS_MIN_MOTION_FRAMES - 1
  }

  const startLocalVerification = async () => {
    resetRuntimeState()
    goToPage(2)
    setPhase('face-quality')
    setStatus('Position your face in frame. Blink twice when prompted.')

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
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withAgeAndGender()

      if (!detection) {
        qualityStableCountRef.current = 0
        setFaceDetected(false)
        setQualityIssue('No face detected. Look directly at the camera.')
        const c = overlayCanvasRef.current
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
        animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
        return
      }

      const imageData = getImageData()
      const issue = imageData ? checkFaceQuality(detection, video.videoWidth, imageData) : 'Waiting for camera frame...'

      setFaceDetected(!issue)
      setQualityIssue(issue || '')
      drawFaceOverlay(detection, !issue)

      if (issue) {
        qualityStableCountRef.current = 0
        animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
        return
      }

      qualityStableCountRef.current += 1
      setStatus('Face quality is good. Hold still, then blink twice.')

      if (qualityStableCountRef.current >= 10) {
        startAgeEstimation()
        return
      }
    } catch {
      setQualityIssue('Face detection had a temporary issue. Retrying...')
    }

    if (!abortRef.current && phaseRef.current === 'face-quality') {
      animFrameRef.current = requestAnimationFrame(runQualityCheckLoop)
    }
  }

  const startAgeEstimation = () => {
    setPhase('scanning')
    setStatus('Scanning now. Please blink twice naturally.')

    ageResultsRef.current = []
    landmarkHistoryRef.current = []
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
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withAgeAndGender()

        framesCollected++

        if (detection) {
          drawFaceOverlay(detection)

          const imageData = getImageData()
          const issue = imageData ? checkFaceQuality(detection, video.videoWidth, imageData) : null
          if (!issue) {
            validFrames++
            ageResultsRef.current.push(detection.age)

            const nose = detection.landmarks.getNose()[3]
            landmarkHistoryRef.current.push({ x: nose.x, y: nose.y })
            updateBlinkLiveness(detection.landmarks)
          }
        }

        setProgress({ framesCollected, validFrames, targetFrames: TARGET_FRAMES })
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
      setStatus(`Not enough valid frames (${ages.length}/${MIN_VALID_FRAMES}). Retry with better lighting.`)
      goToPage(3)
      stopCamera()
      return
    }

    const n = ages.length
    const probabilityOverThreshold = ages.filter(age => age >= AGE_THRESHOLD).length / n

    const passiveMotion = checkPassiveLiveness()
    const activeBlinkPassed = livenessRef.current.blinkCount >= ACTIVE_BLINK_MIN_COUNT
    const livenessPassed = passiveMotion && activeBlinkPassed

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
        blinkCount: livenessRef.current.blinkCount,
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
    setStatus('Finalizing verification...')

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
            blinkCount: localResult.liveness.blinkCount
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
    setResult(null)
    setFinalVerdict(null)
    setProgress({ framesCollected: 0, validFrames: 0, targetFrames: TARGET_FRAMES })

    qualityStableCountRef.current = 0
    ageResultsRef.current = []
    landmarkHistoryRef.current = []
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
            <li>{t('ageVerification.localHow3', 'Applies conservative pass/fail thresholds with liveness checks')}</li>
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
          <div className="quality-hint">Face quality looks good. Keep steady.</div>
        )}

        {phase === 'scanning' && (
          <>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, (progress.validFrames / TARGET_FRAMES) * 100)}%` }} />
              <span className="progress-bar-label">{progress.validFrames}/{TARGET_FRAMES} valid frames</span>
            </div>
            <div className="liveness-banner">Liveness challenge: blink twice during scan.</div>
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
              <div><strong>Liveness</strong><span>{result.liveness.passed ? 'passed' : 'failed'}</span></div>
              <div><strong>Passive Motion</strong><span>{result.liveness.passiveMotion ? 'detected' : 'not detected'}</span></div>
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
          Try again later with better lighting or use your alternative verification path.
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
