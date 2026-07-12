import { Bell, Clock, Info, CheckCircle2 } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { fmt, daysLeft, truncate } from '../utils/helpers'
import Spinner from '../components/Spinner'

export default function Notifications() {
  const { assignments, submissions, notifications, loading } = useAppData()

  const getSubStatus = (id) => submissions[id]?.lastattempt?.submission?.status || 'new'

  const deadlineNotifs = assignments
    .filter(a => a.duedate && daysLeft(a.duedate) >= 0 && daysLeft(a.duedate) <= 3 && getSubStatus(a.id) !== 'submitted')
    .map(a => ({
      icon: <Clock className="text-danger" size={18} />,
      title: `Deadline Soon: ${truncate(a.name, 40)}`,
      body: `Due in ${daysLeft(a.duedate)} day(s) — ${a.courseshort}`,
      time: fmt(a.duedate),
      unread: true,
      cls: 'deadline'
    }))

  const moodleNotifs = notifications.map(n => ({
    icon: <Bell className="text-accent" size={18} />,
    title: truncate(n.subject || 'Notification', 50),
    body: truncate(n.smallmessage || '', 100),
    time: n.timecreated ? fmt(n.timecreated) : '',
    unread: !n.read,
    cls: 'moodle'
  }))

  const all = [...deadlineNotifs, ...moodleNotifs]

  return (
    <div className="fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title">Notifications</div>
        <div className="page-sub">Deadline alerts and Moodle notifications</div>
      </div>

      {loading
        ? <Spinner />
        : !all.length
          ? (
            <div className="empty-state card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <CheckCircle2 size={48} className="text-success" style={{ marginBottom: 16, opacity: 0.5 }} />
              <div className="empty-title" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>All caught up!</div>
              <div className="empty-sub" style={{ color: 'var(--text3)', marginTop: 8 }}>No new notifications right now.</div>
            </div>
          )
          : <div className="notif-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {all.map((n, i) => (
                <div key={i} className={`card notif-item ${n.unread ? 'unread' : ''}`} style={{ 
                  display: 'flex', 
                  gap: 16, 
                  padding: '16px 20px',
                  borderLeft: n.unread ? '4px solid var(--accent)' : '1px solid var(--border)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {n.unread && (
                    <div style={{ 
                      position: 'absolute', 
                      top: 12, 
                      right: 12, 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: 'var(--accent)' 
                    }} />
                  )}
                  <div className="notif-icon-wrap" style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 10, 
                    background: 'var(--surface2)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {n.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="notif-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div className="notif-title" style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{n.title}</div>
                    </div>
                    <div className="notif-body" style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 }}>{n.body}</div>
                    <div className="notif-time" style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> {n.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
      }
    </div>
  )
}
