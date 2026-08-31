// GLS University Departments & Moodle Registry

export const DEPARTMENTS = [
  {
    id: 'btech',
    name: 'B.Tech / Engineering (FoT)',
    shortName: 'B.Tech',
    url: 'https://btech.glsmoodle.in',
    badge: 'B.Tech',
    color: '#3b82f6',
    prefixKeywords: ['a24cse', 'a23cse', 'a22cse', 'a21cse', 'a20cse', 'cse', 'a24ict', 'a23ict', 'a22ict', 'a21ict', 'ict', 'a24aiml', 'a23aiml', 'a22aiml', 'aiml', 'btech', 'fot'],
    description: 'Faculty of Technology / Engineering'
  },
  {
    id: 'bca',
    name: 'BCA / BCA-IT (FCAIT - Bachelors)',
    shortName: 'BCA / BCA-IT',
    url: 'https://www.glsufcait.org/glsmoodle',
    badge: 'BCA',
    color: '#10b981',
    prefixKeywords: ['bca', 'bcait', 'ibca', 'fcait', 'imscit', 'a24bca', 'a23bca', 'a22bca', 'a21bca', 'a24bcait', 'a23bcait', 'a22bcait', 'a24ibca', 'a23ibca'],
    description: 'Faculty of Computer Applications & IT (UG)'
  },
  {
    id: 'mca',
    name: 'MCA / M.Sc(IT) (Masters)',
    shortName: 'MCA',
    url: 'https://mca.glsmoodle.in',
    badge: 'MCA',
    color: '#8b5cf6',
    prefixKeywords: ['mca', 'mscit', 'imca', 'a24mca', 'a23mca', 'a22mca', 'a21mca', 'a24mscit', 'a23mscit', 'a22mscit', 'a24imca', 'a23imca'],
    description: 'Faculty of Computer Applications & IT (PG)'
  }
]

export const DEFAULT_DEPARTMENT = DEPARTMENTS[0]

export function normalizeUrl(url) {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '')
}

export function getDepartmentById(id) {
  if (!id) return DEFAULT_DEPARTMENT
  return DEPARTMENTS.find(d => d.id === id) || DEFAULT_DEPARTMENT
}

export function detectDepartmentFromUsername(username) {
  if (!username || typeof username !== 'string') return null
  const clean = username.trim().toLowerCase()
  
  for (const dept of DEPARTMENTS) {
    if (dept.prefixKeywords.some(kw => clean.startsWith(kw) || clean.includes(kw))) {
      return dept
    }
  }
  return null
}
