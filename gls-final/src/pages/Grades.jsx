import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMoodle } from '../hooks/useMoodle'
import Spinner from '../components/Spinner'
import { ExternalLink, Info, Award, GraduationCap, TrendingUp, BookOpen } from 'lucide-react'

const MOODLE = 'https://btech.glsmoodle.in'

export default function Grades() {
  const { user } = useAuth()
  const moodle = useMoodle()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.userid) return
    Promise.all([
      moodle.getCourses(user.userid),
      moodle.getGrades(user.userid).catch(() => ({ grades: [] }))
    ])
      .then(([cRes, gRes]) => {
        const _courses = Array.isArray(cRes) ? cRes : []
        const gradesArr = Array.isArray(gRes?.grades) ? gRes.grades : []

        const coursesWithGrades = _courses.map(course => {
          const gradeInfo = gradesArr.find(g => g.courseid === course.id)
          return {
            ...course,
            grade: gradeInfo ? (gradeInfo.rawgrade || gradeInfo.grade) : undefined
          }
        })
        setCourses(coursesWithGrades)
      })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [user?.userid])

  if (loading) return <Spinner text="Loading grades..." />

  const gradedCourses = courses.filter(c => c.grade !== undefined && c.grade !== null && c.grade !== '')
  const avgGrade = gradedCourses.length ? (gradedCourses.reduce((acc, c) => acc + parseFloat(c.grade), 0) / gradedCourses.length).toFixed(1) : null

  return (
    <div className="fade-in">
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Academic Grades</div>
            <div className="page-sub">Comprehensive overview of your performance across all subjects</div>
          </div>
          <a
            href={`${MOODLE}/grade/report/overview/index.php?userid=${user?.userid}`}
            target="_blank" rel="noreferrer"
            className="btn-accent"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, textDecoration: 'none' }}
          >
            Moodle Portal <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={28} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>GPA ESTIMATE</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{avgGrade || 'N/A'}</div>
          </div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={28} color="var(--success)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>COURSES</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{courses.length}</div>
          </div>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={28} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>GRADED</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{gradedCourses.length}</div>
          </div>
        </div>
      </div>

      {/* Grades Table */}
      <div className="card" style={{ overflow: 'hidden', borderRadius: 20 }}>
        <div style={{ padding: '24px 30px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <BookOpen size={20} color="var(--accent)" />
          <div style={{ fontWeight: 700, fontSize: 16 }}>Course Performance</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '16px 30px', fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Course Description</th>
                <th style={{ padding: '16px 30px', fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Numeric Grade</th>
                <th style={{ padding: '16px 30px', fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c, i) => {
                const grade = c.grade
                const hasGrade = grade !== undefined && grade !== null && grade !== ''
                const gradeNum = hasGrade ? parseFloat(grade) : null
                const gradeColor = gradeNum === null ? 'var(--text3)' : gradeNum >= 70 ? '#10b981' : gradeNum >= 40 ? '#f59e0b' : '#ef4444'

                return (
                  <tr key={c.id} style={{ borderBottom: i < courses.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.2s' }} className="row-hover">
                    <td style={{ padding: '20px 30px' }}>
                      <a
                        href={`${MOODLE}/grade/report/user/index.php?id=${c.id}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: 15, color: 'var(--text)', textDecoration: 'none', fontWeight: 600, display: 'block' }}
                      >
                        {c.fullname}
                      </a>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{c.shortname || c.idnumber || 'Undergraduate'}</div>
                    </td>
                    <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                      {hasGrade ? (
                        <span style={{ fontSize: 18, fontWeight: 800, color: gradeColor }}>
                          {gradeNum?.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                      {hasGrade ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: `${gradeColor}15`, color: gradeColor, borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1px solid ${gradeColor}30` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: gradeColor }}></span>
                          {gradeNum >= 40 ? 'PASSED' : 'FAILED'}
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--surface2)', color: 'var(--text3)', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)' }}></span>
                          UNGRADED
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {courses.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>No course records found in your profile.</div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 14 }}>
        <Info size={18} style={{ flexShrink: 0, color: 'var(--accent)', marginTop: 2 }} />
        <div style={{ lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Note on Grading</div>
          Grades are synced directly from Moodle. If a grade appears as "Pending", it means the assessment hasn't been graded or the results aren't published yet.
          Click on any course name to see a detailed breakdown of assignments, quizzes, and weighted components.
        </div>
      </div>
    </div>
  )
}
