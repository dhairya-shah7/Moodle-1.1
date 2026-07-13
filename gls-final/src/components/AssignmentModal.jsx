import { useState, useRef, useCallback } from 'react'
import { 
  X, XCircle, CheckCircle2, Clock, FileText, 
  BarChart3, FileSpreadsheet, Paperclip, File, 
  UploadCloud, AlertTriangle, Loader2, Pencil
} from 'lucide-react'
import { useMoodle } from '../hooks/useMoodle'
import { useAppData } from '../context/AppDataContext'
import { fmt, daysLeft, assignStatus, getViewerUrl, sanitizeHtml } from '../utils/helpers'
import toast from 'react-hot-toast'

const MAX_SIZE = 2 * 1024 * 1024

const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`))
    document.head.appendChild(script)
  })
}

const compressPDF = async (file, quality = 0.6, scale = 1.3) => {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js')
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const { jsPDF } = window.jspdf
  const doc = new jsPDF()

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport }).promise

    const imgData = canvas.toDataURL('image/jpeg', quality)

    if (i > 1) {
      doc.addPage()
    }

    const pdfWidth = doc.internal.pageSize.getWidth()
    const pdfHeight = doc.internal.pageSize.getHeight()
    doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
  }

  const compressedBlob = doc.output('blob')
  return new File([compressedBlob], file.name.replace(/\.pdf$/i, '_compressed.pdf'), {
    type: 'application/pdf'
  })
}

const compressDOCX = async (file) => {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')

  const arrayBuffer = await file.arrayBuffer()
  const zip = await window.JSZip.loadAsync(arrayBuffer)

  const mediaFolder = zip.folder('word/media')
  if (mediaFolder) {
    const promises = []
    mediaFolder.forEach((relativePath, zipEntry) => {
      if (/\.(jpe?g|png|gif|webp)$/i.test(zipEntry.name)) {
        promises.push((async () => {
          try {
            const imgBuffer = await zipEntry.async('arraybuffer')
            const blob = new Blob([imgBuffer])
            const bitmap = await createImageBitmap(blob)

            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            let width = bitmap.width
            let height = bitmap.height
            const maxDim = 1200
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width)
                width = maxDim
              } else {
                width = Math.round((width * maxDim) / height)
                height = maxDim
              }
            }

            canvas.width = width
            canvas.height = height
            ctx.drawImage(bitmap, 0, 0, width, height)

            const compressedBlob = await new Promise(resolve => {
              canvas.toBlob(resolve, 'image/jpeg', 0.6)
            })

            if (compressedBlob) {
              zip.file(zipEntry.name, compressedBlob)
            }
          } catch (e) {
            console.warn('Failed to compress document image', zipEntry.name, e)
          }
        })())
      }
    })

    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }

  const compressedBlob = await zip.generateAsync({ type: 'blob' })
  return new File([compressedBlob], file.name.replace(/\.docx$/i, '_compressed.docx'), {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

export default function AssignmentModal({ assignment, onClose }) {
  const moodle = useMoodle()
  const { submissions, refreshSubmission, ignoredAssignmentIds = [], ignoreAssignment, unignoreAssignment, role } = useAppData()
  const sub = submissions[assignment?.id]
  const isIgnored = ignoredAssignmentIds.includes(assignment?.id)
  const submittedFiles = sub?.lastattempt?.submission?.plugins
    ?.find(p => p.type === 'file')?.fileareas?.[0]?.files || []
  const submissionStatus = sub?.lastattempt?.submission?.status || 'new'
  const gradingStatus = sub?.lastattempt?.gradingstatus || 'notgraded'

  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef()
  const compressorFileInputRef = useRef()
  const [compressDragOver, setCompressDragOver] = useState(false)
  const [compressing, setCompressing] = useState(false)

  const handleCompressAndSelect = async (file) => {
    if (!file) return
    setError('')
    setUploadDone(false)

    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      toast.error('Only PDF and Word (.docx) files are supported for compression.')
      return
    }

    setCompressing(true)
    try {
      let resultFile = file
      if (ext === 'pdf') {
        toast.loading('Compressing PDF...', { id: 'compress' })
        resultFile = await compressPDF(file)
      } else if (ext === 'docx') {
        toast.loading('Compressing Word Document...', { id: 'compress' })
        resultFile = await compressDOCX(file)
      }

      if (resultFile.size > MAX_SIZE) {
        if (ext === 'pdf') {
          toast.loading('Applying extra compression...', { id: 'compress' })
          resultFile = await compressPDF(resultFile, 0.4, 1.0)
        }
      }

      if (resultFile.size > MAX_SIZE) {
        toast.error(`Compressed file is still ${(resultFile.size / (1024 * 1024)).toFixed(2)}MB (exceeds 2MB).`, { id: 'compress' })
        setError(`Compressed file size (${(resultFile.size / (1024 * 1024)).toFixed(2)}MB) exceeds 2MB limit.`)
      } else {
        setSelectedFile(resultFile)
        toast.success(`Successfully compressed to ${(resultFile.size / 1024).toFixed(0)} KB!`, { id: 'compress' })
      }
    } catch (err) {
      console.error(err)
      toast.error('Compression failed: ' + err.message, { id: 'compress' })
      setError('Compression failed: ' + err.message)
    } finally {
      setCompressing(false)
    }
  }

  const s = assignStatus(assignment)

  const handleFile = (file) => {
    setError(''); setUploadDone(false)
    if (!file) return
    if (file.size > MAX_SIZE) { setError('File exceeds 2MB limit'); return }
    setSelectedFile(file)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handleSubmit = async () => {
    if (!selectedFile) return
    setUploading(true); setError('')
    try {
      const uploadResult = await moodle.uploadFileToDraft(selectedFile)
      if (!uploadResult) throw new Error('No response from server')
      if (uploadResult.error) throw new Error(uploadResult.error)
      if (!Array.isArray(uploadResult)) throw new Error(JSON.stringify(uploadResult))
      if (uploadResult[0]?.error) throw new Error(uploadResult[0].error)

      const itemId = uploadResult[0].itemid
      if (!itemId) throw new Error('No item ID returned from upload')

      await moodle.saveSubmission(assignment.id, itemId)
      const submitResult = await moodle.submitForGrading(assignment.id)

      await refreshSubmission(assignment.id)
      setUploadDone(true)
      setSelectedFile(null)
      toast.success('Submitted to Moodle!')
    } catch (e) {
      console.error('Upload error:', e)
      setError(e.message)
      toast.error('Upload failed: ' + e.message)
    }
    setUploading(false)
  }

  if (!assignment) return null

  const d = daysLeft(assignment.duedate)
  const timeRemaining = !assignment.duedate ? 'No deadline'
    : d < 0 ? `${Math.abs(d)} day(s) late`
      : d === 0 ? 'Due today!'
        : `${d} day(s) remaining`
  const timeColor = d < 0 ? 'var(--danger)' : d <= 3 ? 'var(--warning)' : 'var(--success)'

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '40px 16px' }}
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 680, padding: 32, position: 'relative', margin: 'auto' }}>

        {/* Close btn */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 4, paddingRight: 40 }}>{assignment.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>{assignment.courseshort} — {assignment.coursename}</div>

        {/* Status table */}
        <div style={{ background: 'var(--surface2)', borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border)' }}>
          {[
            ['Submission Status',
              <div key="sub-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {submissionStatus === 'submitted' ? <CheckCircle2 size={14} /> : submissionStatus === 'draft' ? <FileText size={14} /> : <XCircle size={14} />}
                {submissionStatus === 'submitted' ? 'Submitted for grading'
                  : submissionStatus === 'draft' ? 'Draft (not submitted)'
                    : 'Not yet submitted'}
              </div>,
              submissionStatus === 'submitted' ? 'var(--success)' : submissionStatus === 'draft' ? 'var(--warning)' : 'var(--danger)'
            ],
            ['Grading Status', 
              <div key="grad-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {gradingStatus === 'graded' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                {gradingStatus === 'graded' ? 'Graded' : 'Not graded'}
              </div>, 
              gradingStatus === 'graded' ? 'var(--success)' : 'var(--text2)'
            ],
            ['Due Date', assignment.duedate ? fmt(assignment.duedate) : 'No deadline', 'var(--text)'],
            ['Time Remaining', timeRemaining, timeColor],
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 160, fontSize: 13, fontWeight: 600, color: 'var(--text2)', flexShrink: 0 }}>{label}</div>
              <div style={{ fontSize: 13, color, flex: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Teacher-attached assignment files */}
        {assignment.introattachments?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assignment Files</div>
            {assignment.introattachments.map((f, i) => {
              const ext = f.filename?.split('.').pop()?.toLowerCase()
              const Icon = ext === 'pdf' ? FileText : ext === 'docx' || ext === 'doc' ? FileText : ext === 'pptx' || ext === 'ppt' ? BarChart3 : ext === 'xlsx' ? FileSpreadsheet : Paperclip
              const iconColor = ext === 'pdf' ? '#ef4444' : ext === 'docx' || ext === 'doc' ? '#3b82f6' : ext === 'pptx' || ext === 'ppt' ? '#f59e0b' : ext === 'xlsx' ? '#10b981' : 'var(--text3)'
              
              const downloadUrl = f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + moodle.token
              const viewerUrl = getViewerUrl(downloadUrl, f.filename)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, border: '1px solid var(--border)' }}>
                  <Icon size={20} style={{ color: iconColor }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {viewerUrl ? (
                      <a href={viewerUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                      >{f.filename}</a>
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
                    )}
                    {f.filesize > 0 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(f.filesize / 1024).toFixed(0)} KB</div>}
                  </div>
                  <a href={downloadUrl} download target="_blank" rel="noreferrer" className="btn-dl">Download</a>
                </div>
              )
            })}
          </div>
        )}

        {/* Previously submitted files */}
        {submittedFiles.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>File Submissions</div>
            {submittedFiles.map((f, i) => {
              const viewUrl = f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + moodle.token
              const viewerUrl = getViewerUrl(viewUrl, f.filename)

              const handleRename = async () => {
                const newName = window.prompt('Enter new filename:', f.filename)
                if (!newName || newName === f.filename) return

                setUploading(true)
                try {
                  toast.loading('Renaming file...', { id: 'rename' })
                  const res = await fetch(viewUrl)
                  const blob = await res.blob()
                  const renamedFile = new File([blob], newName, { type: blob.type })
                  const uploadResult = await moodle.uploadFileToDraft(renamedFile)
                  const itemId = uploadResult[0]?.itemid
                  if (!itemId) throw new Error('Failed to create draft')

                  await moodle.saveSubmission(assignment.id, itemId)
                  await moodle.submitForGrading(assignment.id)
                  await refreshSubmission(assignment.id)

                  toast.success('File renamed!', { id: 'rename' })
                } catch (e) {
                  toast.error('Rename failed: ' + e.message, { id: 'rename' })
                }
                setUploading(false)
              }

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, border: '1px solid var(--border)' }}>
                  <File size={20} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {viewerUrl ? (
                      <a href={viewerUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                      >{f.filename}</a>
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{f.filesize ? (f.filesize / 1024).toFixed(0) + ' KB · ' : ''}{f.timemodified ? fmt(f.timemodified) : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button disabled={uploading} onClick={handleRename} style={{ padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>Rename</button>
                    <button disabled={uploading} onClick={() => fileInputRef.current.click()} style={{ padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>Replace</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Upload section */}
        <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {submittedFiles.length > 0 ? 'Edit Submission' : 'Submit Assignment'}
        </div>

        {/* Dual upload/compress containers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Main Drop Box */}
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : selectedFile ? 'var(--success)' : 'var(--border)'}`,
              borderRadius: 12, padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(99,102,241,0.06)' : selectedFile ? 'rgba(16,185,129,0.06)' : 'var(--surface2)',
              transition: 'all .2s',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 140
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              {selectedFile ? <File size={28} className="text-success" /> : <UploadCloud size={28} style={{ color: 'var(--text3)' }} />}
            </div>
            {selectedFile ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(selectedFile.size / 1024).toFixed(0)} KB · ready</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>Submit Assignment</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Drag & drop or browse (Max 2MB)</div>
              </>
            )}
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* PDF/Word Compressor Box */}
          <div
            onDrop={async (e) => {
              e.preventDefault()
              setCompressDragOver(false)
              if (e.dataTransfer.files[0]) {
                await handleCompressAndSelect(e.dataTransfer.files[0])
              }
            }}
            onDragOver={e => { e.preventDefault(); setCompressDragOver(true) }}
            onDragLeave={() => setCompressDragOver(false)}
            onClick={() => compressorFileInputRef.current.click()}
            style={{
              border: `2px dashed ${compressDragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
              background: compressDragOver ? 'rgba(99,102,241,0.06)' : 'var(--surface2)',
              transition: 'all .2s',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 140
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              {compressing ? <Loader2 size={28} className="spin text-accent" /> : <FileText size={28} style={{ color: 'var(--text3)' }} />}
            </div>
            {compressing ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>Compressing...</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Optimizing file below 2MB</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>PDF/Word Compressor</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Browse/drop here to auto-compress</div>
              </>
            )}
            <input ref={compressorFileInputRef} type="file" accept=".pdf,.docx" style={{ display: 'none' }} onChange={async (e) => {
              if (e.target.files[0]) {
                await handleCompressAndSelect(e.target.files[0])
              }
            }} />
          </div>
        </div>

        {error && (
          <div className="error-msg" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        
        {uploadDone && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success)', color: 'var(--success)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} /> Submission updated on Moodle successfully!
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {selectedFile && (
            <button
              onClick={handleSubmit} disabled={uploading}
              style={{ flex: 1, padding: '12px', background: uploading ? 'var(--border)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {uploading && <Loader2 size={18} className="spin" />}
              {uploading ? 'Uploading...' : submittedFiles.length > 0 ? 'Update Submission' : 'Submit Assignment'}
            </button>
          )}
          {selectedFile && (
            <button onClick={() => { setSelectedFile(null); setError('') }} style={{ padding: '12px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              Clear
            </button>
          )}
          {role === 'student' && submissionStatus !== 'submitted' && !selectedFile && (
            <button
              onClick={() => {
                if (isIgnored) {
                  unignoreAssignment(assignment.id)
                  toast.success('Restored to pending list')
                } else {
                  ignoreAssignment(assignment.id)
                  toast.success('Assignment ignored')
                }
              }}
              style={{
                flex: 1,
                padding: '12px',
                background: isIgnored ? 'rgba(52, 211, 153, 0.1)' : 'var(--surface2)',
                border: isIgnored ? '1px solid var(--success)' : '1px solid var(--border)',
                borderRadius: 10,
                color: isIgnored ? 'var(--success)' : 'var(--text2)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              {isIgnored ? 'Unignore Assignment' : 'Ignore Assignment'}
            </button>
          )}
        </div>

        {/* Description */}
        {assignment.intro && (
          <div style={{ marginTop: 20, padding: 16, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.intro) }} />
          </div>
        )}

        {/* Scroll spacer */}
        <div style={{ height: 24 }} />
      </div>
    </div >
  )
}
