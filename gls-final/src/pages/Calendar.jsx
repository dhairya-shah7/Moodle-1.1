import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, ExternalLink, Edit3, Upload, FileText, Grid } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { assignStatus, fmt, truncate, daysLeft, getFormattedDate } from '../utils/helpers'
import AssignmentModal from '../components/AssignmentModal'

export default function CalendarPage() {
  const { assignments, calendarEvents, submissions } = useAppData()
  const [calDate, setCalDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalAssign, setModalAssign] = useState(null)

  const y = calDate.getFullYear()
  const m = calDate.getMonth()
  const today = new Date()
  const firstDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const getSubStatus = (id) => submissions[id]?.lastattempt?.submission?.status || 'new'

  // Build a cmid → assignment map so calendar events can link to submit modal
  const cmidToAssign = useMemo(() => {
    const map = {}
    assignments.forEach(a => { if (a.cmid) map[a.cmid] = a })
    return map
  }, [assignments])

  // FIX 4: Build day map from BOTH assignments AND calendar events directly
  const deadlineMap = useMemo(() => {
    const map = {}
    const add = (day, ev) => { if (!map[day]) map[day] = []; map[day].push(ev) }

    // From assignments (have duedate)
    assignments.forEach(a => {
      if (!a.duedate) return
      const d = new Date(a.duedate * 1000)
      if (d.getFullYear() === y && d.getMonth() === m)
        add(d.getDate(), {
          type: 'assign',
          name: a.name,
          course: a.courseshort,
          assignId: a.id,
          assignment: a,
          ts: a.duedate,
        })
    })

      // FIX: Calendar events — rendered directly, match to assignment via cmid
      ; (calendarEvents || []).forEach(ev => {
        if (!ev.timesort) return
        const d = new Date(ev.timesort * 1000)
        if (d.getFullYear() !== y || d.getMonth() !== m) return
        const day = d.getDate()
        // Avoid duplicating if already added from assignments (match by name+day)
        const alreadyAdded = map[day]?.find(x => x.assignment && x.assignment.name === ev.name)
        if (alreadyAdded) return
        // Try to find matching assignment via cmid (from event url: ?id=CMID)
        const cmidMatch = ev.url?.match(/id=(\d+)/)
        const cmid = cmidMatch ? parseInt(cmidMatch[1]) : null
        const linkedAssign = cmid ? cmidToAssign[cmid] : null
        add(day, {
          type: ev.modulename || 'event',
          name: ev.name,
          course: ev.course?.shortname || ev.course?.fullname || '',
          calId: ev.id,
          assignId: linkedAssign?.id || null,
          assignment: linkedAssign || null,
          ts: ev.timesort,
          url: ev.url,
          actionUrl: ev.action?.url,
        })
      })
    return map
  }, [assignments, calendarEvents, cmidToAssign, y, m])

  const dayEvents = selectedDay ? (deadlineMap[selectedDay] || []) : []

  return (
    <div className="fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title">Calendar</div>
        <div className="page-sub">Stay on top of your deadlines and course events</div>
      </div>

      <div className="calendar-container">

        {/* Calendar grid */}
        <div className="card calendar-card">
          <div className="cal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <div className="cal-month" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              {calDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
            <div className="cal-actions" style={{
              display: 'flex',
              gap: 4,
              background: 'var(--surface2)',
              padding: 4,
              borderRadius: 12,
              border: '1px solid var(--border)',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <button
                onClick={() => { setCalDate(new Date(y, m - 1, 1)); setSelectedDay(null) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                  transition: 'all 0.2s', flexShrink: 0
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <ChevronLeft size={18} style={{ flexShrink: 0 }} />
              </button>
              <button
                onClick={() => setCalDate(new Date())}
                style={{
                  padding: '0 14px', height: 32, fontSize: 12, fontWeight: 700,
                  borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                  transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                  flexShrink: 0
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent2)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                Today
              </button>
              <button
                onClick={() => { setCalDate(new Date(y, m + 1, 1)); setSelectedDay(null) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                  transition: 'all 0.2s', flexShrink: 0
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)' }}
              >
                <ChevronRight size={18} style={{ flexShrink: 0 }} />
              </button>
            </div>
          </div>

          <div className="cal-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 3,
            background: 'var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            border: '3px solid var(--border)'
          }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="cal-day-name" style={{
                background: 'var(--surface2)',
                padding: '12px 0',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>{d}</div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`e${i}`} className="cal-cell other-month" style={{ background: 'var(--surface)', opacity: 0.3 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isToday = today.getDate() === day && today.getMonth() === m && today.getFullYear() === y
              const evts = deadlineMap[day] || []
              const hasEvent = evts.length > 0
              const isSelected = selectedDay === day
              const assignEvts = evts.filter(e => e.assignId)
              const allSubmitted = assignEvts.length > 0 && assignEvts.every(e => getSubStatus(e.assignId) === 'submitted')
              const dotColor = allSubmitted ? 'var(--success)' : 'var(--danger)'

              return (
                <div
                  key={day}
                  onClick={() => hasEvent && setSelectedDay(isSelected ? null : day)}
                  className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvent ? 'clickable' : ''}`}
                  style={{
                    aspectRatio: '1/1',
                    background: isSelected ? 'var(--accent)' : 'var(--surface)',
                    color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: isToday || hasEvent ? 700 : 500,
                    cursor: hasEvent ? 'pointer' : 'default',
                    position: 'relative',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: isToday && !isSelected ? '2px solid var(--accent)' : 'none',
                    zIndex: isToday ? 1 : 0
                  }}
                  title={evts.map(e => e.name).join(', ')}
                >
                  {day}
                  {hasEvent && (
                    <span style={{
                      position: 'absolute',
                      bottom: 8,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: isSelected ? '#fff' : dotColor,
                      display: 'block',
                      boxShadow: isSelected ? 'none' : `0 0 8px ${dotColor}aa`
                    }} />
                  )}
                </div>
              )
            })}
          </div>

          <div className="cal-legend" style={{ display: 'flex', gap: 20, marginTop: 24, fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} /> Pending</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} /> Submitted</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} /> Today</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="calendar-side-panel">
          {selectedDay ? (
            <div className="fade-in">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
                  {selectedDay} {calDate.toLocaleDateString('en-IN', { month: 'long' })}
                </div>
                <div style={{ background: 'var(--surface2)', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
                  {dayEvents.length} EVENT{dayEvents.length !== 1 ? 'S' : ''}
                </div>
              </div>
              {dayEvents.map((ev, i) => {
                const subStatus = ev.assignId ? getSubStatus(ev.assignId) : null
                const isSubmitted = subStatus === 'submitted'
                const s = ev.assignment ? assignStatus(ev.assignment) : null

                return (
                  <div key={i} className="card event-card" style={{
                    padding: 16,
                    marginBottom: 12,
                    borderLeft: `4px solid ${ev.assignId ? (isSubmitted ? 'var(--success)' : 'var(--danger)') : 'var(--accent)'}`,
                    transition: 'transform 0.2s',
                    cursor: ev.assignment ? 'pointer' : 'default'
                  }} onClick={() => ev.assignment && setModalAssign(ev.assignment)}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--surface2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: ev.assignId ? (isSubmitted ? 'var(--success)' : 'var(--danger)') : 'var(--accent)'
                      }}>
                        {ev.type === 'assign' || ev.assignment ? <FileText size={18} /> : ev.type === 'quiz' ? <Edit3 size={18} /> : <CalendarIcon size={18} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{ev.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ev.course}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                        <Clock size={12} /> {fmt(ev.ts)}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {ev.assignment ? (
                          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 11, borderRadius: 8 }}>
                            {isSubmitted ? <><CheckCircle2 size={12} /> View</> : <><Upload size={12} /> Submit</>}
                          </button>
                        ) : (ev.actionUrl || ev.url) && (
                          <a href={ev.actionUrl || ev.url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: '6px 12px', fontSize: 11, borderRadius: 8, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Open <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <button
                onClick={() => setSelectedDay(null)}
                style={{ width: '100%', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
              >
                Back to Upcoming
              </button>
            </div>
          ) : (
            <div className="fade-in">
              <div className="section-header" style={{ marginBottom: 16 }}>
                <span className="section-title" style={{ fontWeight: 800, fontSize: 16 }}>Upcoming Deadlines</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {assignments
                  .filter(a => a.duedate && daysLeft(a.duedate) >= -1)
                  .slice(0, 6)
                  .map(a => {
                    const s = assignStatus(a)
                    const isSubmitted = getSubStatus(a.id) === 'submitted'
                    return (
                      <div key={a.id} onClick={() => setModalAssign(a)} className="card"
                        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .2s' }}
                      >
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isSubmitted ? 'var(--success)' : (s.filterKey === 'overdue' ? 'var(--danger)' : s.filterKey === 'soon' ? 'var(--warning)' : 'var(--accent)')
                        }} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(a.name, 35)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{a.courseshort}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: isSubmitted ? 'var(--success)' : (s.tagCls === 'tag-overdue' ? 'var(--danger)' : 'var(--text2)'),
                            textTransform: 'uppercase'
                          }}>
                            {isSubmitted ? 'SUBMITTED' : s.tag}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{fmt(a.duedate)}</div>
                        </div>
                      </div>
                    )
                  })
                }
                {assignments.filter(a => a.duedate && daysLeft(a.duedate) >= -1).length === 0 && (
                  <div className="empty-state card" style={{ padding: 20, textAlign: 'center' }}>
                    <CheckCircle2 size={24} className="text-success" style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>No upcoming deadlines 🎉</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalAssign && <AssignmentModal assignment={modalAssign} onClose={() => setModalAssign(null)} />}
    </div>
  )
}
