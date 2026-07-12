import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleLogin = async () => {
    if (!username || !password) return
    setLoading(true); setError('')
    try {
      // Step 1: get token
      const r = await fetch('/proxy/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await r.json()
      if (!data.token) throw new Error(data.error || 'Invalid credentials')
      const tok = data.token

      // Step 2: get site info (also tells us if admin)
      const info = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`).then(r => r.json())

      // Step 2.5: get full user details (to get email, city, country, etc.)
      let fullUser = { ...info }
      try {
        const userDetails = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_user_get_users_by_field&moodlewsrestformat=json&field=id&values[0]=${info.userid}`).then(r => r.json())
        if (Array.isArray(userDetails) && userDetails[0]) {
          fullUser = { ...info, ...userDetails[0] }
        }
      } catch (e) {
        console.warn('Failed to fetch full user details', e)
      }

      // Step 3: detect role
      let detectedRole = 'student'
      let teachingIds = []

      if (info.issiteadmin) {
        detectedRole = 'admin'
      } else {
        // Get courses this user is enrolled in
        const courses = await fetch(`/proxy/api?wstoken=${tok}&wsfunction=core_enrol_get_users_courses&moodlewsrestformat=json&userid=${info.userid}`).then(r => r.json())
        if (Array.isArray(courses)) {
          // Check each course's role for this user
          // Moodle returns roles array per course
          const facultyCourses = courses.filter(c => {
            const roles = c.roles || []
            // editingteacher = 3, teacher (non-editing) = 4 in default Moodle
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
      }

      login(tok, fullUser, detectedRole, teachingIds)
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
      localStorage.removeItem('moodle_token')
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">GLS University</div>
        <div className="login-title">Moodle Dashboard</div>
        <div className="login-sub">Sign in with your Moodle credentials</div>

        <div className="field-group">
          <div className="field-label">Username</div>
          <input className="field-input" type="text" placeholder="e.g. a24cse057"
            value={username} onChange={e => setUsername(e.target.value)}
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

        <button className="btn-login" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  )
}
