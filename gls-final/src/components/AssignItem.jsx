import { assignStatus, fmt, truncate } from '../utils/helpers'

export default function AssignItem({ a, compact = false }) {
  const s = assignStatus(a)
  return (
    <div className="assign-item">
      <div className={`assign-dot ${s.cls}`} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div className="assign-name">{a.name}</div>
        <div className="assign-course">{truncate(a.courseshort || a.coursename, 30)}</div>
      </div>
      <div className="assign-due">
        <div className={`due-date ${s.tagCls}`}>{s.tag}</div>
        {!compact && <div className="due-label">{fmt(a.duedate)}</div>}
      </div>
    </div>
  )
}
