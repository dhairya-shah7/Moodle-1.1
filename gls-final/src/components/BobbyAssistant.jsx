import { useState, useEffect, useRef } from 'react'
import { FileText, Download, CheckCircle2, Loader2, AlertTriangle, Bot, X, RefreshCw, Pencil, Plus, Trash2, Save, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import { jsPDF as StaticJsPDF } from 'jspdf'
import StaticJSZip from 'jszip'
import { useMoodle } from '../hooks/useMoodle'
import { useAppData } from '../context/AppDataContext'
import {
  parseQuestions,
  solveMathOrStatsQuestion,
  fetchDynamicAiAnswer,
  fetchWikipediaFactualAnswer,
  synthesizeUniversalAcademicAnswer,
  cleanAcademicText,
  extractSubjectTitleFromPdfText
} from '../utils/bobbySolverEngine'
import { indexCourseMaterials } from '../utils/bobbyVectorIndex'

// Polyfill ReadableStream[Symbol.asyncIterator] & Map.prototype.getOrInsertComputed for iOS Safari / WebKit
if (typeof window !== 'undefined') {
  if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
    ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
      const reader = this.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    }
  }
  if (typeof Map !== 'undefined' && !Map.prototype.getOrInsertComputed) {
    // eslint-disable-next-line no-extend-native
    Map.prototype.getOrInsertComputed = function (key, callbackFn) {
      if (this.has(key)) return this.get(key)
      const val = callbackFn(key)
      this.set(key, val)
      return val
    }
  }
}

const loadLegacyCdnPdfjs = async () => {
  if (typeof window === 'undefined') return null
  if (window.pdfjsLib?.getDocument) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    return window.pdfjsLib
  }
  const urls = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
  ]
  for (let u = 0; u < urls.length; u++) {
    const url = urls[u]
    try {
      await new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) return resolve()
        const s = document.createElement('script')
        s.src = url
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(`Failed to load ${url}`))
        document.head.appendChild(s)
      })
      if (window.pdfjsLib?.getDocument) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        return window.pdfjsLib
      }
    } catch (_) {}
  }
  return null
}

const defaultGetJSZip = async () => {
  if (typeof StaticJSZip === 'function') return StaticJSZip
  if (StaticJSZip?.default && typeof StaticJSZip.default === 'function') return StaticJSZip.default
  if (typeof window !== 'undefined' && typeof window.JSZip === 'function') return window.JSZip
  return null
}

const defaultGetPdfjs = async () => {
  // Always prefer classic UMD pdf.js 3.11.174 with classic .js worker so iOS Safari / WebKit never throws "'text/html' is not a valid JavaScript MIME type" on .mjs module workers
  const cdnLib = await loadLegacyCdnPdfjs()
  if (cdnLib) return cdnLib

  try {
    const mod = await import('pdfjs-dist')
    const pdfjs = mod.default?.getDocument ? mod.default : (mod.getDocument ? mod : (mod.default || mod))
    return pdfjs
  } catch (_) {
    return null
  }
}

const defaultGetJsPDF = async () => {
  if (typeof StaticJsPDF === 'function') return StaticJsPDF
  if (StaticJsPDF?.jsPDF && typeof StaticJsPDF.jsPDF === 'function') return StaticJsPDF.jsPDF
  if (typeof window !== 'undefined') {
    if (typeof window.jspdf?.jsPDF === 'function') return window.jspdf.jsPDF
    if (typeof window.jsPDF === 'function') return window.jsPDF
  }
  return null
}

// Deterministic hash from student Roll Number + Name + variation counter so 100+ students get unique wording & PDF layouts
function computeStudentSeed(str = '') {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function pickVariant(arr, seed, offset = 0) {
  if (!arr || !arr.length) return ''
  const idx = Math.abs(seed + offset * 7919) % arr.length
  return arr[idx]
}

// Strip HTML tags from Moodle intro text
function stripHtml(html = '') {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
}

// Coordinate-aware PDF text + page-image extractor with mobile Safari fallback to CDN pdf.js 3.11.174
async function extractPdfData(blob, getPdfjs) {
  const arrayBuffer = await fileOrBlobToArrayBuffer(blob)

  const parseWithLibrary = async (lib) => {
    const docTask = lib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      disableStream: true,
      disableAutoFetch: true
    })
    const pdf = await docTask.promise
    let fullText = ''
    const pageImages = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = Array.isArray(content?.items) ? content.items : Array.from(content?.items || [])
      let lastY = null
      const pageLines = []
      let currentLine = ''

      for (let k = 0; k < items.length; k++) {
        const item = items[k] || {}
        const str = item.str || ''
        const y = Array.isArray(item.transform) ? item.transform[5] : null
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          if (currentLine.trim()) pageLines.push(currentLine.trim())
          currentLine = str
        } else {
          currentLine += (currentLine && !currentLine.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str
        }
        if (y !== null) lastY = y
        if (item.hasEOL) {
          if (currentLine.trim()) pageLines.push(currentLine.trim())
          currentLine = ''
          lastY = null
        }
      }
      if (currentLine.trim()) pageLines.push(currentLine.trim())
      fullText += pageLines.join('\n') + '\n\n'
    }
    return { text: fullText.trim(), pageImages }
  }

  let pdfjsLib = await getPdfjs()
  if (!pdfjsLib) {
    pdfjsLib = await loadLegacyCdnPdfjs()
  }
  if (!pdfjsLib) throw new Error('PDF reader library could not be loaded.')

  try {
    return await parseWithLibrary(pdfjsLib)
  } catch (firstErr) {
    console.warn('Primary PDF reader failed on this device, switching to mobile-compatible pdf.js 3.11 fallback:', firstErr)
    const legacyLib = await loadLegacyCdnPdfjs()
    if (legacyLib) {
      return await parseWithLibrary(legacyLib)
    }
    throw firstErr
  }
}

async function fileOrBlobToArrayBuffer(blob) {
  if (blob.arrayBuffer) return await blob.arrayBuffer()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

// Extract text from DOCX Blob using JSZip (word/document.xml)
async function extractDocxText(blob, getJSZip) {
  const JSZip = await getJSZip()
  if (!JSZip) throw new Error('DOCX reader library could not be loaded.')
  const arrayBuffer = await fileOrBlobToArrayBuffer(blob)
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Invalid .docx file structure (missing word/document.xml).')
  const xmlText = await docFile.async('text')
  const withNewlines = xmlText
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
  const plain = withNewlines.replace(/<[^>]+>/g, '')
  const txt = document.createElement('textarea')
  txt.innerHTML = plain
  return txt.value.trim()
}

// Mathematical, Coding & University Subject Solver is imported from ../utils/bobbySolverEngine




// Clean HTML entities, PUA bullets, LaTeX math, and markdown formatting from answers and Moodle titles
function cleanAiAnswerText(str = '') {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\uE000-\uF8FF]/g, '- ')
    .replace(/ð·||â€¢|Â·/g, '- ')
    .replace(/[•▪▫●○‣⁃▸▹➢]/g, '- ')
    .replace(/^={2,}\s*(.+?)\s*={2,}$/gm, '$1:')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\pm\b/g, '+-')
    .replace(/\\times\b/g, 'x')
    .replace(/\\cdot\b/g, '*')
    .replace(/\\(?:le|leq)\b/g, '<=')
    .replace(/\\(?:ge|geq)\b/g, '>=')
    .replace(/\\neq\b/g, '!=')
    .replace(/\\approx\b/g, '~=')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,4}\s+/gm, '')
    .trim()
}

// Universal direct answer synthesizer: produces complete solutions without generic meta-summaries or retry messages
function generateAnswerForQuestion(questionText, index, assignmentName, courseName, studentSeed) {
  return {
    number: index + 1,
    question: cleanAiAnswerText(questionText),
    answer: synthesizeUniversalAcademicAnswer(questionText, index, assignmentName, courseName, studentSeed)
  }
}

// 6 distinct PDF visual themes so 100+ students don't submit identical-looking documents
const PDF_THEMES = [
  {
    name: 'Classic Indigo',
    font: 'helvetica',
    accent: [79, 70, 229],
    headerBg: [244, 246, 253],
    qBg: [236, 239, 255],
    qPrefix: n => `Q${n}. `,
    headerStyle: 'boxed'
  },
  {
    name: 'University Serif Navy',
    font: 'times',
    accent: [30, 58, 138],
    headerBg: [248, 250, 252],
    qBg: [241, 245, 249],
    qPrefix: n => `Question ${n}: `,
    headerStyle: 'double-line'
  },
  {
    name: 'Emerald Technical',
    font: 'helvetica',
    accent: [5, 150, 105],
    headerBg: [240, 253, 244],
    qBg: [236, 253, 245],
    qPrefix: n => `${n}) `,
    headerStyle: 'left-bar'
  },
  {
    name: 'Slate Academic Report',
    font: 'times',
    accent: [51, 65, 85],
    headerBg: [248, 249, 250],
    qBg: [243, 244, 246],
    qPrefix: n => `[Problem ${n}] `,
    headerStyle: 'minimal'
  },
  {
    name: 'Crimson Formal',
    font: 'helvetica',
    accent: [153, 27, 27],
    headerBg: [254, 242, 242],
    qBg: [254, 245, 245],
    qPrefix: n => `Q.${n} — `,
    headerStyle: 'boxed'
  },
  {
    name: 'Steel Engineering',
    font: 'helvetica',
    accent: [3, 105, 161],
    headerBg: [240, 249, 255],
    qBg: [224, 242, 254],
    qPrefix: n => `Task ${n}: `,
    headerStyle: 'left-bar'
  }
]

// Sanitize HTML entities, PUA bullets, LaTeX, and Unicode math/punctuation into strict printable ASCII so jsPDF never triggers UCS-2 wide character spacing
function sanitizeForPdfFont(str = '') {
  return cleanAiAnswerText(str)
    .replace(/`/g, '')
    .replace(/[\uE000-\uF8FF]/g, '- ')
    .replace(/ð·||â€¢|Â·/g, '- ')
    .replace(/[•▪▫●○‣⁃▸▹➢]/g, '- ')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/⇒/g, '=>')
    .replace(/→|⟶|➔|➜/g, '->')
    .replace(/←|⟵/g, '<-')
    .replace(/↔|⟷/g, '<->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/≈/g, '~=')
    .replace(/±/g, '+-')
    .replace(/√/g, 'sqrt')
    .replace(/Σ|∑/g, 'Sum')
    .replace(/∏/g, 'Prod')
    .replace(/σ/g, 'sigma')
    .replace(/μ|µ/g, 'mu')
    .replace(/λ/g, 'lambda')
    .replace(/π/g, 'pi')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/γ/g, 'gamma')
    .replace(/θ/g, 'theta')
    .replace(/Δ|∆/g, 'Delta')
    .replace(/∈/g, 'in')
    .replace(/∉/g, 'not in')
    .replace(/∪/g, 'U')
    .replace(/∩/g, 'intersect')
    .replace(/⊆/g, 'subset=')
    .replace(/⊂/g, 'subset')
    .replace(/∅/g, 'empty')
    .replace(/∞/g, 'infinity')
    .replace(/x̄/g, 'Mean(x)')
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/₅/g, '5')
    .replace(/₆/g, '6')
    .replace(/₇/g, '7')
    .replace(/₈/g, '8')
    .replace(/₉/g, '9')
    .replace(/ₙ/g, 'n')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/▷/g, '|>')
    .replace(/◇/g, '<>')
    .replace(/◆/g, '<#>')
    .replace(/[─━═]/g, '-')
    .replace(/[│┃║]/g, '|')
    .replace(/[┌┐└┘├┤┬┴┼╭╮╯╰]/g, '+')
    .replace(/[\u2010-\u2015\u2212–—]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/ {3,}/g, '  ')
}

// Dynamic Question-Specific Resolver for any unseen topic
async function solveWithFactualEncyclopedia(questions, courseName, assignmentName, onProgress, existingMap = {}, localMatches = []) {
  const ansMap = { ...existingMap }

  for (let idx = 0; idx < questions.length; idx++) {
    if (localMatches[idx] || ansMap[idx + 1]) continue
    if (onProgress) {
      onProgress(`Solving Question ${idx + 1} of ${questions.length}...`)
    }
    try {
      const dynamicAnswer = await fetchDynamicAiAnswer(questions[idx], courseName, assignmentName)
      if (dynamicAnswer) {
        ansMap[idx + 1] = cleanAiAnswerText(dynamicAnswer)
      }
    } catch (err) {
      console.warn(`Dynamic resolver Q${idx + 1} error:`, err)
    }
  }

  return ansMap
}

// Normalize answer text so coding answers use clean "Program:" and "Output:" labels without AI-looking boilerplate
function normalizePlainAnswer(raw = '') {
  const cleaned = cleanAiAnswerText(raw)
  const lines = cleaned.split('\n')
  const hasCode =
    /(?:Complete\s+)?Python\s+Implementation|^Program\s*:|^import\s+\w+|def\s+\w+\s*\(|print\s*\(|input\s*\(|cv2\.|#include\s*<|public\s+class\s+\w+|SELECT\s+.+\s+FROM\s+/im.test(
      cleaned
    )

  if (!hasCode) {
    return cleaned
      .replace(/^(?:\d+\.\s*)?(?:Overview\s*&\s*Definition|Key\s*Principles|Technical\s*Summary)\s*:\s*/gim, '')
      .trim()
  }

  const out = []
  let skipAnalysisParagraph = false
  let addedProgramHeader = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()

    if (/^(?:1\.\s*)?Problem\s+Analysis\s*&\s*Approach\s*:?$/i.test(t)) {
      skipAnalysisParagraph = true
      continue
    }
    if (skipAnalysisParagraph) {
      if (
        !t ||
        /^(?:2\.\s*)?(?:Complete\s+)?Python\s+Implementation\s*:?$/i.test(t) ||
        /^Program\s*:?$/i.test(t)
      ) {
        skipAnalysisParagraph = false
      } else {
        continue
      }
    }

    if (/^(?:\d+\.\s*)?(?:Complete\s+)?Python\s+Implementation\s*:?$/i.test(t) || /^Program\s*:?$/i.test(t)) {
      if (!addedProgramHeader) {
        out.push('Program:')
        addedProgramHeader = true
      }
      continue
    }

    if (/^(?:\d+\.\s*)?Sample\s+Output(?:\s*\([^)]*\))?\s*:?$/i.test(t) || /^Output\s*:?$/i.test(t)) {
      out.push('Output:')
      continue
    }

    // Strip top-level "# Program to ..." comment line if it's the very first line of code
    if (out.length <= 1 && /^#\s*Program\s+to\b/i.test(t)) {
      if (!addedProgramHeader) {
        out.unshift('Program:')
        addedProgramHeader = true
      }
      continue
    }

    out.push(line)
  }

  if (!addedProgramHeader && out.length > 0 && !/^Program\s*:/i.test(out[0].trim())) {
    out.unshift('Program:')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Compile plain-text Word-style PDF with bold student details, bold questions, and normal black answers (no timestamps, boxes, or footers)
async function compileCompletedPdf({
  getJsPDF,
  assignment,
  studentName,
  enrollmentNo,
  semester,
  division,
  rollNumber,
  subjectName,
  qaList,
  studentSeed,
  customFilename
}) {
  const jsPDF = await getJsPDF()
  if (!jsPDF) throw new Error('PDF compiler (jsPDF) could not be loaded.')

  const fontName = 'helvetica'
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 25.4 // Standard 1-inch Word margin
  const contentWidth = pageWidth - margin * 2
  let y = 26

  const ensureSpace = (neededMm) => {
    if (y + neededMm > pageHeight - 24) {
      doc.addPage()
      y = 26
    }
  }

  // Page 1 Top: Bold Student Details Block (matching reference photo format, no timestamps)
  doc.setFont(fontName, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)

  const cleanHeaderStudentName = String(studentName || '')
    .replace(/^(?:\d{8,18}|[A-Za-z]\d{2}[A-Za-z0-9]+)\s+/i, '')
    .trim() || studentName

  const headerLines = [
    cleanHeaderStudentName ? `NAME: ${cleanHeaderStudentName}` : '',
    enrollmentNo ? `ENROLLMENT NO: ${enrollmentNo}` : '',
    semester ? `SEM: ${semester}` : '',
    division ? `DIV: ${division}` : '',
    rollNumber ? `ROLL NO: ${rollNumber}` : '',
    subjectName ? `SUBJECT: ${subjectName}` : ''
  ].filter(Boolean)

  for (let hIdx = 0; hIdx < headerLines.length; hIdx++) {
    const hRow = headerLines[hIdx]
    const wrappedHeader = [].concat(doc.splitTextToSize(sanitizeForPdfFont(hRow), contentWidth) || [])
    for (let wIdx = 0; wIdx < wrappedHeader.length; wIdx++) {
      ensureSpace(6)
      doc.text(String(wrappedHeader[wIdx]), margin, y)
      y += 5.2
    }
    y += 4.3 // Blank line spacing between student detail rows
  }

  y += 4

  // Render each Question (Bold) & Answer (Normal) in plain black text
  qaList.forEach((item, idx) => {
    ensureSpace(16)

    const qNum = idx + 1
    const rawQ = sanitizeForPdfFont(item.question || '').replace(/^(?:Q(?:uestion)?\s*\d+\s*[:.)\-–—]\s*|\d+\s*[:.)\-]\s*)/i, '').trim()
    const qFull = `${qNum}.  ${rawQ}`

    doc.setFont(fontName, 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)

    const qParagraphs = qFull.split('\n')
    for (let qpIdx = 0; qpIdx < qParagraphs.length; qpIdx++) {
      const qPara = qParagraphs[qpIdx]
      if (!qPara.trim()) {
        y += 3
        continue
      }
      const wrappedQ = [].concat(doc.splitTextToSize(qPara, contentWidth) || [])
      for (let qlIdx = 0; qlIdx < wrappedQ.length; qlIdx++) {
        ensureSpace(6)
        doc.text(String(wrappedQ[qlIdx]), margin, y)
        y += 5.4
      }
    }

    y += 3.5

    const normalizedAns = normalizePlainAnswer(item.answer || '')
    const paragraphs = sanitizeForPdfFont(normalizedAns).split('\n')

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx]
      if (!para.trim()) {
        y += 3.5
        continue
      }

      const trimmed = para.trim()
      const isSectionLabel = /^(?:Program|Output|OUTPUT)\s*:$/i.test(trimmed)

      if (isSectionLabel) {
        y += 1.5
        ensureSpace(7)
        doc.setFont(fontName, 'bold')
        doc.setFontSize(11)
        doc.setTextColor(0, 0, 0)
        doc.text(trimmed, margin, y)
        y += 6.5
        continue
      }

      doc.setFont(fontName, 'normal')
      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)

      const leadingSpaces = (para.match(/^ +/)?.[0]?.length || 0)
      const indentMm = Math.min(leadingSpaces, 24) * 1.8
      const availWidth = Math.max(40, contentWidth - indentMm)
      const wrapped = [].concat(doc.splitTextToSize(trimmed, availWidth) || [])

      for (let wIdx = 0; wIdx < wrapped.length; wIdx++) {
        ensureSpace(6)
        doc.text(String(wrapped[wIdx]), margin + indentMm, y)
        y += 5.4
      }
    }

    y += 6
  })

  let outFilename = ''
  if (customFilename && customFilename.trim()) {
    const trimmed = customFilename.trim().replace(/[^a-zA-Z0-9_.\- ]/g, '_')
    outFilename = trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`
  } else {
    const cleanRoll = (rollNumber || 'student').replace(/[^a-zA-Z0-9_-]/g, '')
    const cleanName = (cleanHeaderStudentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20)
    const cleanAssign = (assignment.name || 'Assignment').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 28)

    const filePatterns = [
      `${cleanRoll}_${cleanAssign}.pdf`,
      `${cleanAssign}_${cleanRoll}.pdf`,
      `${cleanRoll}_${cleanName}_${cleanAssign}.pdf`,
      `${cleanName}_${cleanRoll}_Submission.pdf`
    ]
    outFilename = filePatterns[studentSeed % filePatterns.length]
  }

  const pdfBlob = doc.output('blob')
  return new File([pdfBlob], outFilename, { type: 'application/pdf' })
}

function getSavedDetail(key, fallback = '') {
  try {
    const val = localStorage.getItem(key)
    return val !== null ? val : fallback
  } catch (_) {
    return fallback
  }
}

function setSavedDetail(key, val) {
  try {
    localStorage.setItem(key, val)
  } catch (_) {}
}

export default function BobbyAssistant({
  assignment: propAssignment,
  attachmentFile: propAttachmentFile,
  localFile: propLocalFile,
  user: propUser,
  moodle: propMoodle,
  getPdfjs = defaultGetPdfjs,
  getJSZip = defaultGetJSZip,
  getJsPDF = defaultGetJsPDF,
  onConfirmSubmit,
  onClose,
  embeddedInDrawer = false
}) {
  const ctxMoodle = useMoodle()
  const appData = useAppData() || {}
  const moodle = propMoodle || ctxMoodle
  const user = propUser || appData.user
  const allAssignments = appData.assignments || []
  const refreshSubmission = appData.refreshSubmission

  const [uploadedLocalFile, setUploadedLocalFile] = useState(propLocalFile || null)
  const [activeAttachmentFile, setActiveAttachmentFile] = useState(propAttachmentFile || null)
  const localUploadRef = useRef(null)

  useEffect(() => {
    setUploadedLocalFile(propLocalFile || null)
    setActiveAttachmentFile(propAttachmentFile || null)
  }, [propLocalFile, propAttachmentFile])

  // Determine initial target assignment ID (either from propAssignment.id or matching course assignment)
  const [targetAssignId, setTargetAssignId] = useState(() => {
    if (propAssignment?.id) return String(propAssignment.id)
    const courseIdToMatch = propAssignment?.courseid || propAssignment?.course || propAttachmentFile?.courseid
    if (courseIdToMatch && allAssignments.length > 0) {
      const matched = allAssignments.find(a => String(a.course || a.courseid) === String(courseIdToMatch))
      if (matched) return String(matched.id)
    }
    return allAssignments[0]?.id ? String(allAssignments[0].id) : ''
  })

  useEffect(() => {
    if (propAssignment?.id) {
      setTargetAssignId(String(propAssignment.id))
    } else {
      const courseIdToMatch = propAssignment?.courseid || propAssignment?.course || propAttachmentFile?.courseid
      if (courseIdToMatch && allAssignments.length > 0) {
        const matched = allAssignments.find(a => String(a.course || a.courseid) === String(courseIdToMatch))
        if (matched) setTargetAssignId(String(matched.id))
      }
    }
  }, [propAssignment?.id, propAssignment?.courseid, propAttachmentFile?.courseid, allAssignments])

  const selectedMoodleAssign =
    allAssignments.find(a => String(a.id) === String(targetAssignId)) || propAssignment || {}

  const effectiveAssignment = {
    id: selectedMoodleAssign?.id || propAssignment?.id || 0,
    name:
      propAssignment?.name ||
      uploadedLocalFile?.name?.replace(/\.[^.]+$/, '') ||
      activeAttachmentFile?.filename?.replace(/\.[^.]+$/, '') ||
      selectedMoodleAssign?.name ||
      'Assignment',
    coursename:
      propAssignment?.coursename ||
      activeAttachmentFile?.coursename ||
      selectedMoodleAssign?.coursename ||
      propAssignment?.courseshort ||
      activeAttachmentFile?.courseshort ||
      'Computer Science',
    courseshort:
      propAssignment?.courseshort ||
      activeAttachmentFile?.courseshort ||
      selectedMoodleAssign?.courseshort ||
      '',
    intro: propAssignment?.intro || selectedMoodleAssign?.intro || ''
  }

  const rawUserRoll = (user?.username || 'A24CSE057').trim().toUpperCase()
  const rawFullName = (user?.fullname || `${user?.firstname || ''} ${user?.lastname || ''}`).trim()
  const stripLeadingIdFromName = (nameStr = '') =>
    String(nameStr || '')
      .replace(new RegExp(`^${rawUserRoll}\\s+`, 'i'), '')
      .replace(/^(?:\d{8,18}|[A-Za-z]\d{2}[A-Za-z0-9]+)\s+/i, '')
      .trim()

  const extractedEnrollmentFromName = (rawFullName.match(/^(\d{10,18})\s+/) || [])[1] || ''
  const cleanedDefaultName =
    stripLeadingIdFromName(rawFullName) ||
    stripLeadingIdFromName(user?.lastname || '') ||
    'Student'

  const coursePlusAssign = `${effectiveAssignment.coursename || ''} ${effectiveAssignment.name || ''}`
  const semMatch = coursePlusAssign.match(/\bSem(?:ester)?\s*[-:]?\s*(\d+)\b/i)
  const divMatch =
    coursePlusAssign.match(/\bDiv(?:ision)?\s*[-:]?\s*([A-Z])\b/i) ||
    rawUserRoll.match(/^([A-Z])\d{2}/i)

  const defaultEnrollment =
    user?.idnumber ||
    extractedEnrollmentFromName ||
    (rawUserRoll === 'A24CSE057' ? '202402626010056' : '')
  const defaultSem = semMatch ? semMatch[1] : '5'
  const defaultDiv = divMatch ? divMatch[1].toUpperCase() : 'A'

  const cleanCourseSubjectTitle = (rawCourse = '', rawAssign = '') => {
    const cleanedCourse = cleanAiAnswerText(rawCourse || '')
      .replace(/^(?:(?:FY|SY|TY)?\s*(?:BCA|MCA|BBA|MBA|B\.?TECH|M\.?SC)[A-Z]*\s*[-:]?\s*)?(?:SEM(?:ESTER)?\s*[-:]?\s*\d+\s*[-:]?\s*)/i, '')
      .replace(/\s*-\s*\d{4}\b/g, '')
      .trim()
    if (cleanedCourse && !/^SEM(?:ESTER)?\s*[-:]?\s*\d+$/i.test(cleanedCourse)) {
      return cleanedCourse.toUpperCase()
    }
    const cleanedAssign = cleanAiAnswerText(rawAssign || '')
      .replace(/^(?:SEM(?:ESTER)?\s*[-:]?\s*\d+\s*[-:]?\s*)/i, '')
      .trim()
    return (cleanedAssign || cleanedCourse || 'COMPUTER SCIENCE').toUpperCase()
  }

  const defaultSubject = cleanCourseSubjectTitle(effectiveAssignment.coursename, effectiveAssignment.name)

  const storagePrefix = `bobby_student_${rawUserRoll.toLowerCase()}_`

  const [studentName, setStudentName] = useState(() => {
    const saved = getSavedDetail(`${storagePrefix}name`, cleanedDefaultName)
    return stripLeadingIdFromName(saved) || cleanedDefaultName
  })
  const [enrollmentNo, setEnrollmentNo] = useState(() => getSavedDetail(`${storagePrefix}enrollment`, defaultEnrollment))
  const [semester, setSemester] = useState(() => getSavedDetail(`${storagePrefix}sem`, defaultSem))
  const [division, setDivision] = useState(() => getSavedDetail(`${storagePrefix}div`, defaultDiv))
  const [rollNumber, setRollNumber] = useState(() => getSavedDetail(`${storagePrefix}roll`, rawUserRoll))
  const [subjectName, setSubjectName] = useState(defaultSubject)
  const [customFilename, setCustomFilename] = useState('')
  const [variationCount, setVariationCount] = useState(0)
  const [status, setStatus] = useState('idle') // idle | processing | ready | submitting | error
  const [stepText, setStepText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [rawQuestions, setRawQuestions] = useState([])
  const [qaList, setQaList] = useState([])
  const [generatedFile, setGeneratedFile] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)

  useEffect(() => {
    const nextSubj = cleanCourseSubjectTitle(effectiveAssignment.coursename, effectiveAssignment.name)
    if (nextSubj && nextSubj !== 'SUBJECT') {
      setSubjectName(nextSubj)
    }
  }, [effectiveAssignment.coursename, effectiveAssignment.name])

  const saveStudentFieldsToStorage = (next = {}) => {
    if (next.studentName !== undefined) setSavedDetail(`${storagePrefix}name`, next.studentName)
    if (next.enrollmentNo !== undefined) setSavedDetail(`${storagePrefix}enrollment`, next.enrollmentNo)
    if (next.semester !== undefined) setSavedDetail(`${storagePrefix}sem`, next.semester)
    if (next.division !== undefined) setSavedDetail(`${storagePrefix}div`, next.division)
    if (next.rollNumber !== undefined) setSavedDetail(`${storagePrefix}roll`, next.rollNumber)
  }

  const getCurrentSeed = (nameVal = studentName, rollVal = rollNumber, varIdx = variationCount) => {
    return computeStudentSeed(`${rollVal.trim().toLowerCase()}|${nameVal.trim().toLowerCase()}|${effectiveAssignment?.id || 0}|${varIdx}`)
  }

  const runBobbyPipeline = async (customVarIdx = variationCount, overrideLocalFile = uploadedLocalFile, overrideAttachment = activeAttachmentFile) => {
    setStatus('processing')
    setErrorMsg('')
    try {
      let extractedText = ''

      if (overrideLocalFile) {
        const ext = (overrideLocalFile.name || '').split('.').pop().toLowerCase()
        if (ext !== 'pdf' && ext !== 'docx') {
          throw new Error(`Bobby only supports .pdf or .docx assignment files (found .${ext}).`)
        }
        if (ext === 'pdf') {
          setStepText(`Reading uploaded PDF "${overrideLocalFile.name}"...`)
          const pdfResult = await extractPdfData(overrideLocalFile, getPdfjs)
          extractedText = pdfResult.text
        } else if (ext === 'docx') {
          setStepText(`Extracting questions from "${overrideLocalFile.name}"...`)
          extractedText = await extractDocxText(overrideLocalFile, getJSZip)
        }
      } else if (overrideAttachment) {
        const fileName = overrideAttachment.filename || 'assignment.pdf'
        const ext = fileName.split('.').pop().toLowerCase()
        if (ext !== 'pdf' && ext !== 'docx') {
          throw new Error(`Bobby only supports .pdf or .docx assignment files (found .${ext}).`)
        }
        setStepText(`Fetching "${fileName}" from Moodle...`)
        const rawUrl = overrideAttachment.fileurl || overrideAttachment.url || ''
        const hasToken = /[?&]token=/.test(rawUrl)
        const downloadUrl = hasToken
          ? rawUrl
          : rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'token=' + moodle.token

        const blob = await moodle.fetchFileBlob(downloadUrl)

        if (ext === 'pdf') {
          setStepText('Reading Assignment PDF text, tables & sub-questions...')
          const pdfResult = await extractPdfData(blob, getPdfjs)
          extractedText = pdfResult.text
        } else if (ext === 'docx') {
          setStepText('Extracting questions from Assignment DOCX...')
          extractedText = await extractDocxText(blob, getJSZip)
        }
      }

      const introPlain = stripHtml(effectiveAssignment.intro || '')
      const pdfSubjectTitle = extractSubjectTitleFromPdfText(extractedText)
      const effectiveCourseContext =
        pdfSubjectTitle ||
        cleanCourseSubjectTitle(effectiveAssignment.coursename, effectiveAssignment.name) ||
        effectiveAssignment.coursename ||
        effectiveAssignment.courseshort ||
        ''

      let resolvedSubjectName = subjectName.trim()
      if (
        pdfSubjectTitle &&
        (!resolvedSubjectName || /^(?:sem(?:ester)?\s*[-:]?\s*\d+|lab\s*task\s*[-:]?\s*\d+|assignment\s*[-:]?\s*\d+|practical\s*[-:]?\s*\d+|computer\s*science)$/i.test(resolvedSubjectName))
      ) {
        resolvedSubjectName = pdfSubjectTitle.toUpperCase()
        setSubjectName(resolvedSubjectName)
      }

      if (introPlain && introPlain.length > 60) {
        indexCourseMaterials(effectiveCourseContext, introPlain.split(/\n{2,}/))
      }
      const combinedText = [extractedText, introPlain].filter(Boolean).join('\n\n')

      setStepText('Parsing questions & solving assignment...')
      const questions = parseQuestions(combinedText, effectiveAssignment.name, effectiveCourseContext)
      setRawQuestions(questions)

      const seed = getCurrentSeed(studentName, rollNumber, customVarIdx)

      const localMatches = questions.map((q, idx) =>
        solveMathOrStatsQuestion(
          q,
          idx,
          seed,
          effectiveCourseContext,
          effectiveAssignment.name || ''
        )
      )
      const allSolvedLocally = questions.length > 0 && localMatches.every(Boolean)

      let generatedQA = []

      if (allSolvedLocally) {
        generatedQA = questions.map((q, idx) => ({
          number: idx + 1,
          question: cleanAiAnswerText(q),
          answer: normalizePlainAnswer(localMatches[idx])
        }))
      } else {
        setStepText(`Resolving subject-specific answers...`)
        let factualMap = {}

        // Only query the encyclopedia resolver for questions that were NOT solved deterministically
        const directMap = await solveWithFactualEncyclopedia(
          questions,
          effectiveCourseContext,
          effectiveAssignment.name || '',
          msg => setStepText(msg),
          factualMap,
          localMatches
        )
        Object.entries(directMap).forEach(([k, v]) => {
          const num = Number(k)
          if (v && !factualMap[num]) {
            factualMap[num] = cleanAiAnswerText(v)
          }
        })

        generatedQA = questions.map((q, idx) => {
          if (localMatches[idx]) {
            return {
              number: idx + 1,
              question: cleanAiAnswerText(q),
              answer: normalizePlainAnswer(localMatches[idx])
            }
          }
          if (factualMap[idx + 1]) {
            return {
              number: idx + 1,
              question: cleanAiAnswerText(q),
              answer: normalizePlainAnswer(factualMap[idx + 1])
            }
          }
          const fallbackObj = generateAnswerForQuestion(q, idx, effectiveAssignment.name, effectiveCourseContext, seed)
          return {
            ...fallbackObj,
            answer: normalizePlainAnswer(fallbackObj.answer)
          }
        })
      }

      setQaList(generatedQA)
      setHasUnsavedEdits(false)

      setStepText('Building plain-text PDF with your Student Details...')
      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment: effectiveAssignment,
        studentName: studentName.trim(),
        enrollmentNo: enrollmentNo.trim(),
        semester: semester.trim(),
        division: division.trim(),
        rollNumber: rollNumber.trim(),
        subjectName: resolvedSubjectName || subjectName.trim(),
        qaList: generatedQA,
        studentSeed: seed,
        customFilename
      })

      setGeneratedFile(pdfFile)
      if (!customFilename) {
        setCustomFilename(pdfFile.name)
      }
      setStatus('ready')
      toast.success(`Bobby solved all ${generatedQA.length} questions!`)
    } catch (err) {
      console.error('Bobby error:', err)
      setErrorMsg(err.message || 'Failed to complete assignment.')
      setStatus('error')
    }
  }

  useEffect(() => {
    if (!propAssignment && !uploadedLocalFile && !activeAttachmentFile) {
      return
    }
    runBobbyPipeline(0, uploadedLocalFile, activeAttachmentFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAttachmentFile?.fileurl,
    activeAttachmentFile?.url,
    uploadedLocalFile?.name,
    uploadedLocalFile?.size,
    propAssignment?.id
  ])

  const recompileFromCurrentQa = async (targetQa = qaList, targetFilename = customFilename, varIdx = variationCount) => {
    const seed = getCurrentSeed(studentName, rollNumber, varIdx)
    const pdfFile = await compileCompletedPdf({
      getJsPDF,
      assignment: effectiveAssignment,
      studentName: studentName.trim(),
      enrollmentNo: enrollmentNo.trim(),
      semester: semester.trim(),
      division: division.trim(),
      rollNumber: rollNumber.trim(),
      subjectName: subjectName.trim(),
      qaList: targetQa,
      studentSeed: seed,
      customFilename: targetFilename
    })
    setGeneratedFile(pdfFile)
    setHasUnsavedEdits(false)
    return pdfFile
  }

  const handleApplyEditsToPdf = async () => {
    try {
      setStatus('processing')
      setStepText('Applying your edits & rebuilding PDF...')
      await recompileFromCurrentQa(qaList, customFilename, variationCount)
      setStatus('ready')
      setIsEditing(false)
      toast.success('Your edits have been saved into the PDF!')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const handleRebuildPdf = async (nextVarIdx = variationCount, regenerateAnswers = false) => {
    const questionsToUse = rawQuestions.length
      ? rawQuestions
      : qaList.map(item => item.question)

    if (!questionsToUse.length) {
      await runBobbyPipeline(nextVarIdx)
      return
    }
    try {
      setStatus('processing')
      setStepText('Updating PDF student details...')
      const seed = getCurrentSeed(studentName, rollNumber, nextVarIdx)
      const nextQa = regenerateAnswers
        ? questionsToUse.map((q, idx) =>
            generateAnswerForQuestion(q, idx, effectiveAssignment.name, effectiveAssignment.coursename, seed)
          )
        : qaList

      if (regenerateAnswers) {
        setQaList(nextQa)
      }

      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment: effectiveAssignment,
        studentName: studentName.trim(),
        enrollmentNo: enrollmentNo.trim(),
        semester: semester.trim(),
        division: division.trim(),
        rollNumber: rollNumber.trim(),
        subjectName: subjectName.trim(),
        qaList: nextQa,
        studentSeed: seed,
        customFilename: regenerateAnswers ? '' : customFilename
      })
      setGeneratedFile(pdfFile)
      if (regenerateAnswers) {
        setCustomFilename(pdfFile.name)
      }
      setHasUnsavedEdits(false)
      setStatus('ready')
      toast.success('Updated PDF details!')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const handleQuestionChange = (idx, newQuestion) => {
    setQaList(prev => prev.map((item, i) => (i === idx ? { ...item, question: newQuestion } : item)))
    setHasUnsavedEdits(true)
  }

  const handleAnswerChange = (idx, newAnswer) => {
    setQaList(prev => prev.map((item, i) => (i === idx ? { ...item, answer: newAnswer } : item)))
    setHasUnsavedEdits(true)
  }

  const handleAddQuestion = () => {
    setQaList(prev => [
      ...prev,
      {
        number: prev.length + 1,
        question: `Additional Question / Section ${prev.length + 1}`,
        answer: 'Write your custom answer, code snippet, or notes here...'
      }
    ])
    setHasUnsavedEdits(true)
  }

  const handleDeleteQuestion = (idx) => {
    if (qaList.length <= 1) {
      toast.error('At least 1 question/section is required in the PDF.')
      return
    }
    setQaList(prev =>
      prev
        .filter((_, i) => i !== idx)
        .map((item, i) => ({ ...item, number: i + 1 }))
    )
    setHasUnsavedEdits(true)
  }

  const handleDownload = async () => {
    try {
      let fileToDownload = generatedFile
      if (hasUnsavedEdits) {
        fileToDownload = await recompileFromCurrentQa(qaList, customFilename, variationCount)
        toast.success('Applied your latest edits before downloading!')
      }
      if (!fileToDownload) return
      const url = URL.createObjectURL(fileToDownload)
      const a = document.createElement('a')
      a.href = url
      a.download = fileToDownload.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch (err) {
      toast.error('Failed to compile edited PDF: ' + err.message)
    }
  }

  const handleConfirm = async () => {
    setStatus('submitting')
    try {
      let fileToSubmit = generatedFile
      if (hasUnsavedEdits) {
        fileToSubmit = await recompileFromCurrentQa(qaList, customFilename, variationCount)
      }
      if (!fileToSubmit) return

      if (onConfirmSubmit) {
        await onConfirmSubmit(fileToSubmit)
        setStatus('ready')
        return
      }

      const finalAssignId = Number(targetAssignId || effectiveAssignment?.id || 0)
      if (!finalAssignId) {
        toast.error('Please select a target Moodle Assignment to submit to.')
        setStatus('ready')
        return
      }

      toast.loading('Uploading completed assignment to Moodle...', { id: 'bobby-submit' })
      const uploadResult = await moodle.uploadFileToDraft(fileToSubmit)
      if (!uploadResult) throw new Error('No response from server')
      if (uploadResult.error) throw new Error(uploadResult.error)
      if (!Array.isArray(uploadResult)) throw new Error(JSON.stringify(uploadResult))
      if (uploadResult[0]?.error) throw new Error(uploadResult[0].error)

      const itemId = uploadResult[0].itemid
      if (!itemId) throw new Error('No item ID returned from upload')

      const saveRes = await moodle.saveSubmission(finalAssignId, itemId)
      if (saveRes?.exception || saveRes?.errorcode) throw new Error(saveRes.message || saveRes.errorcode)

      try {
        await moodle.submitForGrading(finalAssignId)
      } catch (submitErr) {
        console.warn('submitForGrading non-fatal warning:', submitErr)
      }

      if (refreshSubmission) {
        await refreshSubmission(finalAssignId)
      }
      toast.success('Bobby submitted your assignment to Moodle!', { id: 'bobby-submit' })
      setStatus('ready')
    } catch (err) {
      setErrorMsg(err.message || 'Submission failed')
      toast.error('Submission failed: ' + (err.message || 'Unknown error'), { id: 'bobby-submit' })
      setStatus('ready')
    }
  }

  const handleLocalFilePicked = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      toast.error('Please upload a .pdf or .docx file.')
      return
    }
    setUploadedLocalFile(file)
    setActiveAttachmentFile(null)
    e.target.value = ''
  }

  const fieldInputStyle = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 12.5,
    boxSizing: 'border-box'
  }

  const fieldLabelStyle = {
    display: 'block',
    fontSize: 10.5,
    fontWeight: 700,
    color: 'var(--text3)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.3px'
  }

  if (!propAssignment && !uploadedLocalFile && !activeAttachmentFile) {
    return (
      <div
        style={{
          padding: '48px 16px',
          textAlign: 'center',
          color: 'var(--text2)',
          fontSize: 14,
          fontWeight: 600
        }}
      >
        Upload from Courses/Assignment
      </div>
    )
  }

  return (
    <div
      style={{
        background: embeddedInDrawer
          ? 'transparent'
          : 'linear-gradient(145deg, rgba(99,102,241,0.10), rgba(16,185,129,0.06))',
        border: embeddedInDrawer ? 'none' : '1px solid var(--accent)',
        borderRadius: embeddedInDrawer ? 0 : 14,
        padding: embeddedInDrawer ? '4px 2px' : '18px',
        marginBottom: embeddedInDrawer ? 0 : 20,
        position: 'relative'
      }}
    >
      {/* Header / Source & Upload Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {!embeddedInDrawer && (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px var(--accent-glow)',
                flexShrink: 0
              }}
            >
              <Bot size={20} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {!embeddedInDrawer && (
              <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                Bobby
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {uploadedLocalFile
                ? `Uploaded File: ${uploadedLocalFile.name}`
                : activeAttachmentFile
                  ? `Source File: ${activeAttachmentFile.filename}`
                  : `Source: ${effectiveAssignment.name}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            ref={localUploadRef}
            type="file"
            accept=".pdf,.docx"
            style={{ display: 'none' }}
            onChange={handleLocalFilePicked}
          />
          <button
            type="button"
            onClick={() => localUploadRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <UploadCloud size={13} /> Upload PDF/DOCX
          </button>
          {onClose && !embeddedInDrawer && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                width: 28,
                height: 28,
                cursor: 'pointer',
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Editable Student Details Block (Matches PDF Top Header Format) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 14,
          background: 'var(--surface)',
          padding: 12,
          borderRadius: 10,
          border: '1px solid var(--border)'
        }}
      >
        <div>
          <label style={fieldLabelStyle}>NAME</label>
          <input
            type="text"
            value={studentName}
            onChange={e => {
              setStudentName(e.target.value)
              saveStudentFieldsToStorage({ studentName: e.target.value })
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="Dhairya Shah"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>ENROLLMENT NO</label>
          <input
            type="text"
            value={enrollmentNo}
            onChange={e => {
              setEnrollmentNo(e.target.value)
              saveStudentFieldsToStorage({ enrollmentNo: e.target.value })
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="202402626010056"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>SEM</label>
          <input
            type="text"
            value={semester}
            onChange={e => {
              setSemester(e.target.value)
              saveStudentFieldsToStorage({ semester: e.target.value })
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="5"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>DIV</label>
          <input
            type="text"
            value={division}
            onChange={e => {
              setDivision(e.target.value)
              saveStudentFieldsToStorage({ division: e.target.value })
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="A"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>ROLL NO</label>
          <input
            type="text"
            value={rollNumber}
            onChange={e => {
              setRollNumber(e.target.value)
              saveStudentFieldsToStorage({ rollNumber: e.target.value })
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="A24CSE057"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>SUBJECT</label>
          <input
            type="text"
            value={subjectName}
            onChange={e => {
              setSubjectName(e.target.value)
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="PPL TASK MODULE(1-15)"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={fieldLabelStyle}>PDF Filename</label>
          <input
            type="text"
            value={customFilename}
            onChange={e => {
              setCustomFilename(e.target.value)
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="e.g. A24CSE057_Assignment.pdf"
            style={fieldInputStyle}
          />
        </div>
      </div>

      {/* Status Views */}
      {status === 'processing' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '18px 14px',
            background: 'var(--surface)',
            borderRadius: 10,
            border: '1px solid var(--border)'
          }}
        >
          <Loader2 size={22} className="spin text-accent" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{stepText}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              Solving questions & formatting PDF for {rollNumber}...
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger-bd)',
            borderRadius: 10,
            color: 'var(--danger)',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => runBobbyPipeline(variationCount)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--danger)',
              background: 'transparent',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600
            }}
          >
            Retry
          </button>
        </div>
      )}

      {(status === 'ready' || status === 'submitting') && generatedFile && (
        <div>
          {/* Generated PDF summary & Action Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              padding: '10px 14px',
              background: 'var(--surface)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              marginBottom: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {generatedFile.name}
                  {hasUnsavedEdits && (
                    <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--warning)', fontWeight: 600 }}>
                      ● Unsaved edits
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {(generatedFile.size / 1024).toFixed(0)} KB · {qaList.length} Question(s) Solved · {studentName} ({rollNumber})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsEditing(prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 11px',
                  borderRadius: 8,
                  background: isEditing ? 'var(--accent)' : 'var(--surface2)',
                  border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}`,
                  color: isEditing ? '#fff' : 'var(--text)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Pencil size={13} /> {isEditing ? 'Viewing Editor' : 'Edit File Content'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
          </div>

          {/* Live Editor vs Read-Only Preview */}
          {isEditing ? (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--accent)',
                borderRadius: 10,
                padding: '12px',
                marginBottom: 12
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  flexWrap: 'wrap',
                  gap: 8
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)' }}>
                  ✏️ Edit Questions & Answers Before Submitting
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--surface2)',
                      color: 'var(--text)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Add Question
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyEditsToPdf}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 12px',
                      borderRadius: 7,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Save size={13} /> Save Edits to PDF
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                {qaList.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--accent)' }}>
                        Question {idx + 1}
                      </span>
                      {qaList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(idx)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 7px',
                            borderRadius: 6,
                            border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.08)',
                            color: '#ef4444',
                            fontSize: 10.5,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.question}
                      onChange={e => handleQuestionChange(idx, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontWeight: 600,
                        fontSize: 12,
                        marginBottom: 8,
                        boxSizing: 'border-box'
                      }}
                    />
                    <textarea
                      rows={6}
                      value={item.answer}
                      onChange={e => handleAnswerChange(idx, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 9px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontSize: 12,
                        lineHeight: 1.45,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 12
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>
                  Generated Solution Preview ({qaList.length} Questions)
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  ✏️ Click to Edit
                </button>
              </div>
              {qaList.map((item, idx) => (
                <div key={idx} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>
                    Q{idx + 1}. {item.question}
                  </div>
                  <div style={{ color: 'var(--text2)', whiteSpace: 'pre-line', fontSize: 11.5, lineHeight: 1.45 }}>
                    {item.answer}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Target Assignment Selector (for submitting from Courses/Files or direct upload) */}
          {!onConfirmSubmit && allAssignments.length > 0 && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '9px 12px',
                marginBottom: 10
              }}
            >
              <label style={fieldLabelStyle}>Target Moodle Assignment for Submission</label>
              <select
                value={targetAssignId}
                onChange={e => setTargetAssignId(e.target.value)}
                style={{
                  ...fieldInputStyle,
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Assignment to Submit To --</option>
                {allAssignments.map(a => (
                  <option key={a.id} value={String(a.id)}>
                    {a.courseshort || a.coursename} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Confirmation & Submit Button */}
          <button
            type="button"
            disabled={status === 'submitting'}
            onClick={handleConfirm}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, var(--accent), #10b981)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px var(--accent-glow)',
              opacity: status === 'submitting' ? 0.65 : 1
            }}
          >
            {status === 'submitting' ? (
              <>
                <Loader2 size={16} className="spin" /> Submitting to Moodle...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Confirm & Submit to Moodle
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

