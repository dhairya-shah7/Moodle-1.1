import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import Spinner from '../components/Spinner'

const ADMIN_USERNAME = 'a24cse057'

export default function Debug() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const { courses, assignments, submissions, files, calendarEvents, loading } = useAppData()

  // Hooks must always be called before any early return
  const [apiResults, setApiResults] = useState(null)
  const [testing, setTesting] = useState(false)

  // Block non-admin users entirely
  if (!user || user.username !== ADMIN_USERNAME) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 800, fontSize: 22 }}>Access Denied</div>
        <div style={{ color: 'var(--text3)', fontSize: 14 }}>This page is restricted to admins only.</div>
        <button onClick={() => navigate('/dashboard')} style={{ marginTop: 8, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          ← Back to Dashboard
        </button>
      </div>
    )
  }

  const runDiag = async () => {
    setTesting(true)
    try {
      const r = await fetch(`/proxy/debug?token=${token}&userid=${user?.userid}`)
      setApiResults(await r.json())
    } catch (e) {
      setApiResults({ error: e.message })
    }
    setTesting(false)
  }

  const Row = ({ label, value, ok }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{ok === true ? '✅' : ok === false ? '❌' : '⚪'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</div>
      </div>
    </div>
  )

  const assignCount = assignments.length
  const subCount = Object.keys(submissions).length
  const fileCount = files.length
  const calCount = calendarEvents.length

  return (
    <div>
      <div className="page-title">🔍 Diagnostics</div>
      <div className="page-sub">Check what data is loaded from Moodle — share this with your developer</div>

      {/* Live state */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          CURRENT APP STATE {loading && '— loading...'}
        </div>
        <Row label="Token" value={token ? token.slice(0, 20) + '...' : 'MISSING'} ok={!!token} />
        <Row label="User" value={user ? `${user.fullname} (userid: ${user.userid}, username: ${user.username})` : 'MISSING'} ok={!!user} />
        <Row label="Courses loaded" value={`${courses.length} courses: ${courses.map(c => c.shortname).join(', ') || 'none'}`} ok={courses.length > 0} />
        <Row label="Assignments loaded" value={`${assignCount} total`} ok={assignCount > 0} />
        <Row label="Submission statuses" value={`${subCount} fetched (should match assignments)`} ok={subCount > 0} />
        <Row label="Faculty Files" value={`${fileCount} files found`} ok={fileCount > 0} />
        <Row label="Calendar Events" value={`${calCount} events`} ok={calCount > 0} />
      </div>

      {/* Assignments raw */}
      {assignCount > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            ASSIGNMENTS ({assignCount})
          </div>
          {assignments.map(a => {
            const sub = submissions[a.id]
            const status = sub?.lastattempt?.submission?.status || 'no_status'
            const grading = sub?.lastattempt?.gradingstatus || 'unknown'
            return (
              <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{a.name}</div>
                <div style={{ color: 'var(--text3)', fontFamily: 'monospace' }}>
                  id:{a.id} | course:{a.courseshort} | due:{a.duedate ? new Date(a.duedate * 1000).toLocaleDateString() : 'none'} | sub_status:<span style={{ color: status === 'submitted' ? 'var(--success)' : 'var(--warning)' }}>{status}</span> | grading:{grading}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full API test */}
      <button onClick={runDiag} disabled={testing} style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
        {testing ? '⏳ Testing APIs...' : '🚀 Run Full API Diagnostic'}
      </button>

      {testing && <Spinner text="Calling all Moodle APIs..." />}

      {apiResults && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            LIVE API RESULTS
          </div>
          {[
            ['core_webservice_get_site_info', apiResults.siteInfo, r => !r?.ERROR && r?.userid],
            ['core_enrol_get_users_courses', apiResults.courses, r => Array.isArray(r) && r.length > 0],
            ['mod_assign_get_assignments', apiResults.assignments, r => !r?.ERROR && r?.courses],
            ['core_course_get_contents (sample)', apiResults.courseContents_sample, r => Array.isArray(r) && r.length > 0],
            ['core_calendar_get_action_events_by_timesort', apiResults.calendarEvents, r => !r?.ERROR],
            ['message_popup_get_popup_notifications', apiResults.notifications, r => !r?.ERROR],
          ].map(([name, result, check]) => {
            const ok = result ? check(result) : null
            const preview = result
              ? JSON.stringify(result).slice(0, 200) + (JSON.stringify(result).length > 200 ? '...' : '')
              : 'not tested'
            return <Row key={name} label={name} value={preview} ok={ok} />
          })}
        </div>
      )}

      {apiResults && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Raw JSON (copy to share)</div>
          <pre style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, fontSize: 11, overflow: 'auto', maxHeight: 400, color: 'var(--text2)' }}>
            {JSON.stringify(apiResults, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
