import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, GraduationCap, Building2, Check } from 'lucide-react'
import { DEPARTMENTS, detectDepartmentFromUsername, getDepartmentById } from '../utils/departments'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedDeptId, setSelectedDeptId] = useState(() => {
    try {
      return localStorage.getItem('moodle_dept_id') || 'btech'
    } catch (e) {
      return 'btech'
    }
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  // Smart auto-detection on username input
  const handleUsernameChange = (e) => {
    const val = e.target.value
    setUsername(val)
    const detected = detectDepartmentFromUsername(val)
    if (detected && detected.id !== selectedDeptId) {
      setSelectedDeptId(detected.id)
    }
  }

  const selectedDepartment = getDepartmentById(selectedDeptId)

  const handleLogin = async () => {
    if (!username || !password) return
    setLoading(true)
    setError('')
    try {
      const cleanUsername = username.trim()
      const requestHeaders = {
        'Content-Type': 'application/json',
        'X-Moodle-Dept': selectedDeptId,
        'X-Moodle-Url': selectedDepartment.url
      }

      // Step 1: get token
      const r = await fetch('/proxy/token', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          username: cleanUsername,
          password,
          dept: selectedDeptId,
          moodle_url: selectedDepartment.url
        })
      })
      const data = await r.json()
      if (!data.token) throw new Error(data.error || 'Invalid credentials or department')
      const tok = data.token

      // Step 2: get site info (also tells us if admin)
      const info = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`, {
        headers: requestHeaders
      }).then(r => r.json())

      // Step 2.5: get full user details (to get email, city, country, etc.)
      let fullUser = { ...info }
      try {
        const userDetails = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_user_get_users_by_field&moodlewsrestformat=json&field=id&values[0]=${info.userid}`, {
          headers: requestHeaders
        }).then(r => r.json())
        if (Array.isArray(userDetails) && userDetails[0]) {
          fullUser = { ...info, ...userDetails[0] }
        }
      } catch (e) {
        console.warn('Failed to fetch full user details', e)
      }

      // Step 3: detect role (student vs faculty)
      let detectedRole = 'student'
      let teachingIds = []

      // Get courses this user is enrolled in
      const courses = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_enrol_get_users_courses&moodlewsrestformat=json&userid=${info.userid}`, {
        headers: requestHeaders
      }).then(r => r.json())

      if (Array.isArray(courses)) {
        // Check each course's role for this user
        const facultyCourses = courses.filter(c => {
          const roles = c.roles || []
          return roles.some(role =>
            role.shortname === 'editingteacher' ||
            role.shortname === 'teacher' ||
            role.roleid === 3 ||
            role.roleid === 4
          )
        })
        if (facultyCourses.length > 0) {
          detectedRole = 'faculty'
          teachingIds = facultyCourses.map(c => c.id)
        }
      }

      login(tok, fullUser, detectedRole, teachingIds, selectedDeptId)
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
      localStorage.removeItem('moodle_token')
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-box" style={{ maxWidth: 440 }}>
        <div className="login-logo">GLS University</div>
        <div className="login-title">Moodle 1.1</div>
        <div className="login-sub">Sign in with your department credentials</div>

        {/* Department Switcher */}
        <div className="field-group" style={{ marginBottom: 18 }}>
          <div className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Building2 size={14} /> Department / Faculty
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEPARTMENTS.map(d => {
              const active = d.id === selectedDeptId
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDeptId(d.id)}
                  style={{
                    background: active ? 'var(--accent-soft)' : 'var(--surface2)',
                    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    padding: '10px 8px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.18s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{d.badge}</span>
                    {active && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, textAlign: 'center', lineHeight: 1.1 }}>
                    {d.id === 'btech' ? 'Engineering' : d.id === 'bca' ? 'UG / BCA-IT' : 'PG / Masters'}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Portal:</span>
            <code style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
              {selectedDepartment.url.replace(/^https?:\/\//, '')}
            </code>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">Username / Roll Number / Email</div>
          <input className="field-input" type="text" placeholder="e.g. a24cse057 or bca... or email"
            value={username} onChange={handleUsernameChange}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} autoComplete="username" />
        </div>

        <div className="field-group">
          <div className="field-label">Password</div>
          <div style={{ position: 'relative' }}>
            <input className="field-input" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} autoComplete="current-password"
              style={{ paddingRight: 40 }} />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button className="btn-login" onClick={handleLogin} disabled={loading} style={{ marginTop: 4 }}>
          {loading ? 'Signing in…' : `Sign In to ${selectedDepartment.shortName}`}
        </button>
        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  )
}

