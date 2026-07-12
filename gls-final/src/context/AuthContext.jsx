import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

// role: 'student' | 'faculty' | 'admin'
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('moodle_token') || '')
  const [user, setUser]   = useState(() => {
    const u = localStorage.getItem('moodle_user')
    return u ? JSON.parse(u) : null
  })
  const [role, setRole] = useState(() => localStorage.getItem('moodle_role') || 'student')
  // Set of course IDs this faculty member teaches (empty for students/admin)
  const [teachingCourseIds, setTeachingCourseIds] = useState(() => {
    const t = localStorage.getItem('moodle_teaching_ids')
    return t ? new Set(JSON.parse(t)) : new Set()
  })

  const login = useCallback((tok, userInfo, detectedRole = 'student', teachingIds = []) => {
    setToken(tok)
    setUser(userInfo)
    setRole(detectedRole)
    const idSet = new Set(teachingIds)
    setTeachingCourseIds(idSet)
    localStorage.setItem('moodle_token', tok)
    localStorage.setItem('moodle_user', JSON.stringify(userInfo))
    localStorage.setItem('moodle_role', detectedRole)
    localStorage.setItem('moodle_teaching_ids', JSON.stringify(teachingIds))
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    setRole('student')
    setTeachingCourseIds(new Set())
    localStorage.removeItem('moodle_token')
    localStorage.removeItem('moodle_user')
    localStorage.removeItem('moodle_role')
    localStorage.removeItem('moodle_teaching_ids')
  }, [])

  // Returns true if this faculty member teaches the given courseId
  const canEditCourse = useCallback((courseId) => {
    if (role === 'admin') return true
    if (role === 'faculty') return teachingCourseIds.has(Number(courseId)) || teachingCourseIds.has(String(courseId))
    return false
  }, [role, teachingCourseIds])

  return (
    <AuthContext.Provider value={{ token, user, role, teachingCourseIds, login, logout, isLoggedIn: !!token, canEditCourse,
      isAdmin: role === 'admin',
      isFaculty: role === 'faculty' || role === 'admin',
      isStudent: role === 'student',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
