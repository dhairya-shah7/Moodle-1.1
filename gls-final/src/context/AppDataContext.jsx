import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useMoodle } from '../hooks/useMoodle'
import toast from 'react-hot-toast'
import { daysLeft } from '../utils/helpers'

const AppDataContext = createContext(null)

export function AppDataProvider({ children }) {
  const { token, user, isLoggedIn, role, teachingCourseIds } = useAuth()
  const moodle = useMoodle()

  const [courses, setCourses]               = useState([])
  const [assignments, setAssignments]       = useState([])
  const [submissions, setSubmissions]       = useState({})
  const [calendarEvents, setCalendarEvents] = useState([])
  const [files, setFiles]                   = useState([])
  const [notifications, setNotifications]   = useState([])
  const [loading, setLoading]               = useState(false)
  const prevFileCount  = useRef(0)
  const toastedIds     = useRef(new Set())

  const [hiddenCourseIds, setHiddenCourseIds] = useState([])
  const [ignoredAssignmentIds, setIgnoredAssignmentIds] = useState([])

  useEffect(() => {
    if (user?.userid) {
      try {
        const storedCourses = localStorage.getItem(`moodle_hidden_courses_${user.userid}`)
        setHiddenCourseIds(storedCourses ? JSON.parse(storedCourses) : [])
      } catch (e) {
        setHiddenCourseIds([])
      }
      try {
        const storedAssignments = localStorage.getItem(`moodle_ignored_assignments_${user.userid}`)
        setIgnoredAssignmentIds(storedAssignments ? JSON.parse(storedAssignments) : [])
      } catch (e) {
        setIgnoredAssignmentIds([])
      }
    } else {
      setHiddenCourseIds([])
      setIgnoredAssignmentIds([])
    }
  }, [user?.userid])

  const hideCourse = (courseId) => {
    if (!user?.userid) return
    setHiddenCourseIds(prev => {
      const next = prev.includes(courseId) ? prev : [...prev, courseId]
      localStorage.setItem(`moodle_hidden_courses_${user.userid}`, JSON.stringify(next))
      return next
    })
  }

  const restoreAllCourses = () => {
    if (!user?.userid) return
    setHiddenCourseIds([])
    localStorage.removeItem(`moodle_hidden_courses_${user.userid}`)
  }

  const ignoreAssignment = (assignId) => {
    if (!user?.userid) return
    setIgnoredAssignmentIds(prev => {
      const next = prev.includes(assignId) ? prev : [...prev, assignId]
      localStorage.setItem(`moodle_ignored_assignments_${user.userid}`, JSON.stringify(next))
      return next
    })
  }

  const unignoreAssignment = (assignId) => {
    if (!user?.userid) return
    setIgnoredAssignmentIds(prev => {
      const next = prev.filter(id => id !== assignId)
      localStorage.setItem(`moodle_ignored_assignments_${user.userid}`, JSON.stringify(next))
      return next
    })
  }

  const loadSubmissions = useCallback(async (assignList) => {
    const map = {}
    for (let i = 0; i < assignList.length; i += 5) {
      await Promise.all(
        assignList.slice(i, i + 5).map(async (a) => {
          try { map[a.id] = await moodle.getSubmissionStatus(a.id) }
          catch (e) { map[a.id] = null }
        })
      )
    }
    setSubmissions(map)
    return map
  }, [token])

  const loadAll = useCallback(async () => {
    if (!isLoggedIn || !user?.userid) return
    setLoading(true)
    try {
      // Faculty/admin: fetch ALL courses on the site so they can browse everything
      // Students: only their enrolled courses
      const coursePromise = (role === 'faculty' || role === 'admin')
        ? moodle.getAllCourses()
        : moodle.getCourses(user.userid)

      const [c, n, cal] = await Promise.all([
        coursePromise,
        moodle.getNotifications(user.userid).catch(() => ({ notifications: [] })),
        moodle.getCalendarEvents().catch(() => ({ events: [] })),
      ])
      const courseList = Array.isArray(c) ? c : []
      setCourses(courseList)
      setNotifications(n.notifications || [])
      setCalendarEvents(cal.events || [])

      // Filter courses for files/assignments to avoid overload on faculty/admin accounts
      const enrolledCourses = (role === 'faculty')
        ? courseList.filter(c => teachingCourseIds?.has(c.id) || teachingCourseIds?.has(String(c.id)))
        : (role === 'admin')
          ? courseList.slice(0, 10)
          : courseList

      const [a, primaryFiles, fallbackFiles, urlFiles] = await Promise.all([
        moodle.getAssignments(enrolledCourses),
        moodle.getCourseFiles(enrolledCourses).catch(() => []),
        moodle.getResourceFiles(enrolledCourses).catch(() => []),
        moodle.getUrlResources ? moodle.getUrlResources(enrolledCourses).catch(() => []) : Promise.resolve([]),
      ])
      setAssignments(a)

      const mergedFiles = [...primaryFiles]
      const fileUrls = new Set(primaryFiles.map(f => f.fileurl || f.url))
      const addUniqueFile = (f) => {
        const key = f.fileurl || f.url
        if (key && !fileUrls.has(key)) {
          mergedFiles.push(f)
          fileUrls.add(key)
        }
      }
      fallbackFiles.forEach(addUniqueFile)
      urlFiles.forEach(addUniqueFile)

      setFiles(mergedFiles)
      prevFileCount.current = mergedFiles.length

      // Only load submission statuses for students
      if (role === 'student') {
        await loadSubmissions(a)
        a.forEach(assign => {
          if (toastedIds.current.has(assign.id)) return
          const d = daysLeft(assign.duedate)
          if (d === 0) {
            toast.error(`🚨 Due Today: ${assign.name}`, { duration: 8000 })
            sendDeviceNotification('Moodle 1.1 - Deadline Alert', `🚨 Due Today: ${assign.name}`)
            toastedIds.current.add(assign.id)
          } else if (d === 1) {
            toast(`⏰ Due Tomorrow: ${assign.name}`, { duration: 6000 })
            sendDeviceNotification('Moodle 1.1 - Deadline Alert', `⏰ Due Tomorrow: ${assign.name}`)
            toastedIds.current.add(assign.id)
          }
        })
      }
    } catch (e) {
      console.error('loadAll error', e)
    }
    setLoading(false)
  }, [isLoggedIn, user?.userid, token, role])

  useEffect(() => { loadAll() }, [loadAll])

  // Poll every 5 min for new files and assignments
  const prevAssignCount = useRef(0)
  const prevAssignIds   = useRef(new Set())

  useEffect(() => {
    if (!isLoggedIn) return
    const interval = setInterval(async () => {
      try {
        const coursePromise = (role === 'faculty' || role === 'admin')
          ? moodle.getAllCourses()
          : moodle.getCourses(user.userid)
        const c = await coursePromise
        const courseList = Array.isArray(c) ? c : []

        const enrolledCourses = (role === 'faculty')
          ? courseList.filter(c => teachingCourseIds?.has(c.id) || teachingCourseIds?.has(String(c.id)))
          : (role === 'admin')
            ? courseList.slice(0, 10)
            : courseList

        const [primaryFiles, fallbackFiles, urlFiles] = await Promise.all([
          moodle.getCourseFiles(enrolledCourses).catch(() => []),
          moodle.getResourceFiles(enrolledCourses).catch(() => []),
          moodle.getUrlResources ? moodle.getUrlResources(enrolledCourses).catch(() => []) : Promise.resolve([]),
        ])
        const mergedFiles = [...primaryFiles]
        const fileUrls = new Set(primaryFiles.map(f => f.fileurl || f.url))
        const addUniqueFile = (f) => {
          const key = f.fileurl || f.url
          if (key && !fileUrls.has(key)) {
            mergedFiles.push(f)
            fileUrls.add(key)
          }
        }
        fallbackFiles.forEach(addUniqueFile)
        urlFiles.forEach(addUniqueFile)

        if (mergedFiles.length > prevFileCount.current) {
          const msg = '📁 New file uploaded by faculty!'
          toast(msg, { icon: '📁', duration: 6000 })
          sendDeviceNotification('Moodle 1.1 - File Uploaded', msg)
        }
        prevFileCount.current = mergedFiles.length
        setFiles(mergedFiles)

        const a = await moodle.getAssignments(enrolledCourses)
        const newOnes = a.filter(x => !prevAssignIds.current.has(x.id))
        if (newOnes.length > 0 && prevAssignCount.current > 0) {
          newOnes.forEach(assign => {
            const msg = `📋 New assignment posted: ${assign.name}`
            toast(msg, { duration: 8000, icon: '📋' })
            sendDeviceNotification('Moodle 1.1 - New Assignment', msg)
          })
          setAssignments(a)
          if (role === 'student') await loadSubmissions(a)
        }
        newOnes.forEach(x => prevAssignIds.current.add(x.id))
        prevAssignCount.current = a.length
      } catch (e) {}
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isLoggedIn, role])

  const sendDeviceNotification = useCallback((title, body) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/logo192.png' })
      } catch (e) {
        console.warn('Failed to display system notification', e)
      }
    }
  }, [])

  const refreshSubmission = async (assignId) => {
    try {
      const s = await moodle.getSubmissionStatus(assignId)
      setSubmissions(prev => ({ ...prev, [assignId]: s }))
      return s
    } catch (e) { return null }
  }

  const loadFilesForCourse = useCallback(async (courseId) => {
    if (!courseId) return
    const alreadyLoaded = files.some(f => String(f.courseid) === String(courseId))
    if (alreadyLoaded) return

    const targetCourse = courses.find(c => String(c.id) === String(courseId))
    if (!targetCourse) return

    try {
      const [primary, fallback, urlFiles] = await Promise.all([
        moodle.getCourseFiles([targetCourse]).catch(() => []),
        moodle.getResourceFiles([targetCourse]).catch(() => []),
        moodle.getUrlResources ? moodle.getUrlResources([targetCourse]).catch(() => []) : Promise.resolve([]),
      ])

      const newFiles = [...primary]
      const fileUrls = new Set(primary.map(f => f.fileurl || f.url))
      const addUniqueFile = (f) => {
        const key = f.fileurl || f.url
        if (key && !fileUrls.has(key)) {
          newFiles.push(f)
          fileUrls.add(key)
        }
      }
      fallback.forEach(addUniqueFile)
      urlFiles.forEach(addUniqueFile)

      if (newFiles.length > 0) {
        setFiles(prev => {
          const merged = [...prev]
          const existingUrls = new Set(merged.map(f => f.fileurl || f.url))
          newFiles.forEach(f => {
            const key = f.fileurl || f.url
            if (key && !existingUrls.has(key)) {
              merged.push(f)
            }
          })
          return merged
        })
      }
    } catch (e) {
      console.warn('Failed to load files for course', courseId, e)
    }
  }, [courses, files, moodle])

  const visibleCourses = courses.filter(c => !hiddenCourseIds.includes(c.id))
  const visibleAssignments = assignments.filter(a => !hiddenCourseIds.includes(a.course || a.courseid))
  const visibleFiles = files.filter(f => !hiddenCourseIds.includes(f.courseid))

  const assignBadge = visibleAssignments.filter(a => {
    if (ignoredAssignmentIds.includes(a.id)) return false
    const sub = submissions[a.id]
    const notSubmitted = sub?.lastattempt?.submission?.status !== 'submitted'
    const d = daysLeft(a.duedate)
    return notSubmitted && a.duedate && d >= 0 && d <= 7
  }).length

  const notifBadge = notifications.filter(n => !n.read).length

  return (
    <AppDataContext.Provider value={{
      courses: visibleCourses,
      assignments: visibleAssignments,
      submissions,
      calendarEvents,
      files: visibleFiles,
      notifications,
      loading,
      user,
      role,
      badges: { assign: assignBadge, notif: notifBadge },
      reload: loadAll,
      refreshSubmission,
      hiddenCourseIds,
      hideCourse,
      restoreAllCourses,
      ignoredAssignmentIds,
      ignoreAssignment,
      unignoreAssignment,
      loadFilesForCourse
    }}>
      {children}
    </AppDataContext.Provider>
  )
}

export const useAppData = () => useContext(AppDataContext)
