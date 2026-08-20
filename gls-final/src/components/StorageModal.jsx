import { useState, useEffect, useRef } from 'react'
import { HardDrive, Upload, Trash2, Download, X, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_QUOTA = 1048576 // 1 MB in bytes

function formatBytes(bytes) {
  if (bytes === 0) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

export default function StorageModal({ isOpen, onClose, user }) {
  const [usedBytes, setUsedBytes] = useState(0)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const fetchStorage = async () => {
    if (!user?.username) return
    setLoading(true)
    try {
      const res = await fetch(`/proxy/storage?username=${encodeURIComponent(user.username)}`)
      const data = await res.json()
      if (data.usedBytes !== undefined) {
        setUsedBytes(data.usedBytes)
        setFiles(data.files || [])
      }
    } catch (e) {
      console.error('Failed to load storage status:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStorage()
    }
  }, [isOpen, user?.username])

  if (!isOpen) return null

  const handleUploadFile = async (file) => {
    if (!file || !user?.username) return

    // Pre-checks
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const blockedExts = ['zip', 'rar', '7z', 'tar', 'gz', 'exe', 'bat', 'cmd', 'sh', 'ps1', 'js', 'py', 'php', 'jar', 'html', 'svg']
    if (blockedExts.includes(ext)) {
      toast.error('❌ Security Error: Zip archives, scripts, and executables are blocked.')
      return
    }

    if (usedBytes + file.size > MAX_QUOTA) {
      const avail = Math.max(0, MAX_QUOTA - usedBytes)
      toast.error(`⚠️ Storage Quota Exceeded! Only ${formatBytes(avail)} remaining out of 1 MB.`)
      return
    }

    setUploading(true)
    const toastId = toast.loading('Uploading file to cloud storage...')
    try {
      const formData = new FormData()
      formData.append('username', user.username)
      formData.append('file', file)

      const res = await fetch('/proxy/storage/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to upload file', { id: toastId })
      } else {
        toast.success('✓ File saved to cloud storage!', { id: toastId })
        setUsedBytes(data.usedBytes || 0)
        setFiles(data.files || [])
      }
    } catch (e) {
      toast.error('Upload failed: ' + e.message, { id: toastId })
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteFile = async (fileId, filename) => {
    if (!confirm(`Delete "${filename}" from cloud storage?`)) return
    const toastId = toast.loading('Deleting file...')
    try {
      const res = await fetch(`/proxy/storage/${fileId}?username=${encodeURIComponent(user.username)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        toast.success('✓ File deleted', { id: toastId })
        setUsedBytes(data.usedBytes || 0)
        setFiles(data.files || [])
      } else {
        toast.error(data.error || 'Failed to delete file', { id: toastId })
      }
    } catch (e) {
      toast.error('Delete failed: ' + e.message, { id: toastId })
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0])
    }
  }

  const usedPercent = Math.min(100, Math.round((usedBytes / MAX_QUOTA) * 100))
  const remainingBytes = Math.max(0, MAX_QUOTA - usedBytes)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(6px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        width: '100%',
        maxWidth: 520,
        padding: '28px 24px',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <HardDrive size={20} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                Personal Cloud Storage
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                1 MB total quota per user (Cloud DB Saved)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text2)',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Quota Progress Bar */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span>{formatBytes(usedBytes)} used</span>
            <span style={{ color: usedPercent >= 90 ? '#ef4444' : 'var(--text2)' }}>
              {formatBytes(remainingBytes)} free (1 MB max)
            </span>
          </div>
          <div style={{
            height: 8,
            width: '100%',
            background: 'var(--border)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${usedPercent}%`,
              background: usedPercent >= 90 ? '#ef4444' : usedPercent >= 75 ? '#f59e0b' : '#3b82f6',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Drag & Drop Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 16,
            padding: '24px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragActive ? 'var(--accent-soft)' : 'var(--surface3)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleUploadFile(e.target.files[0])}
          />
          <Upload size={24} color={dragActive ? 'var(--accent)' : 'var(--text2)'} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {uploading ? 'Uploading...' : 'Click or Drag & Drop file here'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            Permitted: PDF, Word, PPT, Excel, Images, TXT (Max 1MB quota)
          </div>
        </div>

        {/* Uploaded Files List */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 140, maxHeight: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 4 }}>
            Stored Files ({files.length})
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: 20 }}>
              Loading stored files...
            </div>
          ) : files.length === 0 ? (
            <div style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 20,
              textAlign: 'center',
              color: 'var(--text2)',
              fontSize: 13
            }}>
              No personal files stored yet. Drop a file above to upload!
            </div>
          ) : (
            files.map(f => (
              <div key={f.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.filename}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {formatBytes(f.filesize)} • {new Date(f.uploadDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <a
                    href={`/proxy/storage/download/${f.id}`}
                    download={f.filename}
                    style={{
                      background: 'var(--surface3)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      width: 30,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text)',
                      transition: 'all 0.15s'
                    }}
                    title="Download File"
                  >
                    <Download size={14} />
                  </a>

                  <button
                    onClick={() => handleDeleteFile(f.id, f.filename)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 8,
                      width: 30,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ef4444',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    title="Delete File"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
