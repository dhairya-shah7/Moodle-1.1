const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')
const multer = require('multer')
const FormData = require('form-data')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const app = express()
const MOODLE = 'https://btech.glsmoodle.in'

app.disable('x-powered-by')
app.set('trust proxy', 1)

// ══════════════════════════════════════════
// 1. SECURITY HEADERS (helmet)
// ══════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", MOODLE],
      ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
}))

// ══════════════════════════════════════════
// 2. CORS — only allow our own frontend
// ══════════════════════════════════════════
const ALLOWED_ORIGINS = new Set(
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.APP_ORIGIN,
  ].filter(Boolean)
)
app.use('/proxy', cors({
  origin: (origin, cb) => {
    if (process.env.NODE_ENV !== 'production') {
      return cb(null, true)
    }
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true)
    cb(new Error('Blocked by CORS'))
  },
  credentials: true,
}))

// ══════════════════════════════════════════
// 3. RATE LIMITING
// ══════════════════════════════════════════
// Login: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// API: 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Rate limit exceeded. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Upload: 10 per 5 minutes
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads. Try again later.' },
})

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Block executable / dangerous file types
    const blocked = /\.(exe|bat|cmd|sh|ps1|vbs|js|msi|dll|com|scr)$/i
    if (blocked.test(file.originalname)) {
      return cb(new Error('File type not allowed'), false)
    }
    cb(null, true)
  },
})

// ══════════════════════════════════════════
// 4. ALLOWED MOODLE FUNCTIONS (whitelist)
// ══════════════════════════════════════════
const ALLOWED_FUNCTIONS = new Set([
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'core_enrol_get_enrolled_users',
  'core_user_get_users_by_field',
  'mod_assign_get_assignments',
  'mod_assign_get_submissions',
  'mod_assign_get_submission_status',
  'mod_assign_save_submission',
  'mod_assign_submit_for_grading',
  'mod_assign_save_grade',
  'mod_resource_get_resources_by_courses',
  'mod_url_get_urls_by_courses',
  'message_popup_get_popup_notifications',
  'gradereport_overview_get_course_grades',
])

// ══════════════════════════════════════════
// 5. TOKEN VALIDATION MIDDLEWARE
// ══════════════════════════════════════════
function requireToken(req, res, next) {
  const token = req.query.wstoken || req.body?.wstoken
  if (!token || token.length < 10) {
    return res.status(401).json({ error: 'Missing or invalid token' })
  }
  // Basic token format check (Moodle tokens are 32-char hex)
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return res.status(401).json({ error: 'Malformed token' })
  }
  next()
}

// ══════════════════════════════════════════
// 6. FUNCTION WHITELIST MIDDLEWARE
// ══════════════════════════════════════════
function requireAllowedFunction(req, res, next) {
  const fn = req.query.wsfunction || req.body?.wsfunction
  if (!fn || !ALLOWED_FUNCTIONS.has(fn)) {
    return res.status(403).json({ error: `Function '${fn}' is not allowed` })
  }
  next()
}

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

// ── Token login (rate-limited)
app.post('/proxy/token', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }
    // Sanitize: only allow alphanumeric + basic chars in username
    if (!/^[a-zA-Z0-9_@.\-]+$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username format' })
    }
    const r = await fetch(`${MOODLE}/login/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&service=moodle_mobile_app`,
    })
    const data = await r.json()
    console.log('[TOKEN]', data.token ? '✅ OK' : '❌ Failed')
    // Don't leak internal error details
    if (!data.token) {
      return res.status(401).json({ error: data.error || 'Invalid credentials' })
    }
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: 'Login service unavailable' })
  }
})

// ── Moodle REST API proxy (GET) — rate-limited, token-validated, function-whitelisted
app.get('/proxy/api', apiLimiter, requireToken, requireAllowedFunction, async (req, res) => {
  try {
    const rawQuery = req.url.replace('/proxy/api?', '')
    const fn = req.query.wsfunction || 'unknown'
    const r = await fetch(`${MOODLE}/webservice/rest/server.php?${rawQuery}`)
    const data = await r.json()
    const isErr = data?.exception || data?.errorcode
    console.log(`[API] ${fn}`, isErr ? '❌ ' + (data.message || data.errorcode) : '✅ OK')
    res.json(data)
  } catch (e) {
    console.log('[API ERROR]', e.message)
    res.status(500).json({ error: 'API request failed' })
  }
})

// ── Moodle REST API proxy (POST) — rate-limited, token-validated, function-whitelisted
app.post('/proxy/api', apiLimiter, requireToken, requireAllowedFunction, async (req, res) => {
  try {
    const params = new URLSearchParams({ ...req.query, ...req.body })
    const fn = params.get('wsfunction') || 'unknown'
    const r = await fetch(`${MOODLE}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await r.json()
    const isErr = data?.exception || data?.errorcode
    console.log(`[API POST] ${fn}`, isErr ? '❌ ' + (data.message || data.errorcode) : '✅ OK')
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: 'API request failed' })
  }
})

// ── Support FAQ feedback email proxy (hides target email from clients)
app.post('/proxy/feedback', apiLimiter, requireToken, async (req, res) => {
  try {
    const { username, message } = req.body
    if (!message) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    const r = await fetch('https://formsubmit.co/ajax/free243456@gmail.com', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://formsubmit.co/',
        'Origin': 'https://formsubmit.co'
      },
      body: JSON.stringify({
        'Roll Number': username || 'Anonymous',
        'Feedback / Inquiry': message,
        '_captcha': 'false'
      }),
    })
    const data = await r.json()
    console.log('[SUPPORT EMAIL] FormSubmit response:', data)
    const isSuccess = data.success === 'true' || data.success === true || String(data.message || '').toLowerCase().includes('success')
    res.json({ success: isSuccess })
  } catch (e) {
    console.error('[SUPPORT EMAIL ERROR]', e.message)
    res.status(500).json({ error: 'Failed to send feedback' })
  }
})


// ── File upload — rate-limited, token-required
app.post('/proxy/upload', uploadLimiter, upload.any(), async (req, res) => {
  try {
    const token = req.body.token || req.query.token
    if (!token || !/^[a-f0-9]{32}$/i.test(token)) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No file provided' })
    }

    const form = new FormData()
    req.files.forEach((f, i) => {
      form.append(`file_${i + 1}`, f.buffer, {
        filename: f.originalname,
        contentType: f.mimetype,
        knownLength: f.size,
      })
    })

    console.log('[UPLOAD] file:', req.files[0]?.originalname, req.files[0]?.size, 'bytes')
    const r = await fetch(`${MOODLE}/webservice/upload.php?token=${token}`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    })
    const data = await r.json()
    console.log('[UPLOAD RESULT]', JSON.stringify(data).slice(0, 200))
    res.json(data)
  } catch (e) {
    console.log('[UPLOAD ERROR]', e.message)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// ── Debug endpoint — DISABLED in production, protected in dev
app.get('/proxy/debug', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }
  res.status(403).json({ error: 'Debug endpoint disabled for security. Use Moodle API directly for testing.' })
})

// ── Catch unknown proxy routes
app.all('/proxy/*', (req, res) => {
  res.status(404).json({ error: 'Unknown endpoint' })
})

const path = require('path')

// Serve built React frontend
app.use(express.static(path.join(__dirname, '../dist')))

// Catch-all: send React app for any non-API route (React Router support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'))
})

// Global error handler — never leak stack traces
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message)
  res.status(err.status || 500).json({ error: 'Something went wrong' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`✅ GLS Proxy running at http://localhost:${PORT}`)
  console.log(`🛡️  Security: helmet, CORS, rate-limit, token-validation, function-whitelist`)
})
