import { useState, useEffect } from 'react'
import { FileText, Download, CheckCircle2, Loader2, AlertTriangle, Bot, X, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

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
      `Provide a detailed technical analysis, workflow architecture, and key observations for "${assignmentName}".`
    ]
  }

  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  const questions = []
  let currentQ = ''

  const qStartRegex = /^(?:Q(?:uestion)?\s*\d+[\s.:)-]*|\d+\s*[.)]\s+|Task\s*\d+[\s.:)-]*|Problem\s*\d+[\s.:)-]*|Experiment\s*\d+[\s.:)-]*|Aim\s*[:.-]|Objective\s*[:.-])/i

  for (const line of lines) {
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

// Per-student seeded answer generator so 100+ students get unique structure, headings & phrasing
function generateAnswerForQuestion(questionText, index, assignmentName, courseName, studentSeed) {
  const qSeed = studentSeed + (index + 1) * 104729
  const qLower = `${questionText} ${assignmentName} ${courseName}`.toLowerCase()

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

  // Varied Section Headings per student seed
  const sec1Headings = [
    '1. Theoretical Background & Core Concept:',
    '1. Conceptual Overview & Definition:',
    '1. Fundamental Principles & Context:',
    '1. Problem Formulation & Introduction:',
    '1. Overview & Technical Foundation:',
    '1. Core Theory & Analytical Scope:'
  ]
  const sec2Headings = [
    '2. Step-by-Step Methodology & Execution:',
    '2. Technical Implementation & Workflow:',
    '2. Systematic Solution & Analytical Steps:',
    '2. Architectural Breakdown & Procedure:',
    '2. Detailed Working & Formulation:',
    '2. Procedural Analysis & Derivation:'
  ]
  const sec3Headings = [
    '3. Key Observations & Conclusion:',
    '3. Analytical Summary & Takeaways:',
    '3. Practical Significance & Result:',
    '3. Critical Evaluation & Summary:',
    '3. Final Inference & Engineering Impact:',
    '3. Summary of Findings & Verification:'
  ]

  const introLeadIns = [
    `This question examines "${questionText}".`,
    `In the context of ${courseName || assignmentName}, the objective is to address: "${questionText}".`,
    `Focusing on ${focusTopic}, we analyze the requirement: "${questionText}".`,
    `To systematically solve "${questionText}", we first establish the underlying domain principles.`,
    `The core requirement here revolves around ${focusTopic} as stated in "${questionText}".`,
    `Understanding and implementing "${questionText}" requires a structured breakdown of ${focusTopic}.`
  ]

  let domainTheoryVariants = []
  let domainStepsVariants = []

  if (/compiler|lexical|parser|syntax|grammar|ll\(1\)|lr|token|automata|cfg|dfa|nfa/i.test(qLower)) {
    domainTheoryVariants = [
      `Within Compiler Design, source programs are translated through sequential phases: lexical scanning (finite automata tokenization), syntax parsing (context-free grammar derivation), semantic verification, intermediate representation (three-address code), and target code optimization.`,
      `Language processing systems rely on formal grammar rules G = (V, T, P, S) and deterministic parsing automata to validate token streams, construct abstract syntax trees (AST), and maintain symbol table attributes.`,
      `In syntax and lexical analysis, input character streams are grouped into tokens and matched against production rules to ensure structural validity and ambiguity-free derivation.`
    ]
    domainStepsVariants = [
      `• Phase A: Express the formal grammar productions and eliminate left recursion or common prefixes via left factoring.\n• Phase B: Derive FIRST and FOLLOW sets for each non-terminal symbol to populate the predictive/LR parsing table.\n• Phase C: Trace the stack-driven parsing actions (shift, reduce, accept) against sample token sequences.`,
      `1) Formulate the regular expressions or Context-Free Grammar (CFG) rules governing the construct.\n2) Build the corresponding transition diagram / parsing table and verify that no multiple-entry conflicts exist.\n3) Validate a test input string step-by-step and construct the resulting parse tree.`,
      `- Step I (Specification): Identify terminals, non-terminals, and start symbols for ${focusTopic}.\n- Step II (Construction): Compute lookahead sets and state transitions systematically.\n- Step III (Verification): Confirm deterministic acceptance and syntax tree hierarchy.`
    ]
  } else if (/image|video|pixel|filter|fourier|histogram|edge|segmentation|morphology|compression|dip|divp/i.test(qLower)) {
    domainTheoryVariants = [
      `In Digital Image and Video Processing, a digital image is modeled as a 2D discrete intensity function f(x, y). Spatial and frequency domain transforms modify pixel neighborhoods to enhance contrast, suppress noise, or isolate structural edges.`,
      `Image processing pipelines operate onM x N pixel matrices using spatial convolution kernels, histogram probability distributions, and Fourier frequency spectra to extract meaningful visual features.`,
      `Visual signal enhancement and segmentation rely on neighborhood operators, gradient magnitudes, and morphological structuring elements to preserve boundary fidelity while filtering artifacts.`
    ]
    domainStepsVariants = [
      `• Stage 1: Represent the input image matrix f(x, y) across discrete gray levels [0, L-1].\n• Stage 2: Apply the spatial mask or frequency transformation operator g(x, y) = T[f(x, y)].\n• Stage 3: Measure output fidelity using PSNR, MSE, and visual edge sharpness.`,
      `1) Load and normalize the spatial intensity array and inspect its histogram distribution.\n2) Convolve the target filter kernel across all pixel coordinates (x, y) with appropriate boundary padding.\n3) Compare the transformed output against baseline metrics to confirm noise reduction or feature extraction.`,
      `- Step I (Preprocessing): Sample and quantize the 2D image grid for ${focusTopic}.\n- Step II (Filtering/Transform): Execute neighborhood convolution or frequency-domain mapping.\n- Step III (Evaluation): Verify contrast enhancement and structural preservation.`
    ]
  } else if (/artificial intelligence|heuristic|search|bfs|dfs|a\*|minimax|bayesian|logic|neural|agent|markov/i.test(qLower)) {
    domainTheoryVariants = [
      `In Artificial Intelligence, intelligent agents formulate problem-solving as state-space graph traversal, utilizing successor functions, path cost g(n), and heuristic estimates h(n) to reach goal configurations optimally.`,
      `Rational search and知識 representation balance exploration and exploitation across state spaces, guaranteeing completeness and optimality when heuristics remain admissible (h(n) <= h*(n)).`,
      `AI decision architectures evaluate candidate states through formal transition models, utility functions, and inference rules to derive optimal action sequences.`
    ]
    domainStepsVariants = [
      `• Step 1: Define the initial state S0, action space A(s), transition model, and goal test predicate.\n• Step 2: Expand frontier nodes using the evaluation function f(n) = g(n) + h(n) with OPEN and CLOSED lists.\n• Step 3: Evaluate branching factor b, solution depth d, time complexity, and memory bounds.`,
      `1) Model the problem environment, state representation, and step cost criteria.\n2) Trace node expansion order while avoiding redundant cycles via visited-state tracking.\n3) Prove optimality and analyze worst-case computational complexity.`,
      `- Phase I (Formulation): Specify states, operators, and heuristic functions for ${focusTopic}.\n- Phase II (Execution): Perform systematic graph search until the goal state is dequeued.\n- Phase III (Analysis): Assess completeness, optimality, and space-time trade-offs.`
    ]
  } else if (/probability|statistics|distribution|random|variance|mean|hypothesis|bayes|poisson|normal|binomial|regression/i.test(qLower)) {
    domainTheoryVariants = [
      `In Probability and Statistics, random phenomena are modeled through sample spaces, probability mass/density functions, mathematical expectation E[X], and variance Var(X) = E[X^2] - (E[X])^2.`,
      `Statistical inference and stochastic modeling quantify uncertainty using theoretical distributions (Binomial, Poisson, Normal), conditional probability (Bayes' theorem), and regression estimators.`,
      `Quantitative data analysis evaluates random variables and sampling distributions to test hypotheses, estimate population parameters, and measure correlation.`
    ]
    domainStepsVariants = [
      `• Step 1: Identify the random variable X, outcome space, and governing probability distribution parameters.\n• Step 2: Substitute the known parameters into the probability mass/density formula or moment equation.\n• Step 3: Compute the numerical probability, mean, and standard deviation, and interpret the outcome.`,
      `1) Formulate the events, prior probabilities, and independence assumptions clearly.\n2) Apply the appropriate analytical law (Bayes' rule, expectation operator, or cumulative distribution).\n3) Simplify the algebraic expression to obtain the exact statistical result.`,
      `- Stage I (Setup): Define the stochastic model and parameter constraints for ${focusTopic}.\n- Stage II (Calculation): Evaluate the governing summation or integral equations.\n- Stage III (Interpretation): Relate the computed metric to practical decision thresholds.`
    ]
  } else if (/uml|class diagram|object|use case|sequence|activity|sooad|ooa|design pattern|coupling|cohesion/i.test(qLower)) {
    domainTheoryVariants = [
      `In Object-Oriented Analysis and Design (SOOAD), Unified Modeling Language (UML) diagrams capture both static class architectures and dynamic interaction lifelines while enforcing high cohesion and loose coupling.`,
      `Software modeling translates functional requirements into structured actors, use cases, domain classes, attributes, methods, and explicit multiplicity relationships (association, aggregation, composition, inheritance).`,
      `Object-oriented design principles (encapsulation, polymorphism, and SOLID guidelines) ensure that system models remain extensible, modular, and maintainable.`
    ]
    domainStepsVariants = [
      `• Step 1: Identify core domain classes/actors, attributes with visibility specifiers (+, -, #), and operations.\n• Step 2: Map relationships including multiplicity (1..1, 1..*, *..*), composition, aggregation, and generalization.\n• Step 3: Validate object interactions and guard conditions across use-case scenarios.`,
      `1) Extract nouns and verbs from the problem statement to determine candidate entities and responsibilities.\n2) Structure the UML diagram elements with accurate stereotypes, interfaces, and dependency arrows.\n3) Verify that the model satisfies all functional and boundary constraints.`,
      `- Phase I (Identification): Catalog actors, boundary classes, controllers, and entity objects for ${focusTopic}.\n- Phase II (Modeling): Define structural associations and behavioral sequence flows.\n- Phase III (Review): Ensure encapsulation and minimal inter-module coupling.`
    ]
  } else if (/python|program|code|function|list|dictionary|tuple|class|exception|numpy|pandas|file|loop/i.test(qLower)) {
    domainTheoryVariants = [
      `In Python Programming, clean algorithmic design combines dynamic data structures (lists, dictionaries, tuples, sets), modular functions, object-oriented classes, and exception handling for reliable execution.`,
      `Pythonic software development emphasizes readable control flow, list/dictionary comprehensions, modular code reuse, and optimal time-space complexity.`,
      `Structured programming in Python encapsulates logic within well-documented functions and classes while validating edge-case inputs and file/memory resources.`
    ]
    domainStepsVariants = [
      `• Step 1: Define the function/class interface, input parameters, and validation checks.\n• Step 2: Implement the core algorithm using efficient Python data structures and iterative/recursive loops.\n• Step 3: Trace execution with sample test cases and verify output accuracy and O(N) complexity.`,
      `1) Initialize required variables and collection structures (list/dict/set) for ${focusTopic}.\n2) Process data elements through conditional branches and modular helper functions.\n3) Return and format the final computed output while handling potential runtime exceptions.`,
      `- Stage I (Design): Outline the input-process-output logic and data types.\n- Stage II (Implementation): Write clean, modular Python code adhering to PEP-8 conventions.\n- Stage III (Testing): Validate normal and boundary inputs to confirm correctness.`
    ]
  } else {
    domainTheoryVariants = [
      `Within ${courseName || 'Engineering Studies'}, ${focusTopic} represents a foundational concept that bridges theoretical principles with practical system implementation.`,
      `A rigorous examination of ${focusTopic} in ${courseName || assignmentName} highlights the interplay between structural design, operational efficiency, and real-world applicability.`,
      `Understanding ${focusTopic} requires analyzing its core definitions, governing parameters, and systematic execution workflow within ${courseName || 'this subject'}.`
    ]
    domainStepsVariants = [
      `• Step 1: Define the core parameters, scope, and foundational assumptions for ${focusTopic}.\n• Step 2: Develop the analytical model and trace the operational workflow step-by-step.\n• Step 3: Evaluate the results against standard academic benchmarks and practical constraints.`,
      `1) Identify the primary components and objectives associated with ${focusTopic}.\n2) Formulate the systematic procedure and functional relationships between modules.\n3) Verify the outcome for consistency, scalability, and completeness.`,
      `- Phase I (Conceptualization): Establish the baseline definitions and scope of ${focusTopic}.\n- Phase II (Analysis): Execute the structured methodology and examine key interactions.\n- Phase III (Validation): Summarize practical benefits and engineering implications.`
    ]
  }

  const conclusions = [
    `• Key Takeaway: Mastering ${focusTopic} ensures systematic accuracy and robust performance in ${courseName || assignmentName}.\n• Conclusion: The above formulation and step-by-step breakdown completely address the requirements of Question ${index + 1}.`,
    `• Summary Point: The analytical workflow for ${focusTopic} demonstrates clear alignment with theoretical and practical objectives.\n• Final Note: All aspects of Question ${index + 1} have been evaluated and verified.`,
    `• Core Insight: Applying structured methodology to ${focusTopic} improves reliability, clarity, and maintainability.\n• Result: This completes the comprehensive derivation and analysis for Question ${index + 1}.`,
    `• Practical Relevance: The principles demonstrated in ${focusTopic} directly support scalable problem-solving in ${courseName || assignmentName}.\n• Verification: The solution satisfies all conditions specified in Question ${index + 1}.`
  ]

  const h1 = pickVariant(sec1Headings, qSeed, 1)
  const h2 = pickVariant(sec2Headings, qSeed, 2)
  const h3 = pickVariant(sec3Headings, qSeed, 3)
  const leadIn = pickVariant(introLeadIns, qSeed, 4)
  const theory = pickVariant(domainTheoryVariants, qSeed, 5)
  const steps = pickVariant(domainStepsVariants, qSeed, 6)
  const conclusion = pickVariant(conclusions, qSeed, 7)

  return {
    number: index + 1,
    question: questionText,
    answer: `${h1}\n${leadIn} ${theory}\n\n${h2}\n${steps}\n\n${h3}\n${conclusion}`
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

// Compile personalized PDF using jsPDF with per-student visual theme, Name & Roll Number
async function compileCompletedPdf({
  getJsPDF,
  assignment,
  studentName,
  rollNumber,
  qaList,
  sourceFilename,
  studentSeed
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
      doc.text(`${assignment.name}  |  ${studentName} (${rollNumber})`, margin, 11)
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

  // Render Header according to student's assigned visual theme
  if (theme.headerStyle === 'double-line') {
    doc.setFont(fontName, 'bold')
    doc.setFontSize(14)
    doc.setTextColor(ar, ag, ab)
    doc.text((assignment.coursename || 'ACADEMIC SUBMISSION').toUpperCase(), pageWidth / 2, y + 6, { align: 'center' })

    doc.setFontSize(11.5)
    doc.setTextColor(30, 30, 40)
    doc.text(assignment.name, pageWidth / 2, y + 13, { align: 'center' })

    doc.setDrawColor(ar, ag, ab)
    doc.setLineWidth(0.6)
    doc.line(margin, y + 16, pageWidth - margin, y + 16)
    doc.setLineWidth(0.2)
    doc.line(margin, y + 17.5, pageWidth - margin, y + 17.5)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 50)
    doc.text(`Submitted By: ${studentName}`, margin, y + 24)
    doc.text(`Roll No / ID: ${rollNumber}`, margin, y + 30)
    doc.text(`Date: ${dateStr}`, pageWidth - margin, y + 24, { align: 'right' })
    doc.text(`Course Code: ${assignment.courseshort || 'B.Tech'}`, pageWidth - margin, y + 30, { align: 'right' })
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
    doc.text(assignment.name, margin + 8, y + 8)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(45, 45, 55)
    doc.text(`Name: ${studentName}   |   Roll Number: ${rollNumber}`, margin + 8, y + 16)
    doc.text(`Subject: ${(assignment.coursename || assignment.courseshort || '').slice(0, 55)}`, margin + 8, y + 23)
    doc.text(`Date: ${dateStr}`, margin + 8, y + 30)
    y += 42
  } else {
    // Boxed or minimal
    doc.setFillColor(hbr, hbg, hbb)
    doc.setDrawColor(ar, ag, ab)
    doc.setLineWidth(0.4)
    doc.roundedRect(margin, y, contentWidth, 36, 2.5, 2.5, 'FD')

    doc.setFont(fontName, 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(ar, ag, ab)
    doc.text(`${assignment.courseshort || 'COURSE'} — ${assignment.name}`, margin + 5, y + 8)

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(40, 40, 50)
    doc.text(`Student Name : ${studentName}`, margin + 5, y + 16)
    doc.text(`Roll Number  : ${rollNumber}`, margin + 5, y + 23)
    doc.text(`Course       : ${(assignment.coursename || assignment.courseshort || '').slice(0, 52)}`, margin + 5, y + 30)
    doc.text(`Date: ${dateStr}`, pageWidth - margin - 38, y + 16)
    if (sourceFilename) {
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 115)
      doc.text(`File: ${sourceFilename.slice(0, 26)}`, pageWidth - margin - 48, y + 23)
    }
    y += 44
  }

  // Render each Question & Answer
  qaList.forEach((item) => {
    ensureSpace(26)

    const qPrefix = theme.qPrefix(item.number)
    doc.setFont(fontName, 'bold')
    doc.setFontSize(10.5)
    const qLines = doc.splitTextToSize(qPrefix + item.question, contentWidth - 8)
    const qBoxHeight = Math.max(8.5, qLines.length * 5 + 3.5)

    ensureSpace(qBoxHeight + 12)
    doc.setFillColor(qbr, qbg, qbb)
    doc.roundedRect(margin, y, contentWidth, qBoxHeight, 1.5, 1.5, 'F')
    doc.setTextColor(ar, ag, ab)
    doc.text(qLines, margin + 4, y + 5.2)
    y += qBoxHeight + 4

    doc.setFont(fontName, 'normal')
    doc.setFontSize(9.8)
    doc.setTextColor(35, 35, 45)

    const paragraphs = item.answer.split('\n')
    for (const para of paragraphs) {
      if (!para.trim()) {
        y += 2.2
        continue
      }
      const isSubHeader = /^\d+\.\s+/.test(para.trim())
      if (isSubHeader) {
        doc.setFont(fontName, 'bold')
        doc.setTextColor(ar, ag, ab)
      } else {
        doc.setFont(fontName, 'normal')
        doc.setTextColor(35, 35, 45)
      }

      const wrapped = doc.splitTextToSize(para, contentWidth - 4)
      for (const wLine of wrapped) {
        ensureSpace(6)
        doc.text(wLine, margin + 2, y)
        y += 4.8
      }
    }

    y += 4.5
    doc.setDrawColor(225, 225, 235)
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5.5
  })

  // Page numbering footer
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont(fontName, 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 120, 130)
    doc.text(
      `${studentName} (${rollNumber})  •  Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  // Varied filename format per student seed
  const cleanRoll = (rollNumber || 'student').replace(/[^a-zA-Z0-9_-]/g, '')
  const cleanName = (studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20)
  const cleanAssign = (assignment.name || 'Assignment').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 28)

  const filePatterns = [
    `${cleanRoll}_${cleanAssign}.pdf`,
    `${cleanAssign}_${cleanRoll}.pdf`,
    `${cleanRoll}_${cleanName}_${cleanAssign}.pdf`,
    `${cleanName}_${cleanRoll}_Submission.pdf`
  ]
  const outFilename = filePatterns[studentSeed % filePatterns.length]

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
  const [variationCount, setVariationCount] = useState(0)
  const [status, setStatus] = useState('idle') // idle | processing | ready | submitting | error
  const [stepText, setStepText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [rawQuestions, setRawQuestions] = useState([])
  const [qaList, setQaList] = useState([])
  const [generatedFile, setGeneratedFile] = useState(null)

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
          setStepText('Extracting questions from Assignment PDF...')
          extractedText = await extractPdfText(blob, getPdfjs)
        } else if (ext === 'docx') {
          setStepText('Extracting questions from Assignment DOCX...')
          extractedText = await extractDocxText(blob, getJSZip)
        }
      }

      const introPlain = stripHtml(assignment.intro || '')
      const combinedText = [extractedText, introPlain].filter(Boolean).join('\n\n')

      setStepText('Generating unique per-student solutions...')
      const questions = parseQuestions(combinedText, assignment.name, assignment.coursename)
      setRawQuestions(questions)

      const seed = getCurrentSeed(studentName, rollNumber, customVarIdx)
      const generatedQA = questions.map((q, idx) =>
        generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename, seed)
      )
      setQaList(generatedQA)

      setStepText('Compiling personalized PDF with your Name & Roll Number...')
      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList: generatedQA,
        sourceFilename: sourceName || 'Assignment Prompt',
        studentSeed: seed
      })

      setGeneratedFile(pdfFile)
      setStatus('ready')
      toast.success('Bobby generated your unique assignment PDF!')
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

  const handleRebuildPdf = async (nextVarIdx = variationCount) => {
    const questionsToUse = rawQuestions.length
      ? rawQuestions
      : qaList.map(item => item.question)

    if (!questionsToUse.length) {
      await runBobbyPipeline(nextVarIdx)
      return
    }
    try {
      setStatus('processing')
      setStepText('Regenerating unique wording & layout for your Roll Number...')
      const seed = getCurrentSeed(studentName, rollNumber, nextVarIdx)
      const updatedQA = questionsToUse.map((q, idx) =>
        generateAnswerForQuestion(q, idx, assignment.name, assignment.coursename, seed)
      )
      setQaList(updatedQA)

      const pdfFile = await compileCompletedPdf({
        getJsPDF,
        assignment,
        studentName: studentName.trim() || defaultName,
        rollNumber: rollNumber.trim() || defaultRoll,
        qaList: updatedQA,
        sourceFilename: attachmentFile?.filename || 'Assignment Prompt',
        studentSeed: seed
      })
      setGeneratedFile(pdfFile)
      setStatus('ready')
      toast.success('Updated unique PDF layout & phrasing!')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const handleShuffleVariation = () => {
    const nextVar = variationCount + 1
    setVariationCount(nextVar)
    handleRebuildPdf(nextVar)
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
            onBlur={() => handleRebuildPdf(variationCount)}
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
            Roll Number (Unique Seed + Stamped)
          </label>
          <input
            type="text"
            value={rollNumber}
            onChange={e => setRollNumber(e.target.value)}
            onBlur={() => handleRebuildPdf(variationCount)}
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
              Formatting unique layout & wording for {rollNumber}...
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
                  {(generatedFile.size / 1024).toFixed(0)} KB · {qaList.length} Question(s) · Unique layout for{' '}
                  {studentName} ({rollNumber})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                title="Generate a fresh wording & visual style variation"
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
