import { Layout, Book, Clock, AlertCircle, FileCheck, CheckCircle2, Sparkles, Files, GraduationCap } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { truncate, daysLeft, getFormattedDate } from '../utils/helpers'
import AssignmentItem from '../components/AssignmentItem'
import Spinner from '../components/Spinner'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { courses, assignments, submissions, files, loading, user, ignoredAssignmentIds = [] } = useAppData()
  const navigate = useNavigate()

  const soon = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => { const d = daysLeft(a.duedate); return d >= 0 && d <= 7 })

  const pending = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => {
      const sub = submissions[a.id]
      return sub?.lastattempt?.submission?.status !== 'submitted'
    })

  const upcoming = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => a.duedate && daysLeft(a.duedate) >= 0)
    .filter(a => submissions[a.id]?.lastattempt?.submission?.status !== 'submitted')
    .slice(0, 5)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="page-title">Dashboard</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
      </div>
      <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Welcome back, {truncate(user?.lastname || user?.fullname || '', 20)}!
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap blue"><GraduationCap size={20} /></div>
          <div>
            <div className="stat-label">Courses</div>
            <div className="stat-value blue">{courses.length || '—'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap cyan"><Clock size={20} /></div>
          <div>
            <div className="stat-label">Pending</div>
            <div className="stat-value cyan">{loading ? '—' : pending.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap orange"><AlertCircle size={20} /></div>
          <div>
            <div className="stat-label">Due Soon</div>
            <div className="stat-value orange">{loading ? '—' : soon.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap purple"><Files size={20} /></div>
          <div>
            <div className="stat-label">Files</div>
            <div className="stat-value purple">{files.length || '—'}</div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card-panel">
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} className="text-cyan" />
              <span className="section-title">Pending Submissions</span>
            </div>
          </div>
          {loading ? <Spinner text="" /> : upcoming.length
            ? <div className="assign-list">
                {upcoming.map(a => (
                  <AssignmentItem 
                    key={a.id} 
                    assignment={a} 
                    compact 
                    onClick={() => navigate('/assignments', { state: { openAssignmentId: a.id } })} 
                  />
                ))}
              </div>
            : <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CheckCircle2 size={32} className="text-accent" style={{ opacity: 0.5 }} />
                <span>All assignments caught up!</span>
              </div>
          }
        </div>
        <div className="card-panel">
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck size={16} className="text-blue" />
              <span className="section-title">Course Progress</span>
            </div>
          </div>
          {loading ? <Spinner text="" /> : courses.slice(0, 6).map(c => {
            const pct = c.progress ? Math.round(c.progress) : 0
            return (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {truncate(c.shortname || c.fullname, 28)}
                  </span>
                  <span style={{ color: 'var(--text3)', flexShrink: 0, marginLeft: 8 }}>{pct}%</span>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
