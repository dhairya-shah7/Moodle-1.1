import { useState, useEffect } from 'react'
import { FileText, Download, CheckCircle2, Loader2, AlertTriangle, Bot, X, RefreshCw, Pencil, Plus, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  parseQuestions,
  solveMathOrStatsQuestion,
  fetchDynamicAiAnswer,
  fetchWikipediaFactualAnswer,
  synthesizeUniversalAcademicAnswer,
  cleanAcademicText
} from '../utils/bobbySolverEngine'

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

// Coordinate-aware PDF text + page-image extractor: preserves line breaks AND renders page images for scanned tables/charts
async function extractPdfData(blob, getPdfjs) {
  const pdfjsLib = await getPdfjs()
  if (!pdfjsLib) throw new Error('PDF reader library could not be loaded.')
  if (typeof window !== 'undefined' && !window.pdfjsWorker) {
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs')
      window.pdfjsWorker = workerMod?.WorkerMessageHandler ? workerMod : (workerMod?.default || workerMod)
    } catch (workerErr) {
      console.warn('Could not load pdf.worker.min.mjs:', workerErr)
    }
  }
  const arrayBuffer = await fileOrBlobToArrayBuffer(blob)
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise
  } catch (err) {
    if (typeof window !== 'undefined' && !window.pdfjsWorker) {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs')
      window.pdfjsWorker = workerMod?.WorkerMessageHandler ? workerMod : (workerMod?.default || workerMod)
    }
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise
  }

  let fullText = ''
  const pageImages = []
  const maxVisionPages = Math.min(pdf.numPages, 6)

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let lastY = null
    let pageLines = []
    let currentLine = ''

    for (const item of content.items) {
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

    // Render page to canvas JPEG so scanned tables, charts, matrices & equations can be read by Vision AI
    if (i <= maxVisionPages && typeof document !== 'undefined') {
      try {
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise
          pageImages.push(canvas.toDataURL('image/jpeg', 0.62))
        }
      } catch (_) {
        // Ignore canvas render errors and continue with text
      }
    }
  }
  return { text: fullText.trim(), pageImages }
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




// Clean HTML entities, LaTeX math, and markdown formatting from AI answers and Moodle titles
function cleanAiAnswerText(str = '') {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
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

// Sanitize HTML entities, markdown markers, LaTeX, and Unicode math/punctuation into clean ASCII for standard jsPDF fonts
function sanitizeForPdfFont(str = '') {
  return cleanAiAnswerText(str)
    .replace(/`/g, '')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/⇒/g, '=>')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/≈/g, '~=')
    .replace(/√/g, 'sqrt')
    .replace(/Σ/g, 'Sum')
    .replace(/σ/g, 'sigma')
    .replace(/x̄/g, 'Mean(x)')
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/ₙ/g, 'n')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁵/g, '^5')
    .replace(/•/g, '-')
    .replace(/▷/g, '|>')
    .replace(/◇/g, '<>')
    .replace(/◆/g, '<#>')
    .replace(/─/g, '-')
    .replace(/[\u2010-\u2015\u2212–—]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
}

// Dynamic Question-Specific Resolver (Zero-Key AI + Wikipedia Encyclopedia) for any unseen topic
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
    /(?:Complete\s+)?Python\s+Implementation|^Program\s*:|^import\s+\w+|def\s+\w+\s*\(|print\s*\(|input\s*\(|cv2\.|#include\s*</im.test(
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

    // Strip top-level "# Program to ..." AI comment line if it's the very first line of code
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

  const headerLines = [
    studentName ? `NAME: ${studentName}` : '',
    enrollmentNo ? `ENROLLMENT NO: ${enrollmentNo}` : '',
    semester ? `SEM: ${semester}` : '',
    division ? `DIV: ${division}` : '',
    rollNumber ? `ROLL NO: ${rollNumber}` : '',
    subjectName ? `SUBJECT: ${subjectName}` : ''
  ].filter(Boolean)

  for (const hRow of headerLines) {
    const wrappedHeader = doc.splitTextToSize(sanitizeForPdfFont(hRow), contentWidth)
    for (const hl of wrappedHeader) {
      ensureSpace(6)
      doc.text(hl, margin, y)
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
    for (const qPara of qParagraphs) {
      if (!qPara.trim()) {
        y += 3
        continue
      }
      const wrappedQ = doc.splitTextToSize(qPara, contentWidth)
      for (const qLine of wrappedQ) {
        ensureSpace(6)
        doc.text(qLine, margin, y)
        y += 5.4
      }
    }

    y += 3.5

    const normalizedAns = normalizePlainAnswer(item.answer || '')
    const paragraphs = sanitizeForPdfFont(normalizedAns).split('\n')

    for (const para of paragraphs) {
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
      const wrapped = doc.splitTextToSize(trimmed, availWidth)

      for (const wLine of wrapped) {
        ensureSpace(6)
        doc.text(wLine, margin + indentMm, y)
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
    const cleanName = (studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20)
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
  assignment,
  attachmentFile,
  user,
  moodle,
  getPdfjs,
  getJSZip,
  getJsPDF,
  onConfirmSubmit,
  onClose
}) {
  const rawUserRoll = (user?.username || 'A24CSE057').trim().toUpperCase()
  const rawFullName = (user?.fullname || `${user?.firstname || ''} ${user?.lastname || ''}`).trim()
  // Strip leading roll number from Moodle fullname if present (e.g. "a24cse057 Dhairya Shah" -> "Dhairya Shah")
  const cleanedDefaultName =
    rawFullName.replace(new RegExp(`^${rawUserRoll}\\s+`, 'i'), '').trim() ||
    user?.lastname ||
    rawFullName ||
    'Student'

  const coursePlusAssign = `${assignment?.coursename || ''} ${assignment?.name || ''}`
  const semMatch = coursePlusAssign.match(/\bSem(?:ester)?\s*[-:]?\s*(\d+)\b/i)
  const divMatch =
    coursePlusAssign.match(/\bDiv(?:ision)?\s*[-:]?\s*([A-Z])\b/i) ||
    rawUserRoll.match(/^([A-Z])\d{2}/i)

  const defaultEnrollment =
    user?.idnumber ||
    (rawUserRoll === 'A24CSE057' ? '202402626010056' : '')
  const defaultSem = semMatch ? semMatch[1] : '5'
  const defaultDiv = divMatch ? divMatch[1].toUpperCase() : 'A'
  const defaultSubject = cleanAiAnswerText(assignment?.coursename || assignment?.name || 'SUBJECT').toUpperCase()

  const storagePrefix = `bobby_student_${rawUserRoll.toLowerCase()}_`

  const [studentName, setStudentName] = useState(() => getSavedDetail(`${storagePrefix}name`, cleanedDefaultName))
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

  const saveStudentFieldsToStorage = (next = {}) => {
    if (next.studentName !== undefined) setSavedDetail(`${storagePrefix}name`, next.studentName)
    if (next.enrollmentNo !== undefined) setSavedDetail(`${storagePrefix}enrollment`, next.enrollmentNo)
    if (next.semester !== undefined) setSavedDetail(`${storagePrefix}sem`, next.semester)
    if (next.division !== undefined) setSavedDetail(`${storagePrefix}div`, next.division)
    if (next.rollNumber !== undefined) setSavedDetail(`${storagePrefix}roll`, next.rollNumber)
  }

  const getCurrentSeed = (nameVal = studentName, rollVal = rollNumber, varIdx = variationCount) => {
    return computeStudentSeed(`${rollVal.trim().toLowerCase()}|${nameVal.trim().toLowerCase()}|${assignment?.id || 0}|${varIdx}`)
  }

  const runBobbyPipeline = async (customVarIdx = variationCount) => {
    setStatus('processing')
    setErrorMsg('')
    try {
      let extractedText = ''

      if (attachmentFile) {
        const ext = (attachmentFile.filename || '').split('.').pop().toLowerCase()
        if (ext !== 'pdf' && ext !== 'docx') {
          throw new Error(`Bobby only supports .pdf or .docx assignment files (found .${ext}).`)
        }
        setStepText(`Fetching "${attachmentFile.filename}" from Moodle...`)
        const downloadUrl =
          attachmentFile.fileurl +
          (attachmentFile.fileurl.includes('?') ? '&' : '?') +
          'token=' +
          moodle.token

        const blob = await moodle.fetchFileBlob(downloadUrl)

        if (ext === 'pdf') {
          setStepText('Reading Assignment PDF text, tables & diagrams...')
          const pdfResult = await extractPdfData(blob, getPdfjs)
          extractedText = pdfResult.text
        } else if (ext === 'docx') {
          setStepText('Extracting questions from Assignment DOCX...')
          extractedText = await extractDocxText(blob, getJSZip)
        }
      }

      const introPlain = stripHtml(assignment.intro || '')
      const combinedText = [extractedText, introPlain].filter(Boolean).join('\n\n')

      setStepText('Parsing questions & solving assignment...')
      const questions = parseQuestions(combinedText, assignment.name, assignment.coursename)
      setRawQuestions(questions)

      const seed = getCurrentSeed(studentName, rollNumber, customVarIdx)

      const localMatches = questions.map((q, idx) =>
        solveMathOrStatsQuestion(
          q,
          idx,
          seed,
          assignment.coursename || assignment.courseshort || '',
          assignment.name || ''
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
        setStepText(`Resolving remaining questions...`)
        let factualMap = {}
        try {
          const solveRes = await fetch('/proxy/bobby/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: moodle.token,
              courseName: cleanAiAnswerText(assignment.coursename || assignment.courseshort || ''),
              assignmentName: cleanAiAnswerText(assignment.name || ''),
              extractedText: combinedText,
              questions,
              studentSeed: seed
            })
          })
          if (solveRes.ok) {
            const solveData = await solveRes.json()
            if (solveData?.success && Array.isArray(solveData.questions)) {
              solveData.questions.forEach((item, idx) => {
                if (item?.answer && item.answer.trim()) {
                  factualMap[idx + 1] = cleanAiAnswerText(item.answer)
                }
              })
            }
          }
        } catch (srvErr) {
          console.warn('Server factual resolver error, using browser resolver:', srvErr)
        }

        const missingCount = questions.filter((q, idx) => !localMatches[idx] && !factualMap[idx + 1]).length
        if (missingCount > 0) {
          const directMap = await solveWithFactualEncyclopedia(
            questions,
            assignment.coursename || assignment.courseshort || '',
            assignment.name || '',
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
        }

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
          const fallbackObj = generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename, seed)
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
        assignment,
        studentName: studentName.trim(),
        enrollmentNo: enrollmentNo.trim(),
        semester: semester.trim(),
        division: division.trim(),
        rollNumber: rollNumber.trim(),
        subjectName: subjectName.trim(),
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
    runBobbyPipeline(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentFile?.fileurl])

  const recompileFromCurrentQa = async (targetQa = qaList, targetFilename = customFilename, varIdx = variationCount) => {
    const seed = getCurrentSeed(studentName, rollNumber, varIdx)
    const pdfFile = await compileCompletedPdf({
      getJsPDF,
      assignment,
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
            generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename, seed)
          )
        : qaList

      if (regenerateAnswers) {
        setQaList(nextQa)
      }

      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
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
      await onConfirmSubmit(fileToSubmit)
      setStatus('ready')
    } catch (err) {
      setErrorMsg(err.message || 'Submission failed')
      setStatus('ready')
    }
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

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(99,102,241,0.10), rgba(16,185,129,0.06))',
        border: '1px solid var(--accent)',
        borderRadius: 14,
        padding: '18px',
        marginBottom: 20,
        position: 'relative'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              boxShadow: '0 0 16px var(--accent-glow)'
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Bobby Assistant
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              {attachmentFile
                ? `Source File: ${attachmentFile.filename}`
                : `Source: ${assignment.name}`}
            </div>
          </div>
        </div>
        {onClose && (
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

      {/* Editable Student Details Block (Matches PDF Top Header Format) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
