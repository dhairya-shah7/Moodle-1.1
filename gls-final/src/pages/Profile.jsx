import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMoodle } from '../hooks/useMoodle'
import Spinner from '../components/Spinner'
import { Edit, ExternalLink, Key, Settings, Award, Info } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

const MOODLE = 'https://btech.glsmoodle.in'

export default function Profile() {
  const { user, token } = useAuth()
  const moodle = useMoodle()
  const { isDark } = useTheme()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  const grayColor = isDark ? 'var(--text2)' : 'var(--text3)'

  useEffect(() => {
    if (!user?.userid) return
    moodle.getCourses(user.userid)
      .then(c => setCourses(Array.isArray(c) ? c : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.userid])

  const card = (children, style = {}) => (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '24px 28px', ...style
    }}>
      {children}
    </div>
  )

  const sectionTitle = (t) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: grayColor, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      {t}
    </div>
  )

  const row = (label, value) => value ? (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: grayColor, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  ) : null

  const link = (label, url) => (
    <a href={url} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', textDecoration: 'none', marginBottom: 10, fontWeight: 500 }}
      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
    >
      {label} <ExternalLink size={12} />
    </a>
  )

  if (loading) return <Spinner text="Loading profile..." />

  return (
    <div>
      {/* Header */}
      <div className="profile-header">
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 30, color: '#fff', flexShrink: 0,
        }}>
          {(user?.lastname || user?.fullname || 'U')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {user?.username} {user?.fullname || user?.lastname}
          </div>
          <div style={{ fontSize: 13, color: grayColor }}>GLS University · Ahmedabad</div>
        </div>
        <a
          href={`${MOODLE}/user/edit.php?id=${user?.userid}`}
          target="_blank" rel="noreferrer"
          className="profile-header__btn"
        >
          <Edit size={16} /> Edit Profile on Moodle
        </a>
      </div>

      <div className="profile-grid">

        {/* User Details */}
        {card(<>
          {sectionTitle('User Details')}
          {row('Full Name', user?.fullname)}
          {row('Username', user?.username)}
          {row('Email Address', user?.email || (user?.username ? `${user.username}@glsuniversity.ac.in` : '—'))}
          {row('Country', user?.country || 'India')}
          {row('City / Town', user?.city || 'Ahmedabad')}
        </>)}

        {/* Miscellaneous */}
        {card(<>
          {sectionTitle('Miscellaneous')}
          {link('Forum posts', `${MOODLE}/mod/forum/user.php?id=${user?.userid}`)}
          {link('Forum discussions', `${MOODLE}/mod/forum/user.php?id=${user?.userid}&mode=discussions`)}
          {link('Learning plans', `${MOODLE}/totara/plan/index.php`)}
        </>)}

        {/* Reports */}
        {card(<>
          {sectionTitle('Reports')}
          {link('Browser sessions', `${MOODLE}/report/usersessions/user.php?userid=${user?.userid}`)}
          {link('Grades overview', `${MOODLE}/grade/report/overview/index.php?userid=${user?.userid}`)}
        </>)}

        {/* Login Activity */}
        {card(<>
          {sectionTitle('Login Activity')}
          {user?.firstaccess && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: grayColor, marginBottom: 3 }}>First access to site</div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                {new Date(user.firstaccess * 1000).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
              </div>
            </div>
          )}
          {user?.lastaccess && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: grayColor, marginBottom: 3 }}>Last access to site</div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                {new Date(user.lastaccess * 1000).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
              </div>
            </div>
          )}
        </>)}

        {/* Course Details */}
        <div style={{ gridColumn: '1 / -1' }}>
          {card(<>
            {sectionTitle(`Course Details — ${courses.length} Enrolled`)}
            <div className="profile-courses-cols">
              {courses.map(c => (
                <a key={c.id}
                  href={`${MOODLE}/course/view.php?id=${c.id}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: 'block', fontSize: 13, color: 'var(--accent)', textDecoration: 'none', marginBottom: 10, fontWeight: 500, breakInside: 'avoid' }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                >
                  {c.fullname}
                </a>
              ))}
            </div>
          </>)}
        </div>

        {/* Privacy */}
        {card(<>
          {sectionTitle('Privacy and Policies')}
          {link('Data retention summary', `${MOODLE}/report/retention/index.php`)}
        </>)}

        {/* Preferences shortcut */}
        {card(<>
          {sectionTitle('Quick Actions')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Edit Profile', url: `${MOODLE}/user/edit.php?id=${user?.userid}`, icon: Edit },
              { label: 'Change Password', url: `${MOODLE}/login/change_password.php`, icon: Key },
              { label: 'Preferences', url: `${MOODLE}/user/preferences.php`, icon: Settings },
              { label: 'Grades Overview', url: `${MOODLE}/grade/report/overview/index.php?userid=${user?.userid}`, icon: Award },
            ].map(a => (
              <a key={a.label} href={a.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <a.icon size={14} /> {a.label}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, fontSize: 12, color: grayColor, border: '1px solid rgba(59,130,246,0.1)' }}>
            <Info size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
            <span>Profile changes like name, password, and preferences are saved directly on Moodle.</span>
          </div>
        </>)}

      </div>
    </div>
  )
}

