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

// Compile personalized PDF using jsPDF with per-student visual theme, Name & Roll Number
async function compileCompletedPdf({
  getJsPDF,
  assignment,
  studentName,
  rollNumber,
  qaList,
  sourceFilename,
  studentSeed,
  customFilename
}) {
  const jsPDF = await getJsPDF()
  if (!jsPDF) throw new Error('PDF compiler (jsPDF) could not be loaded.')

  const theme = PDF_THEMES[studentSeed % PDF_THEMES.length]
  const fontName = theme.font
  const [ar, ag, ab] = theme.accent
  const [hbr, hbg, hbb] = theme.headerBg
  const [qbr, qbg, qbb] = theme.qBg

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 18

  const ensureSpace = (neededMm) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage()
      doc.setFont(fontName, 'italic')
      doc.setFontSize(8.5)
      doc.setTextColor(110, 110, 120)
      doc.text(sanitizeForPdfFont(`${assignment.name}  |  ${studentName} (${rollNumber})`), margin, 11)
      doc.setDrawColor(210, 210, 220)
      doc.setLineWidth(0.2)
      doc.line(margin, 13, pageWidth - margin, 13)
      y = 20
    }
  }

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  if (theme.headerStyle === 'double-line') {
    doc.setFont(fontName, 'bold')
    doc.setFontSize(14)
    doc.setTextColor(ar, ag, ab)
    doc.text(sanitizeForPdfFont((assignment.coursename || 'ACADEMIC SUBMISSION').toUpperCase()), pageWidth / 2, y + 6, { align: 'center' })

    doc.setFontSize(11.5)
    doc.setTextColor(30, 30, 40)
    doc.text(sanitizeForPdfFont(assignment.name), pageWidth / 2, y + 13, { align: 'center' })

    doc.setDrawColor(ar, ag, ab)
    doc.setLineWidth(0.6)
    doc.line(margin, y + 16, pageWidth - margin, y + 16)
    doc.setLineWidth(0.2)
    doc.line(margin, y + 17.5, pageWidth - margin, y + 17.5)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 50)
    doc.text(sanitizeForPdfFont(`Submitted By: ${studentName}`), margin, y + 24)
    doc.text(sanitizeForPdfFont(`Roll No / ID: ${rollNumber}`), margin, y + 30)
    doc.text(sanitizeForPdfFont(`Date: ${dateStr}`), pageWidth - margin, y + 24, { align: 'right' })
    doc.text(sanitizeForPdfFont(`Course Code: ${assignment.courseshort || 'B.Tech'}`), pageWidth - margin, y + 30, { align: 'right' })
    doc.line(margin, y + 34, pageWidth - margin, y + 34)
    y += 42
  } else if (theme.headerStyle === 'left-bar') {
    doc.setFillColor(hbr, hbg, hbb)
    doc.rect(margin, y, contentWidth, 34, 'F')
    doc.setFillColor(ar, ag, ab)
    doc.rect(margin, y, 3.5, 34, 'F')

    doc.setFont(fontName, 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(ar, ag, ab)
    doc.text(sanitizeForPdfFont(assignment.name), margin + 8, y + 8)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(45, 45, 55)
    doc.text(sanitizeForPdfFont(`Name: ${studentName}   |   Roll Number: ${rollNumber}`), margin + 8, y + 16)
    doc.text(sanitizeForPdfFont(`Subject: ${(assignment.coursename || assignment.courseshort || '').slice(0, 55)}`), margin + 8, y + 23)
    doc.text(sanitizeForPdfFont(`Date: ${dateStr}`), margin + 8, y + 30)
    y += 42
  } else {
    doc.setFillColor(hbr, hbg, hbb)
    doc.setDrawColor(ar, ag, ab)
    doc.setLineWidth(0.4)
    doc.roundedRect(margin, y, contentWidth, 36, 2.5, 2.5, 'FD')

    doc.setFont(fontName, 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(ar, ag, ab)
    doc.text(sanitizeForPdfFont(`${assignment.courseshort || 'COURSE'} - ${assignment.name}`), margin + 5, y + 8)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(40, 40, 50)
    doc.text(sanitizeForPdfFont(`Student Name : ${studentName}`), margin + 5, y + 16)
    doc.text(sanitizeForPdfFont(`Roll Number  : ${rollNumber}`), margin + 5, y + 23)
    doc.text(sanitizeForPdfFont(`Course       : ${(assignment.coursename || assignment.courseshort || '').slice(0, 52)}`), margin + 5, y + 30)
    doc.text(sanitizeForPdfFont(`Date: ${dateStr}`), pageWidth - margin - 38, y + 16)
    if (sourceFilename) {
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 115)
      doc.text(sanitizeForPdfFont(`File: ${sourceFilename.slice(0, 26)}`), pageWidth - margin - 48, y + 23)
    }
    y += 44
  }

  // Render each Question & Answer cleanly
  qaList.forEach((item, idx) => {
    ensureSpace(24)

    const qNum = idx + 1
    const qPrefix = sanitizeForPdfFont(theme.qPrefix(qNum))
    doc.setFont(fontName, 'bold')
    doc.setFontSize(10)
    const cleanQ = sanitizeForPdfFont(item.question || '')
    const qLines = doc.splitTextToSize(qPrefix + cleanQ, contentWidth - 8)
    const qBoxHeight = Math.max(8, qLines.length * 4.8 + 3.5)

    ensureSpace(qBoxHeight + 12)
    doc.setFillColor(qbr, qbg, qbb)
    doc.roundedRect(margin, y, contentWidth, qBoxHeight, 1.5, 1.5, 'F')
    doc.setTextColor(ar, ag, ab)
    doc.text(qLines, margin + 4, y + 5)
    y += qBoxHeight + 4

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(35, 35, 45)

    const paragraphs = sanitizeForPdfFont(item.answer || '').split('\n')
    for (const para of paragraphs) {
      if (!para.trim()) {
        y += 2
        continue
      }
      const isBoldLine = /^(?:Step\s*\d+|Part\s*\([a-z0-9]+\)|Final Answer|Sample Output|Performance Comparison|1\.|2\.|3\.)/i.test(para.trim())
      if (isBoldLine) {
        doc.setFont(fontName, 'bold')
        doc.setTextColor(ar, ag, ab)
      } else {
        doc.setFont(fontName, 'normal')
        doc.setTextColor(35, 35, 45)
      }

      const wrapped = doc.splitTextToSize(para, contentWidth - 4)
      for (const wLine of wrapped) {
        ensureSpace(5.5)
        doc.text(wLine, margin + 2, y)
        y += 4.6
      }
    }

    y += 3.5
    doc.setDrawColor(225, 225, 235)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
  })

  // Page numbering footer
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont(fontName, 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 120, 130)
    doc.text(
      sanitizeForPdfFont(`${studentName} (${rollNumber})  |  Page ${p} of ${totalPages}`),
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

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
  const defaultName = user?.fullname || `${user?.firstname || ''} ${user?.lastname || ''}`.trim() || 'Student'
  const defaultRoll = user?.username || 'RollNo'

  const [studentName, setStudentName] = useState(defaultName)
  const [rollNumber, setRollNumber] = useState(defaultRoll)
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

  const getCurrentSeed = (nameVal = studentName, rollVal = rollNumber, varIdx = variationCount) => {
    return computeStudentSeed(`${rollVal.trim().toLowerCase()}|${nameVal.trim().toLowerCase()}|${assignment?.id || 0}|${varIdx}`)
  }

  const runBobbyPipeline = async (customVarIdx = variationCount) => {
    setStatus('processing')
    setErrorMsg('')
    try {
      let extractedText = ''
      let sourceName = ''

      if (attachmentFile) {
        const ext = (attachmentFile.filename || '').split('.').pop().toLowerCase()
        if (ext !== 'pdf' && ext !== 'docx') {
          throw new Error(`Bobby only supports .pdf or .docx assignment files (found .${ext}).`)
        }
        sourceName = attachmentFile.filename
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

      setStepText('Parsing questions & solving with Deterministic Academic Engine...')
      const questions = parseQuestions(combinedText, assignment.name, assignment.coursename)
      setRawQuestions(questions)

      const seed = getCurrentSeed(studentName, rollNumber, customVarIdx)

      // 1. Run Deterministic Academic Solver (OpenCV/Image, Math, Stats, Coding/DSA, UML/SOOAD, DBMS, OS, Networks)
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
          answer: localMatches[idx]
        }))
      } else {
        setStepText(`Resolving remaining questions via Factual Knowledge Engine...`)
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
          console.warn('Server factual resolver error, using browser Wikipedia resolver:', srvErr)
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
              answer: localMatches[idx]
            }
          }
          if (factualMap[idx + 1]) {
            return {
              number: idx + 1,
              question: cleanAiAnswerText(q),
              answer: factualMap[idx + 1]
            }
          }
          return generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename, seed)
        })
      }

      setQaList(generatedQA)
      setHasUnsavedEdits(false)

      setStepText('Compiling personalized PDF with your Name & Roll Number...')
      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList: generatedQA,
        sourceFilename: sourceName || 'Assignment Prompt',
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
      studentName: studentName.trim() || defaultName,
      rollNumber: rollNumber.trim() || defaultRoll,
      qaList: targetQa,
      sourceFilename: attachmentFile?.filename || 'Assignment Prompt',
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
      setStepText('Updating PDF layout & header...')
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
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList: nextQa,
        sourceFilename: attachmentFile?.filename || 'Assignment Prompt',
        studentSeed: seed,
        customFilename: regenerateAnswers ? '' : customFilename
      })
      setGeneratedFile(pdfFile)
      if (regenerateAnswers) {
        setCustomFilename(pdfFile.name)
      }
      setHasUnsavedEdits(false)
      setStatus('ready')
      toast.success(regenerateAnswers ? 'Shuffled PDF visual theme & layout!' : 'Updated PDF header!')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const handleShuffleVariation = () => {
    const nextVar = variationCount + 1
    setVariationCount(nextVar)
    const seed = getCurrentSeed(studentName, rollNumber, nextVar)
    setStatus('processing')
    setStepText('Switching PDF visual theme & layout...')
    compileCompletedPdf({
      getJsPDF,
      assignment,
      studentName: studentName.trim() || defaultName,
      rollNumber: rollNumber.trim() || defaultRoll,
      qaList,
      sourceFilename: attachmentFile?.filename || 'Assignment Prompt',
      studentSeed: seed,
      customFilename: ''
    })
      .then(pdfFile => {
        setGeneratedFile(pdfFile)
        setCustomFilename(pdfFile.name)
        setHasUnsavedEdits(false)
        setStatus('ready')
        toast.success('Switched to a fresh PDF theme & layout!')
      })
      .catch(err => {
        setErrorMsg(err.message)
        setStatus('error')
      })
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

  const activeTheme = PDF_THEMES[getCurrentSeed() % PDF_THEMES.length]

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
              Bobby — AI Assignment Assistant
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 20,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-bd)',
                  fontWeight: 700
                }}
              >
                Theme: {activeTheme.name}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              {attachmentFile
                ? `Source File: ${attachmentFile.filename}`
                : `Source: ${assignment.name} (Assignment Prompt)`}
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

      {/* Student Identity & Filename Fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: 10,
          marginBottom: 14,
          background: 'var(--surface)',
          padding: 12,
          borderRadius: 10,
          border: '1px solid var(--border)'
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>
            Student Name (Stamped on PDF)
          </label>
          <input
            type="text"
            value={studentName}
            onChange={e => {
              setStudentName(e.target.value)
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 12.5,
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>
            Roll Number (Stamped on PDF)
          </label>
          <input
            type="text"
            value={rollNumber}
            onChange={e => {
              setRollNumber(e.target.value)
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 12.5,
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>
            PDF Filename
          </label>
          <input
            type="text"
            value={customFilename}
            onChange={e => {
              setCustomFilename(e.target.value)
              setHasUnsavedEdits(true)
            }}
            onBlur={() => handleRebuildPdf(variationCount, false)}
            placeholder="e.g. a24cse057_Assignment.pdf"
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 12.5,
              boxSizing: 'border-box'
            }}
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
                  {(generatedFile.size / 1024).toFixed(0)} KB · {qaList.length} Question(s) Solved · Stamped for{' '}
                  {studentName} ({rollNumber})
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
                onClick={handleShuffleVariation}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 11px',
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text2)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Generate a fresh visual style variation"
              >
                <RefreshCw size={13} /> Shuffle Style
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
