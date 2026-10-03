// ══════════════════════════════════════════════════════════════════════════════
// BOBBY INFORMATION VECTOR & BM25 ACADEMIC RETRIEVAL ENGINE (100% MODEL-FREE)
// Provides TF-IDF / BM25 vector similarity, Porter-style stemming, Subject-Domain
// Subspace Locking across 20+ university disciplines, Moodle course context
// indexing, and OpenAlex scholarly abstract reconstruction.
// ══════════════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
  'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
  'will', 'just', 'should', 'now', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'explain',
  'define', 'describe', 'discuss', 'write', 'short', 'note', 'detail', 'details',
  'give', 'example', 'examples', 'suitable', 'neat', 'diagram', 'following',
  'question', 'questions', 'assignment', 'practical', 'laboratory', 'task',
  'module', 'unit', 'semester', 'course', 'subject', 'differentiate', 'compare',
  'distinguish', 'contrast', 'state', 'elaborate', 'how', 'why', 'list', 'find',
  'calculate', 'compute', 'display', 'print', 'accept', 'generate', 'create',
  'implement', 'perform', 'using', 'given', 'below', 'also', 'its', 'their'
])

// Hard-negative entertainment, biography, pop-culture, and off-topic patterns
const HARD_NEGATIVE_TITLE_OR_CATEGORY_REGEX =
  /\b(?:monty\s+python|elvis\s+presley|amazing\s+race|social\s+network|reddit|ti-84|flowgorithm|esp32|game\s+of\s+life|irish\s+logarithm|sitcom|comedy\s+troupe|television\s+series|tv\s+series|reality\s+television|reality\s+competition|filmography|discography|studio\s+album|soundtrack|feature\s+film|motion\s+picture|british\s+comedy|american\s+singer|rock\s+and\s+roll|football\s+club|cricket\s+team|national\s+team|video\s+game|playstation|xbox|nintendo|fictional\s+character|comic\s+book|manga|anime|municipality|province\s+of|district\s+of|births|deaths|living\s+people|actors|actresses|musicians|singers|politicians|disambiguation)\b/i

/**
 * Lightweight Porter-style academic stemmer that preserves technical tokens
 */
export function stemAcademicToken(word = '') {
  const w = String(word).toLowerCase().trim()
  if (w.length <= 3) return w
  if (/^(?:1nf|2nf|3nf|bcnf|4nf|5nf|sql|nosql|ddl|dml|dcl|tcl|dfa|nfa|cfg|ll1|lr0|slr|lalr|clr|ast|dag|tac|ssa|oop|jvm|jdk|jre|tcp|udp|http|https|dns|arp|icmp|bgp|ospf|rip|nat|osi|aes|des|rsa|sha|md5|cpu|gpu|ram|rom|fifo|lru|lfu|fcfs|sjf|srtf|rr|rgb|cmyk|hsv|yuv|cnn|rnn|lstm|gan|svm|knn|pca|api|rest|json|xml|html|css|dom|jsx|bmi|gst)$/.test(w)) {
    return w
  }
  return w
    .replace(/ization$/, 'ize')
    .replace(/ational$/, 'ate')
    .replace(/fulness$/, 'ful')
    .replace(/ousness$/, 'ous')
    .replace(/iveness$/, 'ive')
    .replace(/ments$/, 'ment')
    .replace(/ings$/, '')
    .replace(/ing$/, '')
    .replace(/ations$/, 'ate')
    .replace(/ation$/, 'ate')
    .replace(/ities$/, 'ity')
    .replace(/ies$/, 'y')
    .replace(/ves$/, 'f')
    .replace(/ed$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '')
}

/**
 * Tokenizes text into normalized, stemmed academic terms
 */
export function tokenizeAcademicText(text = '', keepStopWords = false) {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/f-strings?/g, 'fstring')
    .replace(/n_?4/g, 'n4')
    .replace(/n_?8/g, 'n8')
    .replace(/d_?4/g, 'd4')
    .replace(/d_?8/g, 'd8')
    .replace(/[^a-z0-9_]+/g, ' ')
    .trim()

  if (!cleaned) return []
  const rawTokens = cleaned.split(/\s+/).filter(t => t.length >= 2)
  const filtered = keepStopWords
    ? rawTokens
    : rawTokens.filter(t => !STOP_WORDS.has(t) && !/^\d+$/.test(t))

  return filtered.map(stemAcademicToken)
}

/**
 * Builds a normalized Term Frequency (TF) sparse vector map: { term: weight }
 */
export function buildTermVector(text = '', boostWeight = 1.0) {
  const tokens = tokenizeAcademicText(text)
  const vec = Object.create(null)
  if (tokens.length === 0) return vec

  for (const tok of tokens) {
    vec[tok] = (vec[tok] || 0) + boostWeight
  }
  // Sublinear TF scaling: 1 + ln(tf)
  let normSq = 0
  for (const k of Object.keys(vec)) {
    vec[k] = 1 + Math.log(vec[k])
    normSq += vec[k] * vec[k]
  }
  const norm = Math.sqrt(normSq) || 1
  for (const k of Object.keys(vec)) {
    vec[k] = vec[k] / norm
  }
  return vec
}

/**
 * Computes Cosine Similarity between two sparse vectors
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (const k of Object.keys(vecA)) {
    const a = vecA[k]
    normA += a * a
    if (vecB[k]) {
      dot += a * vecB[k]
    }
  }
  for (const k of Object.keys(vecB)) {
    const b = vecB[k]
    normB += b * b
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Computes Okapi BM25 score of a document against query tokens
 */
export function computeBM25Score(queryTokens = [], docText = '', avgDocLen = 180, k1 = 1.5, b = 0.75) {
  if (!queryTokens.length || !docText) return 0
  const docTokens = tokenizeAcademicText(docText)
  if (!docTokens.length) return 0

  const freqMap = Object.create(null)
  for (const dt of docTokens) {
    freqMap[dt] = (freqMap[dt] || 0) + 1
  }

  const docLen = docTokens.length
  let score = 0
  const uniqueQuery = Array.from(new Set(queryTokens))

  for (const qt of uniqueQuery) {
    const tf = freqMap[qt] || 0
    if (tf === 0) continue
    // Specificity weight based on token length (rarer technical terms carry higher IDF weight)
    const idfProxy = Math.min(3.0, Math.max(1.0, qt.length / 3.5))
    const numerator = tf * (k1 + 1)
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen))
    score += idfProxy * (numerator / denominator)
  }

  return score / Math.max(1, uniqueQuery.length)
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBJECT-DOMAIN VECTOR PROFILES (20+ UNIVERSITY DISCIPLINES)
// ══════════════════════════════════════════════════════════════════════════════

export const SUBJECT_VECTOR_PROFILES = [
  {
    id: 'dip',
    label: 'Digital Image and Video Processing',
    matchRegex: /divpl|image\s+and\s+video|image\s+processing|computer\s+vision|dip\b/i,
    searchTag: 'Digital image processing Computer vision',
    stackExchangeTag: 'image-processing',
    domainKeywords:
      'digital image pixel sampling quantization spatial resolution intensity gray level histogram equalization matching specification neighborhood n4 n8 nd adjacency connectivity euclidean city block chessboard distance interpolation nearest neighbor bilinear bicubic shrinking zooming convolution filtering fourier wavelet compression morphological erosion dilation segmentation edge detection restoration enhancement color rgb hsv'
  },
  {
    id: 'python',
    label: 'Python Programming',
    matchRegex: /\bpython\b/i,
    searchTag: 'Python programming language Computer science',
    stackExchangeTag: 'python',
    domainKeywords:
      'python programming script interpreter variable data type string fstring list tuple dictionary set comprehension function lambda generator decorator iterator module package file exception handling class object inheritance numpy pandas matplotlib'
  },
  {
    id: 'compiler',
    label: 'Compiler Design & Formal Languages',
    matchRegex: /compiler|automata|toc\b|formal\s+language|lexical|syntax\s+analysis/i,
    searchTag: 'Compiler construction Formal language Theory of computation',
    stackExchangeTag: 'compiler-construction',
    domainKeywords:
      'compiler lexical analyzer scanner token regex finite automata dfa nfa context free grammar cfg ambiguity left recursion left factoring first follow top down recursive descent ll1 bottom up shift reduce lr0 slr lalr clr parse tree syntax directed translation three address code quadruples triples peephole optimization code generation register allocation'
  },
  {
    id: 'dsa',
    label: 'Data Structures and Algorithms',
    matchRegex: /data\s+structure|\bdsa\b|algorithm\s+design|daa\b/i,
    searchTag: 'Data structure Algorithm Computer science',
    stackExchangeTag: 'algorithm',
    domainKeywords:
      'data structure algorithm time space complexity asymptotic big oh omega theta array linked list stack queue priority heap binary search tree bst avl red black btree hash table collision graph bfs dfs dijkstra bellman ford floyd warshall prim kruskal sorting quicksort mergesort heapsort dynamic programming greedy backtracking'
  },
  {
    id: 'dbms',
    label: 'Database Management Systems',
    matchRegex: /dbms|database|relational\s+database|\bsql\b|pl\/sql/i,
    searchTag: 'Database management system Relational database SQL',
    stackExchangeTag: 'sql',
    domainKeywords:
      'database dbms relational schema entity relationship er diagram primary foreign candidate super key functional dependency closure armstrong axioms normalization 1nf 2nf 3nf bcnf lossless join dependency preserving sql ddl dml select join group by aggregate transaction acid serializability conflict view two phase locking 2pl deadlock timestamp btree indexing'
  },
  {
    id: 'os',
    label: 'Operating Systems',
    matchRegex: /operating\s+system|\bos\b|linux|unix\s+system/i,
    searchTag: 'Operating system Kernel Process management',
    stackExchangeTag: 'operating-system',
    domainKeywords:
      'operating system kernel process thread pcb context switch cpu scheduling fcfs sjf srtf round robin priority synchronization critical section mutex semaphore monitor deadlock banker algorithm coffman memory management paging tlb segmentation virtual memory page replacement fifo lru optimal thrashing disk scheduling sstf scan cscan inode file system'
  },
  {
    id: 'networks',
    label: 'Computer Networks & Data Communication',
    matchRegex: /computer\s+network|data\s+communication|\bcn\b|networking|tcp\/ip/i,
    searchTag: 'Computer network Telecommunications TCP/IP',
    stackExchangeTag: 'networking',
    domainKeywords:
      'computer network osi tcp ip protocol stack physical data link framing hamming crc sliding window go back selective repeat mac aloha csma cd ca ethernet vlan ip ipv4 ipv6 subnetting cidr nat arp icmp routing rip ospf bgp transport congestion control three way handshake udp dns http dhcp firewall'
  },
  {
    id: 'security',
    label: 'Cyber Security & Cryptography',
    matchRegex: /cyber\s*security|information\s+security|cryptography|network\s+security|ethical\s+hacking/i,
    searchTag: 'Computer security Cryptography Information security',
    stackExchangeTag: 'security',
    domainKeywords:
      'cybersecurity cryptography cia triad confidentiality integrity availability symmetric asymmetric cipher aes des rsa diffie hellman elliptic curve hash sha md5 hmac digital signature pki x509 tls ssl firewall ids ips sql injection xss csrf authentication authorization zero trust'
  },
  {
    id: 'aiml',
    label: 'Artificial Intelligence & Machine Learning',
    matchRegex: /artificial\s+intelligence|machine\s+learning|deep\s+learning|data\s+science|neural\s+network|\bai\b|\bml\b/i,
    searchTag: 'Artificial intelligence Machine learning Pattern recognition',
    stackExchangeTag: 'machine-learning',
    domainKeywords:
      'artificial intelligence machine learning supervised unsupervised reinforcement classification regression linear logistic decision tree random forest svm knn kmeans clustering pca dimensionality reduction bias variance overfitting regularization cross validation confusion matrix precision recall f1 roc neural network backpropagation cnn rnn transformer'
  },
  {
    id: 'oop_java_cpp',
    label: 'Object-Oriented Programming & Software Engineering',
    matchRegex: /object\s+oriented|sooad|\buml\b|\bjava\b|\bc\+\+|\bcsharp\b|software\s+engineering/i,
    searchTag: 'Object-oriented programming Software engineering Unified Modeling Language',
    stackExchangeTag: 'oop',
    domainKeywords:
      'object oriented programming class object encapsulation abstraction inheritance polymorphism overloading overriding interface abstract constructor destructor exception multithreading collection uml use case sequence class activity state diagram sdlc agile scrum waterfall cohesion coupling design pattern singleton factory observer'
  },
  {
    id: 'web_mobile',
    label: 'Web & Mobile Application Development',
    matchRegex: /web\s+tech|web\s+development|\breact\b|node\.?js|\bphp\b|javascript|html|android|flutter|mobile\s+app/i,
    searchTag: 'Web development Mobile application development Software framework',
    stackExchangeTag: 'javascript',
    domainKeywords:
      'web development html5 css3 flexbox grid dom javascript es6 async promise fetch rest api json jwt session cookie react component props state hooks nodejs express middleware php laravel android activity lifecycle intent viewmodel'
  },
  {
    id: 'math_stats',
    label: 'Probability, Statistics & Discrete Mathematics',
    matchRegex: /probability|statistics|discrete\s+math|linear\s+algebra|numerical\s+method|calculus|engineering\s+math/i,
    searchTag: 'Probability and statistics Discrete mathematics Linear algebra',
    stackExchangeTag: 'mathematics',
    domainKeywords:
      'probability statistics mean median mode variance standard deviation skewness kurtosis correlation pearson spearman regression least squares bayes theorem binomial poisson normal distribution hypothesis testing pvalue matrix determinant eigenvalue eigenvector set relation function graph isomorphism logic'
  },
  {
    id: 'management_commerce',
    label: 'Management, Finance, Accounting & Economics',
    matchRegex: /management|marketing|finance|financial|accounting|economics|commerce|business|hr\b|human\s+resource|organizational|entrepreneurship|\bmba\b|\bbba\b|\bb\.?com\b/i,
    searchTag: 'Business administration Financial management Economics Marketing',
    stackExchangeTag: 'economics',
    domainKeywords:
      'management planning organizing staffing directing controlling swot pestel porter five forces marketing mix 4ps segmentation targeting positioning branding financial accounting balance sheet income statement cash flow ratio analysis npv irr capital budgeting microeconomics macroeconomics supply demand elasticity leadership motivation'
  }
]

/**
 * Resolves the Subject Vector Profile for a given courseName and assignmentName
 */
export function resolveSubjectVectorProfile(courseName = '', assignmentName = '') {
  const combined = `${courseName} ${assignmentName}`.trim()
  for (const profile of SUBJECT_VECTOR_PROFILES) {
    if (profile.matchRegex.test(combined)) {
      return profile
    }
  }
  return {
    id: 'general_academic',
    label: combined.replace(/\s*-\s*\d{4}\b/g, '').trim() || 'Computer Science & Academic Studies',
    searchTag: combined.replace(/\b(?:sem|div|assignment|practical|task|\d+)\b/gi, '').trim() || 'Computer science Academic',
    stackExchangeTag: 'computer-science',
    domainKeywords: `${combined} definition architecture principle formula method example analysis application`
  }
}

/**
 * Scores a candidate passage/article using BM25 + Cosine Vector Similarity
 * against both the Question Vector and the Subject-Domain Vector.
 * Returns 0 immediately if the title/category/snippet hits any off-topic / pop-culture filter.
 */
export function scorePassageRelevance({
  questionText = '',
  courseName = '',
  assignmentName = '',
  candidateTitle = '',
  candidateText = '',
  candidateCategories = []
}) {
  const titleStr = String(candidateTitle || '').trim()
  const bodyStr = String(candidateText || '').trim()
  const catStr = Array.isArray(candidateCategories) ? candidateCategories.join(' ') : String(candidateCategories || '')

  if (!titleStr && !bodyStr) return 0

  // 1. Hard-Negative Pop-Culture / Entertainment / Biography / List Gate
  if (/^(?:list\s+of|lists\s+of|glossary\s+of|index\s+of|outline\s+of|timeline\s+of|category:|portal:|template:|wikipedia:)/i.test(titleStr)) {
    return 0
  }
  if (HARD_NEGATIVE_TITLE_OR_CATEGORY_REGEX.test(`${titleStr} ${catStr}`)) {
    return 0
  }
  if (HARD_NEGATIVE_TITLE_OR_CATEGORY_REGEX.test(bodyStr.slice(0, 350))) {
    return 0
  }

  // 2. Build Question Vector + Domain Vector
  const profile = resolveSubjectVectorProfile(courseName, assignmentName)
  const qTokens = tokenizeAcademicText(questionText)
  const domainTokens = tokenizeAcademicText(profile.domainKeywords)

  const queryVec = buildTermVector(`${questionText} ${questionText} ${profile.domainKeywords}`)
  const candidateVec = buildTermVector(`${titleStr} ${titleStr} ${catStr} ${bodyStr}`)

  // 3. Cosine similarity + BM25 lexical overlap
  const cosSim = cosineSimilarity(queryVec, candidateVec)
  const bm25Q = computeBM25Score(qTokens, `${titleStr} ${bodyStr}`)
  const bm25Domain = computeBM25Score(domainTokens.slice(0, 25), `${titleStr} ${catStr} ${bodyStr}`)

  // Require at least some domain or question token overlap
  if (cosSim < 0.04 && bm25Q < 0.08 && bm25Domain < 0.05) {
    return 0
  }

  return Number((cosSim * 0.45 + Math.min(1, bm25Q / 2.5) * 0.40 + Math.min(1, bm25Domain / 2.0) * 0.15).toFixed(4))
}

/**
 * Reconstructs a plain-text academic abstract from OpenAlex's `abstract_inverted_index` object
 */
export function reconstructOpenAlexAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return ''
  const entries = Object.entries(invertedIndex)
  if (entries.length === 0) return ''

  let maxIndex = 0
  for (const [, positions] of entries) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        if (typeof pos === 'number' && pos > maxIndex && pos < 5000) {
          maxIndex = pos
        }
      }
    }
  }
  if (maxIndex === 0) return ''

  const words = new Array(maxIndex + 1).fill('')
  for (const [word, positions] of entries) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        if (typeof pos === 'number' && pos >= 0 && pos <= maxIndex) {
          words[pos] = word
        }
      }
    }
  }

  const reconstructed = words
    .filter(Boolean)
    .join(' ')
    .replace(/^(?:abstract[:.\s-]*)/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip publisher copyright trailers
  return reconstructed
    .replace(/\b(?:copyright|©|\(c\))\s+\d{4}.*$/i, '')
    .trim()
}

// ══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY MOODLE COURSE MATERIAL VECTOR INDEX
// Allows indexing course modules, descriptions, and extracted syllabus notes
// so Bobby prioritizes course-specific definitions and formulas.
// ══════════════════════════════════════════════════════════════════════════════

const courseMaterialChunks = []

export function indexCourseMaterials(courseName = '', chunks = []) {
  if (!Array.isArray(chunks) || chunks.length === 0) return
  const cleanCourse = String(courseName || '').trim()
  for (const rawChunk of chunks) {
    const text = String(rawChunk || '').trim()
    if (text.length < 40) continue
    const tokens = tokenizeAcademicText(text)
    if (tokens.length < 5) continue
    courseMaterialChunks.push({
      courseName: cleanCourse,
      text,
      vector: buildTermVector(text),
      tokens
    })
  }
  // Keep bounded to most recent 250 chunks
  if (courseMaterialChunks.length > 250) {
    courseMaterialChunks.splice(0, courseMaterialChunks.length - 250)
  }
}

export function queryCourseVectorIndex(questionText = '', courseName = '', minScore = 0.22) {
  if (courseMaterialChunks.length === 0) return null
  const qVec = buildTermVector(questionText)
  const qTokens = tokenizeAcademicText(questionText)
  let bestChunk = null
  let bestScore = 0

  for (const item of courseMaterialChunks) {
    if (courseName && item.courseName && item.courseName.toLowerCase() !== courseName.toLowerCase()) {
      continue
    }
    const sim = cosineSimilarity(qVec, item.vector)
    const bm25 = computeBM25Score(qTokens, item.text)
    const combined = sim * 0.6 + Math.min(1, bm25 / 2.5) * 0.4
    if (combined > bestScore) {
      bestScore = combined
      bestChunk = item.text
    }
  }

  return bestScore >= minScore ? bestChunk : null
}
