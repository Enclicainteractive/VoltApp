// Honeypot field names - these are hidden fields that bots might fill out
// but real users won't see or interact with
export const HONEYPOT_FIELDS = [
  'website',
  'url', 
  'homepage',
  'site',
  'comment',
  'hp_field'
]

// Generate honeypot field values - random bot trap
export const generateHoneypotField = () => {
  const fields = [
    'hp_' + Math.random().toString(36).substring(2, 10),
    'website',
    'url',
    'homepage'
  ]
  return fields[Math.floor(Math.random() * fields.length)]
}

// Create honeypot data object for forms
export const createHoneypotData = () => {
  const fieldName = generateHoneypotField()
  return {
    [fieldName]: '' // Empty = real user, filled = bot
  }
}

// Check if honeypot was triggered (field has value)
export const checkHoneypot = (data) => {
  for (const field of HONEYPOT_FIELDS) {
    if (data[field] && data[field].length > 0) {
      return true // Bot detected
    }
  }
  return false
}

// Add honeypot to request body
export const addHoneypotToRequest = (body) => {
  const hpData = createHoneypotData()
  return {
    ...body,
    ...hpData
  }
}

// CSRF token generation
export const generateCSRFToken = () => {
  return crypto.randomUUID()
}

// Store CSRF token
let csrfToken = null
export const getCSRFToken = () => {
  if (!csrfToken) {
    csrfToken = generateCSRFToken()
    sessionStorage.setItem('csrf_token', csrfToken)
  }
  return csrfToken
}

// Validate CSRF token
export const validateCSRFToken = (token) => {
  const stored = sessionStorage.getItem('csrf_token')
  return token === stored
}

// Request timestamp for replay attack prevention
export const addTimestamp = (body) => {
  return {
    ...body,
    _t: Date.now()
  }
}

// Validate request isn't too old (5 minutes)
export const isRequestValid = (timestamp) => {
  const maxAge = 5 * 60 * 1000 // 5 minutes
  return Date.now() - timestamp < maxAge
}
