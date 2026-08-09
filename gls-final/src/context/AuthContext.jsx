import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

function safeGetItem(key, defaultVal = '') {
  try {
    return localStorage.getItem(key) ?? defaultVal
  } catch (e) {
    return defaultVal
  }
}

function safeSetItem(key, val) {
  try {
    localStorage.setItem(key, val)
  } catch (e) {}
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {}
}

// role: 'student' | 'faculty' | 'admin'
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => safeGetItem('moodle_token', ''))
  const [user, setUser]   = useState(() => {
    const u = safeGetItem('moodle_user', null)
    if (!u) return null
    try { return JSON.parse(u) } catch (e) { return null }
  })
  const [role, setRole] = useState(() => safeGetItem('moodle_role', 'student'))
  // Set of course IDs this faculty member teaches (empty for students/admin)
  const [teachingCourseIds, setTeachingCourseIds] = useState(() => {
    const t = safeGetItem('moodle_teaching_ids', null)
    if (!t) return new Set()
    try { return new Set(JSON.parse(t)) } catch (e) { return new Set() }
  })

  const login = useCallback((tok, userInfo, detectedRole = 'student', teachingIds = []) => {
    setToken(tok)
    setUser(userInfo)
    setRole(detectedRole)
    const idSet = new Set(teachingIds)
    setTeachingCourseIds(idSet)
    safeSetItem('moodle_token', tok)
    safeSetItem('moodle_user', JSON.stringify(userInfo))
    safeSetItem('moodle_role', detectedRole)
    safeSetItem('moodle_teaching_ids', JSON.stringify(teachingIds))
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    setRole('student')
    setTeachingCourseIds(new Set())
    safeRemoveItem('moodle_token')
    safeRemoveItem('moodle_user')
    safeRemoveItem('moodle_role')
    safeRemoveItem('moodle_teaching_ids')
  }, [])

  // Returns true if this faculty member teaches the given courseId
  const canEditCourse = useCallback((courseId) => {
    if (user?.issiteadmin) return true
    if (teachingCourseIds.size > 0) return teachingCourseIds.has(Number(courseId)) || teachingCourseIds.has(String(courseId))
    return false
  }, [user, teachingCourseIds])

  // Verify role against user profile flags to prevent DevTools localStorage tampering
  const verifiedRole = user?.issiteadmin ? 'admin' : (teachingCourseIds.size > 0 && role === 'faculty' ? 'faculty' : (role === 'admin' && !user?.issiteadmin ? 'student' : role))
  const isAdmin = !!(user?.issiteadmin || (verifiedRole === 'admin' && user?.issiteadmin))
  const isFaculty = isAdmin || (verifiedRole === 'faculty' && teachingCourseIds.size > 0)
  const isStudent = !isAdmin && !isFaculty

  return (
    <AuthContext.Provider value={{ 
      token, 
      user, 
      role: verifiedRole, 
      teachingCourseIds, 
      login, 
      logout, 
      isLoggedIn: !!token, 
      canEditCourse,
      isAdmin,
      isFaculty,
      isStudent,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
