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
app.use('/proxy', (req, res, next) => {
  const host = req.headers.host
  cors({
    origin: (origin, cb) => {
      if (process.env.NODE_ENV !== 'production') {
        return cb(null, true)
      }
      if (!origin) return cb(null, true)

      const cleanOrigin = origin.replace(/^https?:\/\//, '')
      if (cleanOrigin === host || ALLOWED_ORIGINS.has(origin) || cleanOrigin.endsWith('.onrender.com') || cleanOrigin.endsWith('.railway.app')) {
        return cb(null, true)
      }
      cb(new Error('Blocked by CORS'))
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
    const { username, password } = req.body
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

    const r = await fetch(`${MOODLE}/login/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(cleanUser)}&password=${encodeURIComponent(cleanPass)}&service=moodle_mobile_app`,
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
    res.json({ success: true, leaderboard: currentLeaderboard })
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

// ── Catch unknown proxy routes
app.all('/proxy/*', (req, res) => {
  res.status(404).json({ error: 'Unknown endpoint' })
})

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
