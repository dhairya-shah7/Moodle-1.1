import { useState, useEffect, useCallback } from 'react'
import { useMoodle } from './useMoodle'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export function useData() {
  const { user } = useAuth()
  const moodle = useMoodle()
  const [courses, setCourses]         = useState([])
  const [assignments, setAssignments] = useState([])
  const [files, setFiles]             = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]         = useState(true)

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // courses
      const c = await moodle.getCourses(user.userid)
      const courseList = Array.isArray(c) ? c : []
      setCourses(courseList)

      // assignments
      if (courseList.length) {
        const aData = await moodle.getAssignments(courseList)
        const all = []
        if (aData.courses) {
          aData.courses.forEach(c => {
            ;(c.assignments || []).forEach(a => all.push({ ...a, coursename: c.fullname, courseshort: c.shortname }))
          })
        }
        all.sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))
        setAssignments(all)

        // deadline toasts
        all.forEach(a => {
          const d = Math.ceil((a.duedate * 1000 - Date.now()) / 86400000)
          if (d === 0) toast.error(`🚨 Due Today: ${a.name}`)
          else if (d === 1) toast(`⏰ Due Tomorrow: ${a.name}`)
        })
      }

      // notifications
      try {
        const n = await moodle.getNotifications(user.userid)
        setNotifications(n.notifications || [])
      } catch {}

      // files - load per course
      const allFiles = []
      for (const c of courseList) {
        try {
          const sections = await moodle.getCourseFiles(c.id)
          if (!Array.isArray(sections)) continue
          sections.forEach(sec => {
            ;(sec.modules || []).forEach(mod => {
              ;(mod.contents || []).forEach(f => {
                if (f.type === 'file') allFiles.push({ ...f, coursename: c.fullname, courseshort: c.shortname, modname: mod.name })
              })
            })
          })
        } catch {}
      }
      setFiles(allFiles)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  // poll for new files every 5 min
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!user) return
      const prev = files.length
      const allFiles = []
      for (const c of courses) {
        try {
          const sections = await moodle.getCourseFiles(c.id)
          if (!Array.isArray(sections)) continue
          sections.forEach(sec => {
            ;(sec.modules || []).forEach(mod => {
              ;(mod.contents || []).forEach(f => {
                if (f.type === 'file') allFiles.push({ ...f, coursename: c.fullname, courseshort: c.shortname, modname: mod.name })
              })
            })
          })
        } catch {}
      }
      if (allFiles.length > prev) {
        setFiles(allFiles)
        toast.success('📁 New file uploaded by faculty!')
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [files.length, courses, user])

  return { courses, assignments, files, notifications, loading }
}
