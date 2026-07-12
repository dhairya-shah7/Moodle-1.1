import { Pencil, Eye, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { truncate } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'

export default function CourseCard({ course }) {
  const { canEditCourse, isFaculty, isAdmin } = useAuth()
  const { hideCourse } = useAppData()
  const navigate = useNavigate()
  const pct = course.progress ? Math.round(course.progress) : 0

  const openFiles = () => {
    navigate(`/files?courseId=${course.id}`)
  }

  const openMoodle = (e) => {
    e.stopPropagation()
    window.open(`https://btech.glsmoodle.in/course/view.php?id=${course.id}`, '_blank', 'noopener,noreferrer')
  }

  const openEdit = (e) => {
    e.stopPropagation()
    window.open(`https://btech.glsmoodle.in/course/edit.php?id=${course.id}`, '_blank', 'noopener,noreferrer')
  }

  const canEdit = canEditCourse(course.id)

  return (
    <div className="course-card" onClick={openFiles} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 10 }}>
        {/* Hide/Delete course from view */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm("Are you sure you want to remove this course from view?")) {
              hideCourse(course.id)
            }
          }}
          title="Remove course from view"
          type="button"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--danger)',
            padding: '5px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-soft)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
        >
          <Trash2 size={12} />
        </button>

        {/* Open in Moodle button */}
        <button
          onClick={openMoodle}
          title="Open in Moodle"
          type="button"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            padding: '5px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
        >
          <ExternalLink size={12} />
        </button>

        {/* Faculty/Admin Edit badge */}
        {canEdit && (
          <span
            onClick={openEdit}
            title="Edit course on Moodle"
            style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Pencil size={12} /> Edit
          </span>
        )}

        {/* View-only badge for faculty browsing non-own courses */}
        {(isFaculty || isAdmin) && !canEdit && (
          <span style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--text3)', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} /> View only
          </span>
        )}
      </div>

      <div className="course-name" style={{ paddingRight: 40 }}>{course.fullname}</div>
      <div className="course-cat" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="badge badge-blue">{truncate(course.shortname || 'Course', 20)}</span>
        <span style={{ color: 'var(--text3)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <FolderOpen size={12} /> Files
        </span>
      </div>
      <div className="progress-bar" style={{ marginTop: 12 }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-label">{pct}% complete</div>
    </div>
  )
}
