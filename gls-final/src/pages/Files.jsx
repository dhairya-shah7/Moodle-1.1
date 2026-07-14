import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import { fileIcon, truncate, getViewerUrl, getFormattedDate, forceDownload } from '../utils/helpers'
import Spinner from '../components/Spinner'
import { 
  FileText, FilePlus, FileSpreadsheet, FilePieChart as FilePPT, 
  FileArchive, Video, Image, Link as LinkIcon, 
  Search, LayoutGrid, List, ExternalLink, Download, 
  ChevronUp, ChevronDown, Folder, Library, File
} from 'lucide-react'

const EXT_COLOR = {
  pdf: '#ef4444', word: '#3b82f6', ppt: '#f59e0b', excel: '#10b981', 
  zip: '#8b5cf6', video: '#06b6d4', image: '#ec4899'
}

const getIcon = (type, size = 20, color = 'var(--text3)') => {
  const props = { size, color, style: { flexShrink: 0 } }
  switch (type) {
    case 'pdf': return <FileText {...props} color={EXT_COLOR.pdf} />
    case 'word': return <FileText {...props} color={EXT_COLOR.word} />
    case 'ppt': return <FilePPT {...props} color={EXT_COLOR.ppt} />
    case 'excel': return <FileSpreadsheet {...props} color={EXT_COLOR.excel} />
    case 'zip': return <FileArchive {...props} color={EXT_COLOR.zip} />
    case 'video': return <Video {...props} color={EXT_COLOR.video} />
    case 'image': return <Image {...props} color={EXT_COLOR.image} />
    case 'link': return <LinkIcon {...props} color="var(--accent)" />
    default: return <File {...props} />
  }
}

const fmtSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const fmtDate = (ts) => {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FileCard({ f }) {
  const isLink = f.itemType === 'link'
  const iconType = isLink ? 'link' : fileIcon(f.filename)
  const color = isLink ? 'var(--accent)' : (EXT_COLOR[iconType] || 'var(--text3)')
  const viewerUrl = isLink ? f.url : getViewerUrl(f.url, f.filename)
  const href = viewerUrl || f.url

  const handleCardClick = () => {
    window.open(href, '_blank')
  }

  const handleActionClick = (e) => {
    e.stopPropagation()
    if (isLink) {
      window.open(f.url, '_blank')
    } else {
      forceDownload(f.url, f.filename)
    }
  }

  return (
    <div onClick={handleCardClick} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
      <div
        className="card-hover"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'all .2s', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {getIcon(iconType, 24)}
          </div>
          <span style={{ background: color + '18', color, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5 }}>
            {(isLink ? 'LINK' : (f.filename || '').split('.').pop()).toUpperCase().slice(0, 4)}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1 }}>
          {f.filename}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {fmtSize(f.filesize) && <span>{fmtSize(f.filesize)}</span>}
            {fmtSize(f.filesize) && fmtDate(f.timemodified) && <span>·</span>}
            {fmtDate(f.timemodified) && <span>{fmtDate(f.timemodified)}</span>}
          </div>
          <div 
            onClick={handleActionClick}
            className="row-hover"
            style={{ flexShrink: 0, padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {isLink ? <ExternalLink size={12} /> : <Download size={12} />}
            {isLink ? 'Open' : 'Save'}
          </div>
        </div>
      </div>
    </div>
  )
}

function FileRow({ f }) {
  const isLink = f.itemType === 'link'
  const iconType = isLink ? 'link' : fileIcon(f.filename)
  const color = isLink ? 'var(--accent)' : (EXT_COLOR[iconType] || 'var(--text3)')
  const viewerUrl = isLink ? f.url : getViewerUrl(f.url, f.filename)

  const handleActionClick = (e) => {
    e.preventDefault()
    if (isLink) {
      window.open(f.url, '_blank')
    } else {
      forceDownload(f.url, f.filename)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {getIcon(iconType, 20)}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {viewerUrl ? (
          <a href={viewerUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
          >{f.filename}</a>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
          {fmtSize(f.filesize)}{fmtSize(f.filesize) && fmtDate(f.timemodified) ? ' · ' : ''}{fmtDate(f.timemodified)}
        </div>
      </div>
      <span style={{ background: color + '18', color, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
        {(isLink ? 'LINK' : (f.filename || '').split('.').pop()).toUpperCase().slice(0, 4)}
      </span>
      <a href={f.url} onClick={handleActionClick}
        style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
        {isLink ? <ExternalLink size={14} /> : <Download size={14} />}
        {isLink ? 'Open' : 'Download'}
      </a>
    </div>
  )
}

export default function Files() {
  const { files, loading, loadFilesForCourse } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const courseId = searchParams.get('courseId')
  const initialSearch = searchParams.get('search') || ''
  const [search, setSearch] = useState(initialSearch)
  const [collapsedCourses, setCollapsedCourses] = useState({})
  const [viewMode, setViewMode] = useState('grid')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    setSearch(searchParams.get('search') || '')
  }, [searchParams])

  useEffect(() => {
    if (courseId) {
      loadFilesForCourse(courseId)
    }
  }, [courseId, loadFilesForCourse])

  const handleSearchChange = (value) => {
    setSearch(value)
    if (value) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('search', value)
        return next
      })
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('search')
        return next
      })
    }
  }

  const filtered = files.filter(f => {
    if (typeFilter !== 'all' && f.itemType !== typeFilter) return false
    
    // Strict courseId matching
    if (courseId && String(f.courseid) !== String(courseId)) return false

    if (!search) return true
    const q = search.toLowerCase()
    return f.filename?.toLowerCase().includes(q) || 
           f.coursename?.toLowerCase().includes(q) || 
           f.courseshort?.toLowerCase().includes(q) || 
           f.sectionname?.toLowerCase().includes(q)
  })

  const grouped = {}
  filtered.forEach(f => {
    const ck = f.courseshort || f.coursename || 'General'
    if (!grouped[ck]) grouped[ck] = { name: f.coursename, short: ck, sections: {} }
    const sk = f.sectionname || 'General'
    if (!grouped[ck].sections[sk]) grouped[ck].sections[sk] = []
    grouped[ck].sections[sk].push(f)
  })
  const courseKeys = Object.keys(grouped)

  const contextFiles = courseId ? files.filter(f => String(f.courseid) === String(courseId)) : files
  const fileCount = contextFiles.filter(f => f.itemType === 'file').length
  const linkCount = contextFiles.filter(f => f.itemType === 'link').length

  const selectedCourseName = courseId ? (files.find(f => String(f.courseid) === String(courseId))?.coursename || 'Course Materials') : ''

  if (loading && courseId && !files.some(f => String(f.courseid) === String(courseId))) {
    return <Spinner text="Loading faculty files..." />
  }

  return (
    <div>
      {(initialSearch || courseId) && (
        <button
          onClick={() => navigate('/courses')}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--text2)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '16px',
            transition: 'all 0.15s ease'
          }}
          className="card-hover"
        >
          &larr; Back to Courses
        </button>
      )}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        <div>
          <div className="page-title">{selectedCourseName || 'Faculty Files'}</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>All course materials — grouped by subject and section</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
      </div>

      {/* Stats + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${files.length})`, icon: <Library size={14} /> },
          { key: 'file', label: `Files (${fileCount})`, icon: <File size={14} /> },
          { key: 'link', label: `Links (${linkCount})`, icon: <LinkIcon size={14} /> },
        ].map(t => (
          <button key={t.key} onClick={() => setTypeFilter(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: '1px solid var(--border)', background: typeFilter === t.key ? 'var(--accent)' : 'var(--surface2)', color: typeFilter === t.key ? '#fff' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {t.icon} {t.label}
          </button>
        ))}

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search files..."
            className="field-input"
            style={{ width: '100%', paddingLeft: 38, fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setViewMode('grid')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: viewMode === 'grid' ? 'var(--accent)' : 'var(--surface2)', color: viewMode === 'grid' ? '#fff' : 'var(--text2)', cursor: 'pointer' }}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode('list')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: viewMode === 'list' ? 'var(--accent)' : 'var(--surface2)', color: viewMode === 'list' ? '#fff' : 'var(--text2)', cursor: 'pointer' }}>
            <List size={16} />
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Folder size={32} color="var(--text3)" />
          </div>
          <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No faculty files found</div>
          <div style={{ color: 'var(--text3)', fontSize: 14 }}>Files and links uploaded by faculty will appear here.</div>
        </div>
      ) : courseKeys.length === 0 ? (
        <div className="empty">No results match your search</div>
      ) : (
        courseKeys.map(ck => {
          const course = grouped[ck]
          const isOpen = !collapsedCourses[ck]
          const total = Object.values(course.sections).flat().length

          return (
            <div key={ck} style={{ marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
              <div onClick={() => setCollapsedCourses(prev => ({ ...prev, [ck]: !prev[ck] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', cursor: 'pointer', background: 'var(--surface2)', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <Library size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{ck}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{truncate(course.name, 55)}</div>
                </div>
                <span style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                  {total} item{total !== 1 ? 's' : ''}
                </span>
                {isOpen ? <ChevronUp size={18} color="var(--text3)" /> : <ChevronDown size={18} color="var(--text3)" />}
              </div>

              {isOpen && Object.entries(course.sections).map(([secName, secFiles]) => (
                <div key={secName}>
                  <div style={{ padding: '10px 22px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={12} /> {secName} &nbsp;·&nbsp; {secFiles.length} item{secFiles.length !== 1 ? 's' : ''}
                  </div>
                  {viewMode === 'grid' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 16, padding: '18px 22px 20px' }}>
                      {secFiles.map((f, i) => <FileCard key={i} f={f} />)}
                    </div>
                  ) : (
                    <div style={{ paddingBottom: 8 }}>
                      {secFiles.map((f, i) => <FileRow key={i} f={f} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
