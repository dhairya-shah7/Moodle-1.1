import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useMoodle } from '../hooks/useMoodle'
import toast from 'react-hot-toast'
import { daysLeft } from '../utils/helpers'

const AppDataContext = createContext(null)

function safeGetCache(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function safeSetCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {}
}

export function AppDataProvider({ children }) {
  const { token, user, isLoggedIn, role, teachingCourseIds } = useAuth()
  const moodle = useMoodle()

  const [courses, setCourses]               = useState(() => safeGetCache(`moodle_cache_courses_${user?.userid}`) || [])
  const [assignments, setAssignments]       = useState(() => safeGetCache(`moodle_cache_assignments_${user?.userid}`) || [])
  const [submissions, setSubmissions]       = useState({})
  const [calendarEvents, setCalendarEvents] = useState([])
  const [files, setFiles]                   = useState(() => safeGetCache(`moodle_cache_files_${user?.userid}`) || [])
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
      try { localStorage.setItem(`moodle_hidden_courses_${user.userid}`, JSON.stringify(next)) } catch (e) {}
      return next
    })
  }

  const restoreAllCourses = () => {
    if (!user?.userid) return
    setHiddenCourseIds([])
    try { localStorage.removeItem(`moodle_hidden_courses_${user.userid}`) } catch (e) {}
  }

  const ignoreAssignment = (assignId) => {
    if (!user?.userid) return
    setIgnoredAssignmentIds(prev => {
      const next = prev.includes(assignId) ? prev : [...prev, assignId]
      try { localStorage.setItem(`moodle_ignored_assignments_${user.userid}`, JSON.stringify(next)) } catch (e) {}
      return next
    })
  }

  const unignoreAssignment = (assignId) => {
    if (!user?.userid) return
    setIgnoredAssignmentIds(prev => {
      const next = prev.filter(id => id !== assignId)
      try { localStorage.setItem(`moodle_ignored_assignments_${user.userid}`, JSON.stringify(next)) } catch (e) {}
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
  }, [moodle])

  const loadAll = useCallback(async () => {
    if (!isLoggedIn || !user?.userid) return
    setLoading(true)
    try {
      const coursePromise = (role === 'faculty')
        ? moodle.getAllCourses()
        : moodle.getCourses(user.userid)

      const [c, n, cal] = await Promise.all([
        coursePromise.catch(err => { console.warn('getCourses error:', err); return [] }),
        moodle.getNotifications(user.userid).catch(() => ({ notifications: [] })),
        moodle.getCalendarEvents().catch(() => ({ events: [] })),
      ])

      const courseList = Array.isArray(c) ? c : []
      setCourses(courseList)
      setNotifications(n?.notifications || [])
      setCalendarEvents(cal?.events || [])

      const enrolledCourses = (role === 'faculty')
        ? courseList.filter(c => teachingCourseIds?.has(c.id) || teachingCourseIds?.has(String(c.id)))
        : courseList

      const [a, primaryFiles, fallbackFiles, urlFiles] = await Promise.all([
        moodle.getAssignments(enrolledCourses).catch(() => []),
        moodle.getCourseFiles(enrolledCourses).catch(() => []),
        moodle.getResourceFiles(enrolledCourses).catch(() => []),
        moodle.getUrlResources ? moodle.getUrlResources(enrolledCourses).catch(() => []) : Promise.resolve([]),
      ])

      const assignmentList = Array.isArray(a) ? a : []
      setAssignments(assignmentList)

      const mergedFiles = [...(Array.isArray(primaryFiles) ? primaryFiles : [])]
      const fileUrls = new Set(mergedFiles.map(f => f.fileurl || f.url))
      const addUniqueFile = (f) => {
        const key = f.fileurl || f.url
        if (key && !fileUrls.has(key)) {
          mergedFiles.push(f)
          fileUrls.add(key)
        }
      }
      if (Array.isArray(fallbackFiles)) fallbackFiles.forEach(addUniqueFile)
      if (Array.isArray(urlFiles)) urlFiles.forEach(addUniqueFile)

      setFiles(mergedFiles)
      prevFileCount.current = mergedFiles.length

      if (role === 'student' && assignmentList.length > 0) {
        await loadSubmissions(assignmentList)
        const dueToday = []
        const dueTomorrow = []

        assignmentList.forEach(assign => {
          if (toastedIds.current.has(assign.id)) return
          const d = daysLeft(assign.duedate)
          if (d === 0) {
            dueToday.push(assign)
            toastedIds.current.add(assign.id)
          } else if (d === 1) {
            dueTomorrow.push(assign)
            toastedIds.current.add(assign.id)
          }
        })

        if (dueToday.length === 1) {
          toast.error(`🚨 Due Today: ${dueToday[0].name}`, { duration: 8000 })
          sendDeviceNotification('Moodle 1.1 - Deadline Alert', `🚨 Due Today: ${dueToday[0].name}`)
        } else if (dueToday.length > 1) {
          const msg = `🚨 ${dueToday.length} assignments are due today!`
          toast.error(msg, { duration: 8000 })
          sendDeviceNotification('Moodle 1.1 - Deadline Alert', msg)
        }

        if (dueTomorrow.length === 1) {
          toast(`⏰ Due Tomorrow: ${dueTomorrow[0].name}`, { duration: 6000 })
          sendDeviceNotification('Moodle 1.1 - Deadline Alert', `⏰ Due Tomorrow: ${dueTomorrow[0].name}`)
        } else if (dueTomorrow.length > 1) {
          const msg = `⏰ ${dueTomorrow.length} assignments are due tomorrow!`
          toast(msg, { duration: 6000 })
          sendDeviceNotification('Moodle 1.1 - Deadline Alert', msg)
        }
      }
    } catch (e) {
      console.error('loadAll error', e)
    } finally {
      setLoading(false)
    }
  }, [isLoggedIn, user?.userid, token, role, moodle, loadSubmissions, teachingCourseIds])

  useEffect(() => { loadAll() }, [loadAll])

  // Poll every 5 min for new files and assignments
  const prevAssignCount = useRef(0)
  const prevAssignIds   = useRef(new Set())

  useEffect(() => {
    if (!isLoggedIn) return
    const interval = setInterval(async () => {
      try {
        const coursePromise = (role === 'faculty')
          ? moodle.getAllCourses()
          : moodle.getCourses(user.userid)
        const c = await coursePromise
        const courseList = Array.isArray(c) ? c : []

        const enrolledCourses = (role === 'faculty')
          ? courseList.filter(c => teachingCourseIds?.has(c.id) || teachingCourseIds?.has(String(c.id)))
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
          if (newOnes.length === 1) {
            const msg = `📋 New assignment posted: ${newOnes[0].name}`
            toast(msg, { duration: 8000, icon: '📋' })
            sendDeviceNotification('Moodle 1.1 - New Assignment', msg)
          } else {
            const msg = `📋 ${newOnes.length} new assignments posted!`
            toast(msg, { duration: 8000, icon: '📋' })
            sendDeviceNotification('Moodle 1.1 - New Assignments', msg)
          }
          setAssignments(a)
          if (role === 'student') await loadSubmissions(a)
        }
        newOnes.forEach(x => prevAssignIds.current.add(x.id))
        prevAssignCount.current = a.length
      } catch (e) {}
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isLoggedIn, role])

  const lastNotifTime = useRef(0)
  const lastNotifTitle = useRef('')

  const sendDeviceNotification = useCallback((title, body) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const now = Date.now()
      if (now - lastNotifTime.current < 2000 && lastNotifTitle.current === `${title}:${body}`) {
        return
      }
      lastNotifTime.current = now
      lastNotifTitle.current = `${title}:${body}`

      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, { body, icon: '/logo192.png', tag: 'moodle-notif' })
          }).catch(() => {
            new Notification(title, { body, icon: '/logo192.png', tag: 'moodle-notif' })
          })
        } else {
          new Notification(title, { body, icon: '/logo192.png', tag: 'moodle-notif' })
        }
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
