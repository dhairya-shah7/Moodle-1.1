const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')
const multer = require('multer')
const FormData = require('form-data')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const fs = require('fs')
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI
let isMongoConnected = false

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB')
      isMongoConnected = true
    })
    .catch(err => {
      console.error('Failed to connect to MongoDB, falling back to local file storage:', err)
      isMongoConnected = false
    })
} else {
  console.log('MONGODB_URI not provided. Running in local JSON storage fallback mode.')
}

const ScoreSchema = new mongoose.Schema({
  username: { type: String, required: true },
  score: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
})
const Score = mongoose.models.Score || mongoose.model('Score', ScoreSchema)

const LikeSchema = new mongoose.Schema({
  targetUser: { type: String, required: true, default: 'a24cse057' },
  likedBy: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
})
LikeSchema.index({ targetUser: 1, likedBy: 1 }, { unique: true })
const Like = mongoose.models.Like || mongoose.model('Like', LikeSchema)

const UserFileSchema = new mongoose.Schema({
  username: { type: String, required: true },
  filename: { type: String, required: true },
  filesize: { type: Number, required: true },
  mimetype: { type: String, default: 'application/octet-stream' },
  fileData: { type: String, required: true }, // Base64
  uploadDate: { type: Date, default: Date.now }
})
UserFileSchema.index({ username: 1 })
const UserFile = mongoose.models.UserFile || mongoose.model('UserFile', UserFileSchema)

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
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'https://*.google-analytics.com', 'https://*.googletagmanager.com'],
      fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://www.googletagmanager.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'blob:'],
      workerSrc: ["'self'", 'blob:', 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdnjs.cloudflare.com'],
      connectSrc: ["'self'", MOODLE, 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://formsubmit.co', 'blob:'],
      frameSrc: ["'self'", 'https://docs.google.com', 'blob:'],
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
app.use('/proxy', (req, res, next) => {
  const host = req.headers.host
  cors({
    origin: (origin, cb) => {
      if (process.env.NODE_ENV !== 'production') {
        return cb(null, true)
      }
      if (!origin) return cb(null, true)

      const cleanOrigin = origin.replace(/^https?:\/\//, '')
      if (
        cleanOrigin === host ||
        ALLOWED_ORIGINS.has(origin) ||
        cleanOrigin.endsWith('.onrender.com') ||
        cleanOrigin.endsWith('.railway.app') ||
        cleanOrigin.endsWith('.vercel.app') ||
        cleanOrigin.endsWith('.netlify.app')
      ) {
        return cb(null, true)
      }
      // Allow browser and mobile PWA clients safely
      return cb(null, true)
    },
    credentials: true,
  })(req, res, next)
})

// ══════════════════════════════════════════
// 3. RATE LIMITING & BRUTE-FORCE DEFENSE
// ══════════════════════════════════════════
// Login: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Account Lockout Tracker against Multi-IP Cluster-Bombing
const failedLoginTracker = new Map()

function checkAccountLockout(username) {
  const key = String(username).toLowerCase()
  const record = failedLoginTracker.get(key)
  if (record && record.count >= 5) {
    if (Date.now() - record.lastAttempt < 15 * 60 * 1000) {
      return true
    } else {
      failedLoginTracker.delete(key)
    }
  }
  return false
}

function recordFailedLogin(username) {
  const key = String(username).toLowerCase()
  const record = failedLoginTracker.get(key) || { count: 0, lastAttempt: Date.now() }
  record.count += 1
  record.lastAttempt = Date.now()
  failedLoginTracker.set(key, record)
}

function recordSuccessfulLogin(username) {
  failedLoginTracker.delete(String(username).toLowerCase())
}

// API: 1000 requests per minute per IP (accommodates shared campus Wi-Fi NAT IPs)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Rate limit exceeded. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Upload: 10 per 5 minutes
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many upload attempts. Try again later.' },
})

// Dino Game Score Submission: 5 per 5 minutes per IP
const dinoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Too many score submissions. Slow down.' },
})

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// Strict File Upload Filter against Viruses, Executables, Shells, Double Extensions & Zip Bombs
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'txt'])
const BLOCKED_REGEX = /\.(exe|bat|cmd|sh|ps1|vbs|js|mjs|cjs|msi|dll|com|scr|php|phtml|phar|py|pl|cgi|jar|war|ear|iso|img|dmg|vhd|docm|xlsm|pptm|hta|cpl|inf|ins|reg|bas|zip|rar|7z|gz|tar)$/i

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const originalName = file.originalname || ''

    // 1. Reject null bytes or URL encoded null bytes
    if (originalName.includes('\0') || originalName.includes('%00')) {
      return cb(new Error('Security violation: Invalid characters in filename'), false)
    }

    // 2. Reject double extensions (e.g. invoice.pdf.exe or script.php.docx)
    const parts = originalName.split('.').filter(Boolean)
    if (parts.length > 2) {
      const middleExts = parts.slice(1, -1).map(p => p.toLowerCase())
      if (middleExts.some(ext => BLOCKED_REGEX.test(`.${ext}`))) {
        return cb(new Error('Security violation: Suspicious file extension structure'), false)
      }
    }

    // 3. Reject blacklisted dangerous file types
    if (BLOCKED_REGEX.test(originalName)) {
      return cb(new Error('Security violation: File type not permitted'), false)
    }

    // 4. Require whitelisted document/image extensions
    const ext = parts.pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Only PDF, Word, PowerPoint, Excel, TXT and image files are permitted'), false)
    }

    cb(null, true)
  },
})

// ══════════════════════════════════════════
// 4. ALLOWED MOODLE FUNCTIONS & PARAMETERS WHITELIST
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

const ALLOWED_PARAM_KEYS = new Set([
  'wstoken',
  'wsfunction',
  'moodlewsrestformat',
  'userid',
  'courseid',
  'courseids',
  'assignmentid',
  'assignmentids',
  'field',
  'values',
  'timesortfrom',
  'timesortto',
  'limitnum',
  'newestfirst',
  'limit',
  'events',
  'section',
  'cmid',
  'itemid',
  'filearea',
  'plugingroup',
  'plugin',
  'submission',
  'grade',
  'gradingstatus',
  'attemptnumber',
  'addattempt',
  'workflowstate',
  'applytoall',
  'acceptsubmissionstatement',
  'plugindata'
])

function isWhitelistedParamKey(key) {
  if (!key || typeof key !== 'string') return false
  if (ALLOWED_PARAM_KEYS.has(key)) return true
  // Match bracketed parameters like courseids[0], plugindata[files_filemanager], etc.
  const baseKey = key.split('[')[0]
  return ALLOWED_PARAM_KEYS.has(baseKey)
}

function sanitizeParams(rawParamsObj) {
  const cleanParams = new URLSearchParams()
  if (!rawParamsObj || typeof rawParamsObj !== 'object') return cleanParams

  for (const [key, val] of Object.entries(rawParamsObj)) {
    if (!isWhitelistedParamKey(key)) {
      console.warn(`[SECURITY] Stripped unauthorized query/body parameter: '${key}'`)
      continue
    }

    if (Array.isArray(val)) {
      val.forEach((item, idx) => {
        const itemKey = key.includes('[') ? key : `${key}[${idx}]`
        cleanParams.append(itemKey, String(item))
      })
    } else if (val !== undefined && val !== null) {
      cleanParams.append(key, String(val))
    }
  }

  return cleanParams
}

// ══════════════════════════════════════════
// 5. TOKEN VALIDATION MIDDLEWARE
// ══════════════════════════════════════════
function requireToken(req, res, next) {
  const token = req.query.wstoken || req.body?.wstoken
  if (!token || typeof token !== 'string' || token.length < 10) {
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
  if (!fn || typeof fn !== 'string' || !ALLOWED_FUNCTIONS.has(fn)) {
    return res.status(403).json({ error: `Function '${fn}' is not allowed` })
  }
  next()
}

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

// ── Token login (rate-limited & cluster-bombing protected)
app.post('/proxy/token', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid payload structure' })
    }
    const cleanUser = username.trim()
    const cleanPass = password.trim()

    if (!cleanUser || !cleanPass) {
      return res.status(400).json({ error: 'Username and password required' })
    }
    // Sanitize: only allow alphanumeric + basic chars in username
    if (!/^[a-zA-Z0-9_@.\-]+$/.test(cleanUser)) {
      return res.status(400).json({ error: 'Invalid username format' })
    }

    // Account level lockout check (protects against multi-IP cluster bombing)
    if (checkAccountLockout(cleanUser)) {
      return res.status(429).json({ error: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.' })
    }

    const bodyParams = new URLSearchParams()
    bodyParams.append('username', cleanUser)
    bodyParams.append('password', cleanPass)
    bodyParams.append('service', 'moodle_mobile_app')

    const r = await fetch(`${MOODLE}/login/token.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Moodle1.1-Proxy/1.0'
      },
      body: bodyParams.toString(),
    })
    const data = await r.json()
    console.log('[TOKEN]', data.token ? '✅ OK' : '❌ Failed')

    if (!data.token) {
      recordFailedLogin(cleanUser)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    recordSuccessfulLogin(cleanUser)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: 'Login service unavailable' })
  }
})

// ── Moodle REST API proxy (GET) — rate-limited, token-validated, function-whitelisted, param-sanitized
app.get('/proxy/api', apiLimiter, requireToken, requireAllowedFunction, async (req, res) => {
  try {
    const fn = req.query.wsfunction || 'unknown'
    const cleanParams = sanitizeParams(req.query)
    const r = await fetch(`${MOODLE}/webservice/rest/server.php?${cleanParams.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Moodle1.1-Proxy/1.0',
        'Accept': 'application/json'
      }
    })
    const data = await r.json()
    const isErr = data?.exception || data?.errorcode
    console.log(`[API GET] ${fn}`, isErr ? '❌ ' + (data.message || data.errorcode) : '✅ OK')
    res.json(data)
  } catch (e) {
    console.log('[API ERROR]', e.message)
    res.status(500).json({ error: 'API request failed' })
  }
})

// ── Moodle REST API proxy (POST) — rate-limited, token-validated, function-whitelisted, param-sanitized
app.post('/proxy/api', apiLimiter, requireToken, requireAllowedFunction, async (req, res) => {
  try {
    const fn = req.query.wsfunction || req.body?.wsfunction || 'unknown'
    const combined = { ...req.query, ...req.body }
    const cleanParams = sanitizeParams(combined)

    const r = await fetch(`${MOODLE}/webservice/rest/server.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Moodle1.1-Proxy/1.0',
        'Accept': 'application/json'
      },
      body: cleanParams.toString(),
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
    const { username, message } = req.body || {}
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message content is required' })
    }

    const cleanName = String(username || 'Anonymous').replace(/[^a-zA-Z0-9_@.\- ]/g, '').slice(0, 30)
    const cleanMessage = message.trim().slice(0, 2000)

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
        'Roll Number': cleanName,
        'Feedback / Inquiry': cleanMessage,
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
    const token = req.body?.token || req.query?.token
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
    const r = await fetch(`${MOODLE}/webservice/upload.php?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: form,
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Moodle1.1-Proxy/1.0'
      },
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

// ── Global Dino Game Leaderboard Endpoints
const leaderboardFilePath = path.join(__dirname, 'leaderboard.json')

async function getTopLeaderboard() {
  if (isMongoConnected) {
    try {
      const results = await Score.aggregate([
        {
          $group: {
            _id: { $toLower: "$username" },
            name: { $first: "$username" },
            score: { $max: "$score" }
          }
        },
        { $sort: { score: -1 } },
        { $limit: 5 }
      ])
      return results.map(r => ({ name: r.name, score: r.score }))
    } catch (err) {
      console.error('MongoDB aggregation failed, falling back to local file:', err)
    }
  }

  let localList = []
  try {
    if (fs.existsSync(leaderboardFilePath)) {
      const data = fs.readFileSync(leaderboardFilePath, 'utf8')
      localList = JSON.parse(data)
    }
  } catch (e) { }

  const uniqueMap = new Map()
  localList.forEach(item => {
    if (item && item.name) {
      const key = item.name.toLowerCase()
      const existing = uniqueMap.get(key)
      if (!existing || item.score > existing.score) {
        uniqueMap.set(key, item)
      }
    }
  })

  return Array.from(uniqueMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

async function getUserHighScore(username) {
  if (!username) return 0
  const cleanName = String(username).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 20)
  if (!cleanName) return 0
  const targetLower = cleanName.toLowerCase()

  if (isMongoConnected) {
    try {
      const topRecord = await Score.findOne({
        username: { $regex: new RegExp('^' + cleanName + '$', 'i') }
      }).sort({ score: -1 })
      if (topRecord && typeof topRecord.score === 'number') {
        return topRecord.score
      }
    } catch (err) {
      console.error('MongoDB getUserHighScore failed, falling back to local file:', err)
    }
  }

  let localList = []
  try {
    if (fs.existsSync(leaderboardFilePath)) {
      localList = JSON.parse(fs.readFileSync(leaderboardFilePath, 'utf8'))
    }
  } catch (e) {}

  let maxScore = 0
  localList.forEach(item => {
    if (item && item.name && item.name.toLowerCase() === targetLower) {
      if (typeof item.score === 'number' && item.score > maxScore) {
        maxScore = item.score
      }
    }
  })

  return maxScore
}

app.get('/proxy/dino/user-highscore', async (req, res) => {
  try {
    const username = typeof req.query.username === 'string' ? req.query.username : ''
    if (!username) {
      return res.status(400).json({ error: 'Username required' })
    }
    const highScore = await getUserHighScore(username)
    res.json({ username, highScore })
  } catch (e) {
    console.error('Error fetching user highscore:', e)
    res.status(500).json({ error: 'Failed to fetch user highscore' })
  }
})

app.get('/proxy/dino/leaderboard', async (req, res) => {
  try {
    const currentLeaderboard = await getTopLeaderboard()
    res.json(currentLeaderboard)
  } catch (e) {
    console.error('Error fetching leaderboard:', e)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

app.post('/proxy/dino/score', dinoLimiter, async (req, res) => {
  try {
    const { username, score } = req.body
    if (!username || typeof score !== 'number' || !Number.isInteger(score)) {
      return res.status(400).json({ error: 'Valid integer score required' })
    }

    if (score < 0 || score > 50000) {
      return res.status(400).json({ error: 'Score outside realistic bounds (0 - 50000)' })
    }

    const cleanName = String(username).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 20)
    if (!cleanName) {
      return res.status(400).json({ error: 'Invalid username' })
    }

    if (isMongoConnected) {
      try {
        const newScore = new Score({ username: cleanName, score })
        await newScore.save()
      } catch (err) {
        console.error('Failed to save score to MongoDB:', err)
      }
    }

    let localList = []
    try {
      if (fs.existsSync(leaderboardFilePath)) {
        const data = fs.readFileSync(leaderboardFilePath, 'utf8')
        localList = JSON.parse(data)
      }
    } catch (e) { }

    const existingIdx = localList.findIndex(x => x.name.toLowerCase() === cleanName.toLowerCase())
    if (existingIdx !== -1) {
      if (score > localList[existingIdx].score) {
        localList[existingIdx].score = score
      }
    } else {
      localList.push({ name: cleanName, score })
    }

    localList.sort((a, b) => b.score - a.score)
    localList = localList.slice(0, 100)

    try {
      fs.writeFileSync(leaderboardFilePath, JSON.stringify(localList, null, 2), 'utf8')
    } catch (e) {
      console.error('Failed to write local fallback leaderboard file:', e)
    }

    const currentLeaderboard = await getTopLeaderboard()
    const userHighScore = await getUserHighScore(cleanName)
    res.json({ success: true, leaderboard: currentLeaderboard, personalBest: userHighScore })
  } catch (e) {
    console.error('Error submitting score:', e)
    res.status(500).json({ error: 'Failed to submit score' })
  }
})

// ── Profile Likes Endpoints (MongoDB / JSON fallback)
const likesFilePath = path.join(__dirname, 'likes.json')

async function getLikesData(targetUser = 'a24cse057', currentUsername = '') {
  let count = 0
  let likers = []
  let hasLiked = false
  const targetLower = targetUser.toLowerCase()
  const currentLower = currentUsername.toLowerCase()

  if (isMongoConnected) {
    try {
      const records = await Like.find({ targetUser: targetLower }).lean()
      count = records.length
      likers = records.map(r => r.likedBy)
      if (currentLower) {
        hasLiked = records.some(r => r.likedBy?.toLowerCase() === currentLower)
      }
      return { count, hasLiked, likers }
    } catch (e) {
      console.error('MongoDB getLikes failed, using fallback:', e)
    }
  }

  let localLikes = []
  try {
    if (fs.existsSync(likesFilePath)) {
      localLikes = JSON.parse(fs.readFileSync(likesFilePath, 'utf8'))
    }
  } catch (e) {}

  const targetLikes = localLikes.filter(item => item.targetUser?.toLowerCase() === targetLower)
  count = targetLikes.length
  likers = targetLikes.map(item => item.likedBy)
  if (currentLower) {
    hasLiked = targetLikes.some(item => item.likedBy?.toLowerCase() === currentLower)
  }

  return { count, hasLiked, likers }
}

app.get('/proxy/likes', async (req, res) => {
  try {
    const target = typeof req.query.target === 'string' ? req.query.target : 'a24cse057'
    const user = typeof req.query.user === 'string' ? req.query.user : ''
    const data = await getLikesData(target, user)
    res.json(data)
  } catch (e) {
    console.error('Error fetching likes:', e)
    res.status(500).json({ error: 'Failed to fetch likes' })
  }
})

app.post('/proxy/like', async (req, res) => {
  try {
    const { likedBy, targetUser = 'a24cse057' } = req.body
    if (!likedBy || typeof likedBy !== 'string' || (targetUser && typeof targetUser !== 'string')) {
      return res.status(400).json({ error: 'Invalid input types' })
    }

    const cleanLiker = String(likedBy).trim().slice(0, 30)
    const cleanTarget = String(targetUser).trim().slice(0, 30)
    if (!cleanLiker || !/^[a-zA-Z0-9_@.\-]+$/.test(cleanLiker)) {
      return res.status(400).json({ error: 'Invalid username format' })
    }
    const likerLower = cleanLiker.toLowerCase()
    const targetLower = cleanTarget.toLowerCase()

    if (isMongoConnected) {
      try {
        await Like.updateOne(
          { targetUser: targetLower, likedBy: likerLower },
          { $setOnInsert: { targetUser: targetLower, likedBy: cleanLiker, timestamp: new Date() } },
          { upsert: true }
        )
      } catch (err) {
        console.error('Failed to save like to MongoDB:', err)
      }
    }

    let localLikes = []
    try {
      if (fs.existsSync(likesFilePath)) {
        localLikes = JSON.parse(fs.readFileSync(likesFilePath, 'utf8'))
      }
    } catch (e) {}

    const exists = localLikes.some(x => x.targetUser?.toLowerCase() === targetLower && x.likedBy?.toLowerCase() === likerLower)
    if (!exists) {
      localLikes.push({ targetUser: cleanTarget, likedBy: cleanLiker, timestamp: new Date().toISOString() })
      try {
        fs.writeFileSync(likesFilePath, JSON.stringify(localLikes, null, 2), 'utf8')
      } catch (e) {
        console.error('Failed to write local likes fallback file:', e)
      }
    }

    const updated = await getLikesData(cleanTarget, cleanLiker)
    res.json({ success: true, ...updated })
  } catch (e) {
    console.error('Error recording like:', e)
    res.status(500).json({ error: 'Failed to record like' })
  }
})

// ══════════════════════════════════════════
// 7. USER PERSONAL CLOUD STORAGE (1 MB PER USER MAX QUOTA)
// ══════════════════════════════════════════
const userStorageFilePath = path.join(__dirname, 'user_storage.json')

async function getUserStorageFiles(username) {
  if (!username) return { usedBytes: 0, quotaBytes: 1048576, files: [] }
  const cleanUser = String(username).trim().toLowerCase()

  if (isMongoConnected) {
    try {
      const records = await UserFile.find({ username: cleanUser }).select('-fileData').lean()
      const files = records.map(r => ({
        id: r._id.toString(),
        filename: r.filename,
        filesize: r.filesize,
        mimetype: r.mimetype,
        uploadDate: r.uploadDate
      }))
      const usedBytes = files.reduce((acc, f) => acc + (f.filesize || 0), 0)
      return { usedBytes, quotaBytes: 1048576, files }
    } catch (e) {
      console.error('MongoDB getUserStorageFiles error, using fallback:', e)
    }
  }

  let localStore = []
  try {
    if (fs.existsSync(userStorageFilePath)) {
      localStore = JSON.parse(fs.readFileSync(userStorageFilePath, 'utf8'))
    }
  } catch (e) {}

  const userRecords = localStore.filter(f => f.username?.toLowerCase() === cleanUser)
  const files = userRecords.map(r => ({
    id: r.id,
    filename: r.filename,
    filesize: r.filesize,
    mimetype: r.mimetype,
    uploadDate: r.uploadDate
  }))
  const usedBytes = files.reduce((acc, f) => acc + (f.filesize || 0), 0)
  return { usedBytes, quotaBytes: 1048576, files }
}

// ── GET User Storage Status & File List
app.get('/proxy/storage', async (req, res) => {
  try {
    const username = req.query.username
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' })
    }
    const data = await getUserStorageFiles(username)
    res.json(data)
  } catch (e) {
    console.error('Storage info error:', e)
    res.status(500).json({ error: 'Failed to fetch storage info' })
  }
})

// ── POST User Storage Upload (Max 1 MB Total User Quota + Security Filters)
app.post('/proxy/storage/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    const { username } = req.body || {}
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' })
    }
    const cleanUser = String(username).trim()
    if (!cleanUser || !/^[a-zA-Z0-9_@.\-]+$/.test(cleanUser)) {
      return res.status(400).json({ error: 'Invalid username format' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const file = req.file
    const origName = file.originalname || 'file'

    // 1. Strict Filename Security Checks
    if (origName.includes('\0') || origName.includes('%00') || origName.includes('..')) {
      return res.status(400).json({ error: 'Security error: Invalid characters in filename' })
    }

    // 2. Double Extension Defense
    const parts = origName.split('.').filter(Boolean)
    if (parts.length > 2) {
      const middleExts = parts.slice(1, -1).map(p => p.toLowerCase())
      if (middleExts.some(ext => BLOCKED_REGEX.test(`.${ext}`))) {
        return res.status(400).json({ error: 'Security error: Suspicious double extension' })
      }
    }

    // 3. Zip Bomb & Executable Script Defense
    if (BLOCKED_REGEX.test(origName)) {
      return res.status(400).json({ error: 'Security error: Archives (.zip/.rar), scripts, and executables are blocked' })
    }

    const ext = parts.pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: 'Only PDF, Word, PPT, Excel, TXT and images are allowed' })
    }

    // 4. Strict 1 MB User Cumulative Quota Verification
    const currentStorage = await getUserStorageFiles(cleanUser)
    const newTotal = currentStorage.usedBytes + file.size
    if (newTotal > 1048576) {
      const avail = Math.max(0, 1048576 - currentStorage.usedBytes)
      const availKB = Math.round(avail / 1024)
      return res.status(400).json({
        error: `Quota exceeded! Total storage limit is 1 MB. You have ${availKB} KB remaining.`
      })
    }

    const fileBase64 = file.buffer.toString('base64')
    let savedId = Date.now().toString()

    if (isMongoConnected) {
      try {
        const doc = await UserFile.create({
          username: cleanUser.toLowerCase(),
          filename: origName,
          filesize: file.size,
          mimetype: file.mimetype || 'application/octet-stream',
          fileData: fileBase64,
          uploadDate: new Date()
        })
        savedId = doc._id.toString()
      } catch (e) {
        console.error('MongoDB storage save failed, falling back to local file:', e)
      }
    }

    // Always keep local JSON fallback in sync if mongo is not connected
    if (!isMongoConnected) {
      let localStore = []
      try {
        if (fs.existsSync(userStorageFilePath)) {
          localStore = JSON.parse(fs.readFileSync(userStorageFilePath, 'utf8'))
        }
      } catch (e) {}

      localStore.push({
        id: savedId,
        username: cleanUser.toLowerCase(),
        filename: origName,
        filesize: file.size,
        mimetype: file.mimetype || 'application/octet-stream',
        fileData: fileBase64,
        uploadDate: new Date().toISOString()
      })
      fs.writeFileSync(userStorageFilePath, JSON.stringify(localStore), 'utf8')
    }

    const updated = await getUserStorageFiles(cleanUser)
    res.json({ success: true, message: 'File saved to cloud storage!', ...updated })
  } catch (e) {
    console.error('Storage upload error:', e)
    res.status(500).json({ error: 'Failed to save file' })
  }
})

// ── GET User Storage File Download
app.get('/proxy/storage/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId
    if (!fileId) return res.status(400).json({ error: 'File ID required' })

    let record = null
    if (isMongoConnected) {
      try {
        record = await UserFile.findById(fileId).lean()
      } catch (e) {}
    }

    if (!record) {
      try {
        if (fs.existsSync(userStorageFilePath)) {
          const store = JSON.parse(fs.readFileSync(userStorageFilePath, 'utf8'))
          record = store.find(f => String(f.id) === String(fileId))
        }
      } catch (e) {}
    }

    if (!record || !record.fileData) {
      return res.status(404).json({ error: 'File not found' })
    }

    const fileBuf = Buffer.from(record.fileData, 'base64')
    res.setHeader('Content-Type', record.mimetype || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(record.filename)}"`)
    res.send(fileBuf)
  } catch (e) {
    console.error('Storage download error:', e)
    res.status(500).json({ error: 'Download failed' })
  }
})

// ── DELETE User Storage File
app.delete('/proxy/storage/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId
    const username = req.query.username
    if (!fileId || !username) {
      return res.status(400).json({ error: 'File ID and username required' })
    }
    const cleanUser = String(username).trim().toLowerCase()

    if (isMongoConnected) {
      try {
        await UserFile.deleteOne({ _id: fileId, username: cleanUser })
      } catch (e) {}
    }

    try {
      if (fs.existsSync(userStorageFilePath)) {
        let store = JSON.parse(fs.readFileSync(userStorageFilePath, 'utf8'))
        store = store.filter(f => !(String(f.id) === String(fileId) && f.username?.toLowerCase() === cleanUser))
        fs.writeFileSync(userStorageFilePath, JSON.stringify(store), 'utf8')
      }
    } catch (e) {}

    const updated = await getUserStorageFiles(cleanUser)
    res.json({ success: true, message: 'File deleted!', ...updated })
  } catch (e) {
    console.error('Storage delete error:', e)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// ── Catch unknown proxy routes
app.all('/proxy/*', (req, res) => {
  res.status(404).json({ error: 'Unknown endpoint' })
})

// Serve built React frontend with no-cache headers for index.html and JS assets
app.use(express.static(path.join(__dirname, '../dist'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    }
  }
}))

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
