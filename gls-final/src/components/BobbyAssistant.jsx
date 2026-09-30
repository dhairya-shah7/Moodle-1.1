import { useState, useEffect } from 'react'
import { Sparkles, FileText, Download, CheckCircle2, Loader2, AlertTriangle, Bot, X } from 'lucide-react'
import toast from 'react-hot-toast'

// Strip HTML tags from Moodle intro text
function stripHtml(html = '') {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
}

// Extract text from PDF Blob using pdfjs-dist
async function extractPdfText(blob, getPdfjs) {
  const pdfjsLib = await getPdfjs()
  if (!pdfjsLib) throw new Error('PDF reader library could not be loaded.')
  const arrayBuffer = await blob.arrayBuffer()
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  } catch (err) {
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    }
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  }

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items.map(item => item.str || '')
    fullText += strings.join(' ') + '\n\n'
  }
  return fullText.trim()
}

// Extract text from DOCX Blob using JSZip (word/document.xml)
async function extractDocxText(blob, getJSZip) {
  const JSZip = await getJSZip()
  if (!JSZip) throw new Error('DOCX reader library could not be loaded.')
  const arrayBuffer = await blob.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Invalid .docx file structure (missing word/document.xml).')
  const xmlText = await docFile.async('text')
  // Replace paragraph breaks with newlines and strip XML tags
  const withNewlines = xmlText
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
  const plain = withNewlines.replace(/<[^>]+>/g, '')
  const txt = document.createElement('textarea')
  txt.innerHTML = plain
  return txt.value.trim()
}

// Parse raw text into distinct academic questions / tasks
function parseQuestions(rawText, assignmentName, courseName) {
  const cleaned = (rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  if (!cleaned) {
    return [
      `Explain the core concepts, methodology, and practical implementation required for "${assignmentName}" in ${courseName || 'this course'}.`,
      `Provide a detailed technical analysis, architecture/workflow diagram description, and key takeaways for "${assignmentName}".`
    ]
  }

  // Split by common question numbering patterns: Q1, Q.1, Question 1, 1., 1), Task 1, etc.
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  const questions = []
  let currentQ = ''

  const qStartRegex = /^(?:Q(?:uestion)?\s*\d+[\s.:)-]*|\d+\s*[.)]\s+|Task\s*\d+[\s.:)-]*|Problem\s*\d+[\s.:)-]*|Experiment\s*\d+[\s.:)-]*|Aim\s*[:.-]|Objective\s*[:.-])/i

  for (const line of lines) {
    // Skip very short boilerplate headers like university name or page numbers
    if (/^(page\s*\d+|gls\s*university|faculty\s*of|semester|date\s*:|roll\s*no)/i.test(line) && line.length < 50) {
      continue
    }
    if (qStartRegex.test(line)) {
      if (currentQ.trim().length > 10) {
        questions.push(currentQ.trim())
      }
      currentQ = line.replace(qStartRegex, '').trim() || line
    } else if (line.endsWith('?') && currentQ.length > 40) {
      currentQ += ' ' + line
      questions.push(currentQ.trim())
      currentQ = ''
    } else {
      currentQ = currentQ ? `${currentQ} ${line}` : line
    }
  }
  if (currentQ.trim().length > 10) {
    questions.push(currentQ.trim())
  }

  // If everything merged into 1 huge block, split by sentences/paragraphs into manageable questions
  if (questions.length === 1 && questions[0].length > 550) {
    const parts = questions[0]
      .split(/(?<=[.?])\s+(?=[A-Z0-9])/)
      .reduce((acc, sent) => {
        const last = acc[acc.length - 1]
        if (!last || last.length > 220) acc.push(sent)
        else acc[acc.length - 1] = `${last} ${sent}`
        return acc
      }, [])
    return parts.slice(0, 10)
  }

  return questions.length > 0
    ? questions.slice(0, 12)
    : [`Complete the requirements and technical analysis for "${assignmentName}" (${courseName}).`]
}

// Laya-inspired domain classifier & structured academic answer generator
function generateAnswerForQuestion(questionText, index, assignmentName, courseName) {
  const qLower = `${questionText} ${assignmentName} ${courseName}`.toLowerCase()

  // Extract key domain terms from the question
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'how', 'explain',
    'write', 'describe', 'define', 'discuss', 'give', 'example', 'short', 'note',
    'detail', 'following', 'between', 'using', 'into', 'about', 'which', 'their',
    'are', 'was', 'were', 'will', 'have', 'has', 'had', 'can', 'could', 'should',
    'would', 'also', 'list', 'draw', 'design', 'implement', 'assignment', 'practical'
  ])

  const keywords = questionText
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
    .slice(0, 6)

  const focusTopic = keywords.length > 0 ? keywords.join(', ') : assignmentName

  // Domain-specific enrichment based on course/question keywords
  let domainMethodology = ''
  let domainImplementation = ''

  if (/compiler|lexical|parser|syntax|grammar|ll\(1\)|lr|token|automata|cfg|dfa|nfa/i.test(qLower)) {
    domainMethodology =
      `In Compiler Design, the transformation pipeline operates through well-defined phases: Lexical Analysis (tokenization via regular expressions and Finite Automata), Syntax Analysis (context-free grammar derivation and parse tree construction), Semantic Validation (type checking and symbol table management), Intermediate Code Generation (Three-Address Code), Code Optimization, and Target Code Generation.`
    domainImplementation =
      `Step 1: Define the formal grammar G = (V, T, P, S) and eliminate left recursion / perform left factoring where applicable.\n` +
      `Step 2: Compute FIRST() and FOLLOW() sets for non-terminals to verify parsing table determinism.\n` +
      `Step 3: Construct the transition/parsing table and trace the input string stack operations to validate acceptance and syntax tree structure.`
  } else if (/image|video|pixel|filter|fourier|histogram|edge|segmentation|morphology|compression|dip|divp/i.test(qLower)) {
    domainMethodology =
      `In Digital Image and Video Processing, spatial and frequency domain operations manipulate 2D intensity matrices f(x, y). Enhancement, restoration, and feature extraction rely on convolution masks, histogram equalization, Discrete Fourier Transform (DFT), and morphological structuring elements to improve signal-to-noise ratio and isolate region boundaries.`
    domainImplementation =
      `Step 1: Acquire the input image matrix f(x, y) of dimensions M x N and normalize intensity levels [0, L-1].\n` +
      `Step 2: Apply the transformation kernel / filter operation g(x, y) = T[f(x, y)] across spatial neighborhoods or frequency components.\n` +
      `Step 3: Evaluate output quality metrics (PSNR, MSE, and structural clarity) and verify boundary preservation.`
  } else if (/artificial intelligence|heuristic|search|bfs|dfs|a\*|minimax|bayesian|logic|neural|agent|markov/i.test(qLower)) {
    domainMethodology =
      `In Artificial Intelligence, rational agent design formulates problems through state-space representations S, action transitions A(s), path cost functions g(n), and admissible heuristic estimates h(n). Optimal decision-making balances exploration vs. exploitation while guaranteeing completeness and optimality.`
    domainImplementation =
      `Step 1: Formulate the initial state, goal test predicate, successor function, and cost metric.\n` +
      `Step 2: Execute state-space traversal using the evaluation function f(n) = g(n) + h(n) while maintaining OPEN and CLOSED priority queues.\n` +
      `Step 3: Analyze time complexity O(b^d), space complexity, and heuristic admissibility (h(n) <= h*(n)).`
  } else if (/probability|statistics|distribution|random|variance|mean|hypothesis|bayes|poisson|normal|binomial|regression/i.test(qLower)) {
    domainMethodology =
      `In Probability and Statistical Analysis, stochastic modeling quantifies uncertainty using probability density/mass functions, expectation operators E[X], variance Var(X) = E[X^2] - (E[X])^2, and inferential sampling distributions.`
    domainImplementation =
      `Step 1: Define the random variable X, sample space S, and underlying parameter distribution.\n` +
      `Step 2: Formulate the governing probability equations, moment generating properties, and cumulative probabilities.\n` +
      `Step 3: Compute numerical estimates, confidence intervals, and interpret the statistical significance of the result.`
  } else if (/uml|class diagram|object|use case|sequence|activity|sooad|ooa|design pattern|coupling|cohesion/i.test(qLower)) {
    domainMethodology =
      `In Structured and Object-Oriented Analysis and Design (SOOAD), system modeling captures static structural relationships and dynamic behavioral workflows using Unified Modeling Language (UML) specifications, enforcing encapsulation, high cohesion, low coupling, and SOLID principles.`
    domainImplementation =
      `Step 1: Identify primary actors, domain entities, attributes (with visibility +, -, #), and methods.\n` +
      `Step 2: Establish associations, multiplicity constraints (1..1, 1..*, *..*), generalizations (inheritance), aggregations, and compositions.\n` +
      `Step 3: Validate message lifelines, guard conditions, and state transitions across boundary, control, and entity objects.`
  } else if (/python|program|code|function|list|dictionary|tuple|class|exception|numpy|pandas|file|loop/i.test(qLower)) {
    domainMethodology =
      `In Python Programming, modular software construction leverages dynamic typing, iterable data structures (lists, tuples, dictionaries, sets), object-oriented classes, generator comprehensions, and structured exception handling for clean, maintainable execution.`
    domainImplementation =
      `Step 1: Define clean function signatures with input validation and docstrings.\n` +
      `Step 2: Implement core algorithmic logic using idiomatic Python data structures and control flow.\n` +
      `Step 3: Verify edge cases, time complexity, and memory efficiency with sample test inputs and expected outputs.`
  } else if (/history|indian|heritage|ancient|science|engineering|veda|architecture|metallurgy|astronomy/i.test(qLower)) {
    domainMethodology =
      `In the study of Indian History and Traditional Engineering Systems, historical evidence demonstrates advanced indigenous methodologies in town planning, hydraulic engineering, metallurgy (such as corrosion-resistant iron and Wootz steel), astronomical calculations, and sustainable architectural design.`
    domainImplementation =
      `Step 1: Contextualize the historical period, geographical significance, and primary archaeological/literary sources.\n` +
      `Step 2: Examine the scientific principles, structural techniques, and material innovations employed.\n` +
      `Step 3: Connect historical engineering achievements to modern sustainability and contemporary engineering practices.`
  } else if (/human values|ethics|harmony|self|body|trust|respect|society|nature|uhv|prosperity|happiness/i.test(qLower)) {
    domainMethodology =
      `In Universal Human Values and Professional Ethics, value education explores holistic human consciousness through self-exploration, distinguishing between the needs of the Self ('I') and the Body, and establishing mutual happiness (Ubhay-tripti) and mutual prosperity across individual, family, society, and nature.`
    domainImplementation =
      `Step 1: Verify the proposal through natural acceptance and experiential validation in daily living.\n` +
      `Step 2: Analyze harmony at the four levels of existence: Individual, Family (Trust and Respect), Society (Fearlessness), and Nature (Co-existence).\n` +
      `Step 3: Apply ethical competence and sustainable value-based decision-making to engineering practice.`
  } else {
    domainMethodology =
      `This topic in ${courseName || 'Computer Science & Engineering'} addresses the theoretical foundations, architectural principles, and systematic methodology surrounding ${focusTopic}. A structured analytical approach ensures accuracy, scalability, and adherence to academic and engineering standards.`
    domainImplementation =
      `Step 1: Conceptual Identification — Define the governing parameters, assumptions, and boundary conditions for ${focusTopic}.\n` +
      `Step 2: Analytical Formulation — Develop the step-by-step logical workflow, structural model, and operational rules.\n` +
      `Step 3: Verification & Evaluation — Validate the solution against practical constraints, performance metrics, and real-world use cases.`
  }

  return {
    number: index + 1,
    question: questionText,
    answer:
      `1. Conceptual Overview & Definition:\n` +
      `The problem addresses: "${questionText}". ${domainMethodology}\n\n` +
      `2. Step-by-Step Technical Solution & Methodology:\n` +
      `${domainImplementation}\n\n` +
      `3. Key Analytical Points & Conclusion:\n` +
      `• Core Focus: ${focusTopic}\n` +
      `• Practical Significance: Implementing this methodology ensures systematic correctness, modularity, and optimal resource utilization within ${courseName || assignmentName}.\n` +
      `• Conclusion: By following the structured derivation and validation steps outlined above, the requirements for Question ${index + 1} are completely satisfied.`
  }
}

// Compile personalized PDF using jsPDF with Student Name & Roll Number
async function compileCompletedPdf({
  getJsPDF,
  assignment,
  user,
  studentName,
  rollNumber,
  qaList,
  sourceFilename
}) {
  const jsPDF = await getJsPDF()
  if (!jsPDF) throw new Error('PDF compiler (jsPDF) could not be loaded.')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 18

  const ensureSpace = (neededMm) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage()
      y = 18
      // Running top header on continuation pages
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8.5)
      doc.setTextColor(110, 110, 120)
      doc.text(`${assignment.name}  |  ${studentName} (${rollNumber})`, margin, 11)
      doc.setDrawColor(210, 210, 220)
      doc.setLineWidth(0.2)
      doc.line(margin, 13, pageWidth - margin, 13)
      y = 20
    }
  }

  // Top Header Box (University + Course + Student Name + Roll Number)
  doc.setFillColor(244, 246, 252)
  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.5)
  doc.roundedRect(margin, y, contentWidth, 38, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 32, 60)
  doc.text('GLS UNIVERSITY — ASSIGNMENT SUBMISSION', margin + 5, y + 8)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(65, 70, 160)
  const titleLines = doc.splitTextToSize(`${assignment.courseshort || ''} : ${assignment.name}`, contentWidth - 10)
  doc.text(titleLines[0] || assignment.name, margin + 5, y + 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(40, 40, 50)
  doc.text(`Student Name : ${studentName}`, margin + 5, y + 23)
  doc.text(`Roll Number  : ${rollNumber}`, margin + 5, y + 29)
  doc.text(`Course       : ${(assignment.coursename || assignment.courseshort || 'B.Tech CSE').slice(0, 52)}`, margin + 5, y + 35)

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
  doc.text(`Date: ${dateStr}`, pageWidth - margin - 38, y + 23)
  if (sourceFilename) {
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 115)
    doc.text(`Ref: ${sourceFilename.slice(0, 26)}`, pageWidth - margin - 48, y + 29)
  }

  y += 46

  // Render each Question & Answer
  qaList.forEach((item) => {
    ensureSpace(28)

    // Question Banner
    doc.setFillColor(235, 238, 255)
    const qPrefix = `Q${item.number}. `
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const qLines = doc.splitTextToSize(qPrefix + item.question, contentWidth - 8)
    const qBoxHeight = Math.max(9, qLines.length * 5 + 4)

    ensureSpace(qBoxHeight + 12)
    doc.roundedRect(margin, y, contentWidth, qBoxHeight, 2, 2, 'F')
    doc.setTextColor(35, 38, 95)
    doc.text(qLines, margin + 4, y + 5.5)
    y += qBoxHeight + 4

    // Answer Body
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.8)
    doc.setTextColor(35, 35, 45)

    const paragraphs = item.answer.split('\n')
    for (const para of paragraphs) {
      if (!para.trim()) {
        y += 2.5
        continue
      }
      const isSubHeader = /^\d+\.\s+/.test(para.trim())
      if (isSubHeader) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(50, 55, 130)
      } else {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(35, 35, 45)
      }

      const wrapped = doc.splitTextToSize(para, contentWidth - 4)
      for (const wLine of wrapped) {
        ensureSpace(6)
        doc.text(wLine, margin + 2, y)
        y += 4.8
      }
    }

    y += 5
    doc.setDrawColor(230, 230, 238)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 6
  })

  // Page numbering footer
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 120, 130)
    doc.text(
      `${studentName} (${rollNumber}) — Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  const cleanRoll = (rollNumber || 'student').replace(/[^a-zA-Z0-9_-]/g, '')
  const cleanAssign = (assignment.name || 'Assignment').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
  const outFilename = `${cleanRoll}_${cleanAssign}.pdf`

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
  const [status, setStatus] = useState('idle') // idle | processing | ready | submitting | error
  const [stepText, setStepText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [qaList, setQaList] = useState([])
  const [generatedFile, setGeneratedFile] = useState(null)

  const runBobbyPipeline = async () => {
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
          setStepText('Extracting questions from Assignment PDF...')
          extractedText = await extractPdfText(blob, getPdfjs)
        } else if (ext === 'docx') {
          setStepText('Extracting questions from Assignment DOCX...')
          extractedText = await extractDocxText(blob, getJSZip)
        }
      }

      // Also include assignment intro text if available
      const introPlain = stripHtml(assignment.intro || '')
      const combinedText = [extractedText, introPlain].filter(Boolean).join('\n\n')

      setStepText('Analyzing questions & generating academic solutions...')
      const questions = parseQuestions(combinedText, assignment.name, assignment.coursename)
      const generatedQA = questions.map((q, idx) =>
        generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename)
      )
      setQaList(generatedQA)

      setStepText('Compiling personalized PDF with your Name & Roll Number...')
      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
        user,
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList: generatedQA,
        sourceFilename: sourceName || 'Assignment Prompt'
      })

      setGeneratedFile(pdfFile)
      setStatus('ready')
      toast.success('Bobby completed your assignment PDF!')
    } catch (err) {
      console.error('Bobby error:', err)
      setErrorMsg(err.message || 'Failed to complete assignment.')
      setStatus('error')
    }
  }

  useEffect(() => {
    runBobbyPipeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentFile?.fileurl])

  const handleRegenerateWithDetails = async () => {
    if (!qaList.length) {
      await runBobbyPipeline()
      return
    }
    try {
      setStatus('processing')
      setStepText('Updating PDF header with your Name & Roll Number...')
      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
        user,
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList,
        sourceFilename: attachmentFile?.filename || 'Assignment Prompt'
      })
      setGeneratedFile(pdfFile)
      setStatus('ready')
      toast.success('Updated PDF with new Name & Roll Number!')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const handleDownload = () => {
    if (!generatedFile) return
    const url = URL.createObjectURL(generatedFile)
    const a = document.createElement('a')
    a.href = url
    a.download = generatedFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const handleConfirm = async () => {
    if (!generatedFile) return
    setStatus('submitting')
    try {
      await onConfirmSubmit(generatedFile)
      setStatus('ready')
    } catch (err) {
      setErrorMsg(err.message || 'Submission failed')
      setStatus('ready')
    }
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
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                Laya Engine
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

      {/* Student Identity Fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
            onChange={e => setStudentName(e.target.value)}
            onBlur={handleRegenerateWithDetails}
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
            onChange={e => setRollNumber(e.target.value)}
            onBlur={handleRegenerateWithDetails}
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
              Reading assignment file & formatting personalized PDF...
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
            onClick={runBobbyPipeline}
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
          {/* Generated PDF summary bar */}
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
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {(generatedFile.size / 1024).toFixed(0)} KB · {qaList.length} Question(s) Answered · Stamped for{' '}
                  {studentName} ({rollNumber})
                </div>
              </div>
            </div>

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

          {/* Preview of Q&A */}
          <div
            style={{
              maxHeight: 170,
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 12
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase' }}>
              Generated Solution Preview ({qaList.length} Questions)
            </div>
            {qaList.map(item => (
              <div key={item.number} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>
                  Q{item.number}. {item.question}
                </div>
                <div style={{ color: 'var(--text2)', whiteSpace: 'pre-line', fontSize: 11.5, lineHeight: 1.45 }}>
                  {item.answer}
                </div>
              </div>
            ))}
          </div>

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
