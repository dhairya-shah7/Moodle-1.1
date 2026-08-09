export const fmt = ts => {
  if (!ts) return 'No deadline'
  const d = new Date(ts * 1000)
  const hours = d.getHours()
  const mins = d.getMinutes()

  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  // If 12:00 AM (00:00 midnight), clarify that 12:00 AM on Aug 10 means Midnight tonight (end of Aug 9)
  if (hours === 0 && mins === 0) {
    const prevDay = new Date(d)
    prevDay.setDate(prevDay.getDate() - 1)
    const prevStr = prevDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return `${dateStr}, 12:00 am (Midnight - Night of ${prevStr})`
  }

  return `${dateStr}, ${timeStr}`
}

export const daysLeft = ts => {
  if (!ts) return Infinity
  const diff = ts * 1000 - Date.now()
  if (diff < 0) {
    return Math.floor(diff / 86400000)
  }
  return Math.floor(diff / 86400000)
}

export const truncate = (str, n) => str && str.length > n ? str.slice(0, n) + '…' : str

export const assignStatus = a => {
  if (!a.duedate) return { cls: 'ok', tag: 'No deadline', tagCls: 'tag-ok', filterKey: 'none' }
  const now = Date.now()
  const dueMs = a.duedate * 1000
  const diff = dueMs - now

  if (diff < 0) return { cls: 'overdue', tag: 'Overdue', tagCls: 'tag-overdue', filterKey: 'overdue' }

  const hoursLeft = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (hoursLeft < 1) {
    return { cls: 'soon', tag: 'Due <1h', tagCls: 'tag-soon', filterKey: 'soon' }
  }
  if (hoursLeft < 24) {
    return { cls: 'soon', tag: `Due ${hoursLeft}h`, tagCls: 'tag-soon', filterKey: 'soon' }
  }
  if (days <= 7) {
    return { cls: 'soon', tag: `${days}d left`, tagCls: 'tag-soon', filterKey: 'soon' }
  }
  return { cls: 'ok', tag: `${days}d left`, tagCls: 'tag-ok', filterKey: 'ok' }
}

export const fileIcon = name => {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['ppt', 'pptx'].includes(ext)) return 'ppt'
  if (['xls', 'xlsx'].includes(ext)) return 'excel'
  if (['zip', 'rar'].includes(ext)) return 'zip'
  if (['mp4', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image'
  return 'file'
}

// Returns a viewer URL for a given file URL.
// - Google Drive links     → open directly
// - PDF / Office docs      → Google Docs Viewer (opens inline)
// - Images, video          → raw URL (browser handles natively)
// - Unknown / zip / binary → null (fall back to download)
export const getViewerUrl = (rawUrl, filename) => {
  if (!rawUrl) return null
  const lower = (filename || rawUrl).toLowerCase()
  const ext = lower.split('.').pop().split('?')[0]

  // Google Drive — open in Drive viewer
  if (rawUrl.includes('drive.google.com') || rawUrl.includes('docs.google.com')) {
    return rawUrl
  }

  // Office docs — route through Google Docs Viewer (as browser doesn't render natively)
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
    return `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(rawUrl)}`
  }

  // PDFs, images, and video — open with browser's native/default viewer
  if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm'].includes(ext)) {
    return rawUrl
  }

  return null // not viewable inline
}

export const forceDownload = async (url, filename) => {
  if (!url) return
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(blobUrl)
  } catch (error) {
    // fallback if fetch/CORS fails
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

export function sanitizeHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<(script|iframe|object|embed|form|base|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|form|base|meta|link)[^>]*\/?>/gi, '')
    .replace(/on\w+\s*=\s*"(?:[^"]*)"/gi, '')
    .replace(/on\w+\s*=\s*'(?:[^']*)'/gi, '')
    .replace(/on\w+\s*=\s*([^>\s]+)/gi, '')
    .replace(/(srcdoc|formaction)\s*=\s*[^>\s]+/gi, '')
    .replace(/javascript\s*:/gi, 'noop:')
}

export function getFormattedDate() {
  const d = new Date()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${day}-${month}-${year}, ${weekdays[d.getDay()]}`
}



