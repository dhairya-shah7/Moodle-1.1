import { useState, useEffect } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { useMoodle } from '../hooks/useMoodle'
import { fmt, getFormattedDate } from '../utils/helpers'
import Spinner from '../components/Spinner'
import { 
  FileText, Inbox, CheckCircle2, AlertCircle, 
  ChevronRight, Save, MessageSquare, Download,
  ExternalLink, GraduationCap
} from 'lucide-react'

export default function Submissions() {
  const { assignments, courses } = useAppData()
  const { canEditCourse, role } = useAuth()
  const moodle = useMoodle()

  const [selectedAssign, setSelectedAssign] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [grading, setGrading] = useState({}) // assignId_userId -> grade input
  const [savingGrade, setSavingGrade] = useState(null)
  const [feedback, setFeedback] = useState({})

  // Only show assignments for courses this faculty can edit
  const myAssignments = assignments.filter(a => canEditCourse(a.courseid || a.course))

  const loadSubmissions = async (assign) => {
    setSelectedAssign(assign)
    setSubmissions([])
    setLoadingSubs(true)
    try {
      const data = await moodle.getSubmissions(assign.id)
      const subs = data?.assignments?.[0]?.submissions || []
      setSubmissions(subs)
    } catch (e) {
      console.error('Error loading submissions', e)
    }
    setLoadingSubs(false)
  }

  const handleSaveGrade = async (assign, userId) => {
    const key = `${assign.id}_${userId}`
    const grade = grading[key]
    if (grade === undefined || grade === '') return
    setSavingGrade(key)
    try {
      await moodle.saveGrade(assign.id, userId, parseFloat(grade), feedback[key] || '')
      alert(`✅ Grade saved for student ID ${userId}`)
    } catch (e) {
      alert('❌ Failed to save grade: ' + e.message)
    }
    setSavingGrade(null)
  }

  if (role === 'student') {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <AlertCircle size={40} color="var(--danger)" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Faculty Access Only</div>
        <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 8 }}>This portal is reserved for instructors to grade submissions.</div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
        <div>
          <div className="page-title">Grading Center</div>
          <div className="page-sub">Evaluate assignment submissions and provide feedback to students</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
      </div>

      <div className="submissions-layout">

        {/* Left: assignment list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
              ACTIVE ASSIGNMENTS
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface2)', color: 'var(--text2)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {myAssignments.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myAssignments.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 16, color: 'var(--text3)', fontSize: 13 }}>
                No assignments found.
              </div>
            )}
            {myAssignments.map(a => {
              const isActive = selectedAssign?.id === a.id
              return (
                <div key={a.id}
                  onClick={() => loadSubmissions(a)}
                  style={{
                    padding: '16px 20px', borderRadius: 16, border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
                    background: isActive ? 'var(--accent)' : 'var(--surface2)',
                    color: isActive ? '#fff' : 'var(--text)',
                    cursor: 'pointer', transition: 'all .2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex', alignItems: 'center', gap: 14
                  }}
                  onMouseEnter={e => !isActive && (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => !isActive && (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color={isActive ? '#fff' : 'var(--accent)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div style={{ fontSize: 11, marginTop: 2, opacity: isActive ? 0.9 : 0.6 }}>{a.courseshort}</div>
                  </div>
                  <ChevronRight size={16} opacity={0.5} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: submissions panel */}
        <div style={{ minWidth: 0 }}>
          {!selectedAssign ? (
            <div className="card" style={{ padding: 100, textAlign: 'center', borderStyle: 'dashed', background: 'transparent' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <Inbox size={40} color="var(--text3)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Ready to Grade?</div>
              <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 8 }}>Select an assignment from the sidebar to start reviewing student work.</div>
            </div>
          ) : (
            <div className="fade-in">
              <div className="card" style={{ padding: '24px 30px', marginBottom: 24, background: 'var(--surface2)', borderLeft: '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{selectedAssign.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{selectedAssign.coursename}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase' }}>DEADLINE</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', marginTop: 2 }}>{selectedAssign.duedate > 0 ? fmt(selectedAssign.duedate) : 'No deadline'}</div>
                  </div>
                </div>
              </div>

              {loadingSubs ? (
                <div style={{ padding: 60 }}><Spinner text="Fetching submissions..." /></div>
              ) : submissions.length === 0 ? (
                <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text3)' }}>No submissions have been received for this assignment yet.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {submissions.map(sub => {
                    const key = `${selectedAssign.id}_${sub.userid}`
                    const pluginFiles = sub.plugins?.find(p => p.type === 'file')?.fileareas?.[0]?.files || []
                    const isSubmitted = sub.status === 'submitted'

                    return (
                      <div key={sub.userid} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#475569' }}>
                              ST
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>Student ID #{sub.userid}</div>
                              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                                {sub.timemodified ? `Last active: ${fmt(sub.timemodified)}` : 'No activity recorded'}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {isSubmitted ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: 20, fontSize: 11, fontWeight: 800, border: '1px solid rgba(16,185,129,0.2)' }}>
                                <CheckCircle2 size={12} /> SUBMITTED
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: 20, fontSize: 11, fontWeight: 800, border: '1px solid rgba(245,158,11,0.2)' }}>
                                <Clock size={12} /> DRAFT
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ padding: '24px' }}>
                          {/* Files section */}
                          {pluginFiles.length > 0 ? (
                            <div style={{ marginBottom: 24 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Submitted Documents</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                {pluginFiles.map((f, i) => (
                                  <a key={i} href={`${f.fileurl}?token=${moodle.token}`} target="_blank" rel="noreferrer"
                                    className="row-hover"
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
                                    <Download size={14} color="var(--accent)" />
                                    {f.filename}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginBottom: 24, padding: '16px 20px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text3)', fontSize: 13 }}>
                              No files were uploaded with this submission.
                            </div>
                          )}

                          {/* Grading controls */}
                          <div className="grading-controls-grid">
                            <div style={{ position: 'relative' }}>
                              <GraduationCap size={16} color="var(--text3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                              <input
                                type="number"
                                placeholder="Grade / 100"
                                value={grading[key] ?? ''}
                                onChange={e => setGrading(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}
                              />
                            </div>
                            <div style={{ position: 'relative' }}>
                              <MessageSquare size={16} color="var(--text3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                              <input
                                type="text"
                                placeholder="Add professional feedback..."
                                value={feedback[key] ?? ''}
                                onChange={e => setFeedback(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                              />
                            </div>
                            <button
                              onClick={() => handleSaveGrade(selectedAssign, sub.userid)}
                              disabled={savingGrade === key || !grading[key]}
                              className="btn-accent"
                              style={{ height: '100%', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !grading[key] ? 0.5 : 1 }}>
                              {savingGrade === key ? <Spinner size={14} /> : <Save size={16} />}
                              <span>Save Grade</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


