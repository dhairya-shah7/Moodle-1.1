import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, AlertCircle, Clock, CheckCircle2, PartyPopper, Calendar, Filter, ChevronRight, Search, EyeOff } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { fmt, daysLeft, assignStatus, getFormattedDate } from '../utils/helpers'
import AssignmentModal from '../components/AssignmentModal'
import Spinner from '../components/Spinner'

const FILTERS = [
  { key: 'all',       label: 'All', icon: Filter },
  { key: 'pending',   label: 'Pending', icon: Send },
  { key: 'overdue',   label: 'Overdue', icon: AlertCircle },
  { key: 'soon',      label: 'Due Soon', icon: Clock },
  { key: 'submitted', label: 'Submitted', icon: CheckCircle2 },
  { key: 'ignored',   label: 'Ignored', icon: EyeOff },
]

export default function Assignments() {
  const { assignments, submissions, loading, ignoredAssignmentIds = [] } = useAppData()
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const location = useLocation()

  useEffect(() => {
    if (location.state?.openAssignmentId && assignments.length > 0) {
      const found = assignments.find(a => a.id === location.state.openAssignmentId)
      if (found) {
        setSelected(found)
      }
    }
  }, [location.state, assignments])

  const getSubStatus = (a) => {
    const sub = submissions[a.id]
    return sub?.lastattempt?.submission?.status || 'new'
  }

  const filtered = assignments.filter(a => {
    const s = assignStatus(a)
    const subStatus = getSubStatus(a)
    const isIgnored = ignoredAssignmentIds.includes(a.id)
    const isPending = subStatus !== 'submitted' && !isIgnored
    
    // Search match
    const searchMatch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.courseshort && a.courseshort.toLowerCase().includes(search.toLowerCase()))
    if (!searchMatch) return false

    if (filter === 'all') return true
    if (filter === 'pending') return isPending
    if (filter === 'submitted') return subStatus === 'submitted'
    if (filter === 'overdue') return s.filterKey === 'overdue' && isPending
    if (filter === 'soon') return s.filterKey === 'soon' && isPending
    if (filter === 'ignored') return isIgnored
    return true
  })

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div className="page-title">Assignments</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
          </div>
          <div className="page-sub">Track and manage your academic submissions</div>
        </div>
        
        <div className="search-box" style={{ 
          position: 'relative', 
          maxWidth: 300, 
          width: '100%',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text3)' }} />
          <input 
            type="text" 
            placeholder="Search assignments..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '10px 12px 10px 38px', 
              background: 'var(--surface)', 
              border: '1px solid var(--border)', 
              borderRadius: 10,
              color: 'var(--text)',
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
      </div>

      <div className="assign-filter" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, marginBottom: 20 }}>
        {FILTERS.map(f => {
           const Icon = f.icon
           return (
            <button 
              key={f.key} 
              className={`filter-btn ${filter === f.key ? 'active' : ''}`} 
              onClick={() => setFilter(f.key)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                whiteSpace: 'nowrap',
                padding: '10px 16px',
                borderRadius: 10,
                background: filter === f.key ? 'var(--accent)' : 'var(--surface)',
                color: filter === f.key ? '#fff' : 'var(--text2)',
                border: filter === f.key ? '1px solid var(--accent)' : '1px solid var(--border)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <Icon size={14} />
              {f.label}
            </button>
           )
        })}
      </div>

      {loading ? <Spinner /> : filtered.length === 0
        ? (
          <div className="empty-state card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <PartyPopper size={48} className="text-accent" style={{ marginBottom: 16, opacity: 0.5 }} />
            <div className="empty-title" style={{ fontSize: 18, fontWeight: 600 }}>No assignments found</div>
            <div className="empty-sub" style={{ color: 'var(--text3)', marginTop: 8 }}>Try changing your filters or search query.</div>
          </div>
        )
        : <div className="assign-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(a => {
              const s = assignStatus(a)
              const subStatus = getSubStatus(a)
              const isSubmitted = subStatus === 'submitted'
              const isIgnored = ignoredAssignmentIds.includes(a.id)
              return (
                <div key={a.id} className="card assign-item" style={{ 
                  cursor: 'pointer', 
                  transition: 'transform 0.2s, border-color 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }} 
                onClick={() => setSelected(a)}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateX(4px)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateX(0)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
                >
                  <div className={`assign-dot ${s.cls}`} style={{ 
                    width: 4, 
                    height: 32, 
                    borderRadius: 4,
                    background: isSubmitted ? 'var(--success)' : (s.filterKey === 'overdue' ? 'var(--danger)' : s.filterKey === 'soon' ? 'var(--warning)' : 'var(--accent)'),
                    flexShrink: 0
                  }} />
                  
                  <div className="assign-item-content">
                    <div className="assign-name" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>{a.name}</div>
                    <div className="assign-course" style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{a.courseshort || a.coursename}</div>
                  </div>

                  <div className="assign-item-right">
                    <div className="assign-status" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {isIgnored && (
                        <div style={{ 
                          background: 'rgba(255,255,255,0.06)', 
                          color: 'var(--text2)', 
                          fontSize: 11, 
                          fontWeight: 700, 
                          padding: '4px 12px', 
                          borderRadius: 20, 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6,
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                          border: '1px solid var(--border)'
                        }}>
                          <EyeOff size={12} /> Ignored
                        </div>
                      )}
                      {isSubmitted ? (
                        <div style={{ 
                          background: 'rgba(16,185,129,0.1)', 
                          color: 'var(--success)', 
                          fontSize: 11, 
                          fontWeight: 700, 
                          padding: '4px 12px', 
                          borderRadius: 20, 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6,
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em'
                        }}>
                          <CheckCircle2 size={12} /> Submitted
                        </div>
                      ) : (
                        <div style={{ 
                          background: 'rgba(239,68,68,0.1)', 
                          color: 'var(--danger)', 
                          fontSize: 11, 
                          fontWeight: 700, 
                          padding: '4px 12px', 
                          borderRadius: 20, 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6,
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em'
                        }}>
                          <Clock size={12} /> Pending
                        </div>
                      )}
                    </div>

                    <div className="assign-due" style={{ textAlign: 'right' }}>
                      <div className={`due-date ${s.tagCls}`} style={{ 
                        fontSize: 11, 
                        fontWeight: 800, 
                        color: isSubmitted ? 'var(--success)' : (s.tagCls === 'tag-overdue' ? 'var(--danger)' : s.tagCls === 'tag-soon' ? 'var(--warning)' : 'var(--text2)'),
                        marginBottom: 2
                      }}>{isSubmitted ? 'DONE' : s.tag}</div>
                      <div className="due-label" style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        <Calendar size={10} /> {fmt(a.duedate)}
                      </div>
                    </div>
                  </div>
                  
                  <ChevronRight size={16} style={{ color: 'var(--text3)', opacity: 0.5, flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
      }

      {selected && <AssignmentModal assignment={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
