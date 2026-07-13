import { Book, Search, GraduationCap } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import CourseCard from '../components/CourseCard'
import Spinner from '../components/Spinner'
import { getFormattedDate } from '../utils/helpers'

export default function Courses() {
  const { courses, loading, hiddenCourseIds, restoreAllCourses } = useAppData()
  const semMatch = courses.map(c => c.fullname).join(' ').match(/Semester\s+\d+/i)

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="stat-icon-wrap blue" style={{ width: 40, height: 40 }}>
            <GraduationCap size={24} />
          </div>
          <div>
            <div className="page-title" style={{ marginBottom: 2 }}>My Courses</div>
            <div className="page-sub">{semMatch ? `${semMatch[0]} — All Courses` : 'All enrolled courses'}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
      </div>

      {loading ? (
        <div style={{ padding: '80px 0' }}>
          <Spinner />
        </div>
      ) : (
        <div className="courses-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', 
          gap: 20 
        }}>
          {courses.map(c => (
            <CourseCard
              key={c.id}
              course={c}
            />
          ))}
          {courses.length === 0 && (
            <div className="empty-state card" style={{ padding: '60px 20px', gridColumn: '1 / -1' }}>
              <Book size={48} className="text-accent" style={{ opacity: 0.2, marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)' }}>No courses found</div>
              <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 8 }}>You are not currently enrolled in any courses.</p>
            </div>
          )}
        </div>
      )}

      {hiddenCourseIds?.length > 0 && (
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <button 
            onClick={restoreAllCourses}
            style={{
              background: 'var(--surface2)',
              border: '1px dashed var(--border)',
              color: 'var(--text2)',
              padding: '10px 20px',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            Restore {hiddenCourseIds.length} Hidden Course{hiddenCourseIds.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}

