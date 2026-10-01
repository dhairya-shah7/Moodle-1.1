import { assignStatus, fmt, truncate } from '../utils/helpers'

export default function AssignmentItem({ assignment, compact = false, onClick }) {
  const s = assignStatus(assignment)

  return (
    <div className="assign-item assign-item--compact" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div className={`assign-dot ${s.cls}`} />
      <div className="assign-item-content" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div className="assign-name" style={{ fontSize: compact ? 13 : 14 }}>
          {assignment.name}
        </div>
        <div className="assign-course">
          {truncate(assignment.courseshort || assignment.coursename, 35)}
        </div>
      </div>
      <div className="assign-due">
        <div className={`due-date ${s.tagCls}`} style={{ fontSize: compact ? 12 : 14 }}>
          {s.tag}
        </div>
        {!compact && <div className="due-label">{fmt(assignment.duedate)}</div>}
      </div>
    </div>
  )
}
