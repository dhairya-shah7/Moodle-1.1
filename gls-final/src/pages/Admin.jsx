import { useAuth } from '../context/AuthContext'

export default function Admin() {
  const { role, user } = useAuth()

  if (role !== 'admin') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>🚫 Access denied. Admins only.</div>
  }

  const links = [
    { label: 'Site Administration', url: 'https://btech.glsmoodle.in/admin/index.php', icon: '⚙️', desc: 'Full site settings' },
    { label: 'Manage Users', url: 'https://btech.glsmoodle.in/admin/user.php', icon: '👥', desc: 'Add, edit, delete users' },
    { label: 'Manage Courses', url: 'https://btech.glsmoodle.in/course/management.php', icon: '📚', desc: 'All courses & categories' },
    { label: 'Enrol Users', url: 'https://btech.glsmoodle.in/enrol/users.php', icon: '➕', desc: 'Manage enrolments' },
    { label: 'Plugins & Services', url: 'https://btech.glsmoodle.in/admin/settings.php?section=webservicesoverview', icon: '🔌', desc: 'Web services & API settings' },
    { label: 'Reports', url: 'https://btech.glsmoodle.in/report/index.php', icon: '📊', desc: 'Logs and activity reports' },
    { label: 'Define Roles', url: 'https://btech.glsmoodle.in/admin/roles/manage.php', icon: '🛡️', desc: 'Faculty, student role capabilities' },
    { label: 'Gradebook Settings', url: 'https://btech.glsmoodle.in/grade/report/index.php', icon: '🏆', desc: 'Site-wide grade settings' },
  ]

  return (
    <div>
      <div className="page-title">Site Administration</div>
      <div className="page-sub">Admin panel — quick links to Moodle site management</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          You are signed in as <strong>{user?.username}</strong> with <strong style={{ color: '#ef4444' }}>Admin</strong> privileges. All changes are permanent.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginTop: 8 }}>
        {links.map(l => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit' }}>
            <div
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{l.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{l.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{l.desc}</div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Open on Moodle ↗</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
