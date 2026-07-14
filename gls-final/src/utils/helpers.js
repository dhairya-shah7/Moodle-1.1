export const fmt = ts => {
  if (!ts) return 'No deadline'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export const daysLeft = ts => {
  if (!ts) return Infinity
  return Math.ceil((ts * 1000 - Date.now()) / 86400000)
}

export const truncate = (str, n) => str && str.length > n ? str.slice(0, n) + '…' : str

export const assignStatus = a => {
  const d = daysLeft(a.duedate)
  if (!a.duedate) return { cls: 'ok', tag: 'No deadline', tagCls: 'tag-ok', filterKey: 'none' }
  if (d < 0) return { cls: 'overdue', tag: 'Overdue', tagCls: 'tag-overdue', filterKey: 'overdue' }
  if (d <= 7) return { cls: 'soon', tag: `${d}d left`, tagCls: 'tag-soon', filterKey: 'soon' }
  return { cls: 'ok', tag: `${d}d left`, tagCls: 'tag-ok', filterKey: 'ok' }
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
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"(?:[^"]*)"/gi, '')
    .replace(/on\w+\s*=\s*'(?:[^']*)'/gi, '')
    .replace(/on\w+\s*=\s*([^>\s]+)/gi, '')
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



