import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

export function useMoodle() {
  const { token } = useAuth()

  const get = useCallback(async (fn, params = {}) => {
    try {
      if (!token) return { error: true, message: 'No token' }
      const url = new URL('/proxy/api', window.location.origin)
      url.searchParams.set('wstoken', token)
      url.searchParams.set('wsfunction', fn)
      url.searchParams.set('moodlewsrestformat', 'json')
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
      const r = await fetch(url.toString())
      if (!r.ok) return { error: true, status: r.status }
      return await r.json()
    } catch (err) {
      console.warn(`Fetch error for ${fn}:`, err.message)
      return { error: true, message: err.message }
    }
  }, [token])

  const getSiteInfo      = () => get('core_webservice_get_site_info')
  const getCourses       = (userId) => get('core_enrol_get_users_courses', { userid: userId })
  const getGrades        = (userId) => get('gradereport_overview_get_course_grades', { userid: userId })
  const getAllCourses    = () => get('core_course_get_courses')
  const getNotifications = (userId) => get('message_popup_get_popup_notifications', { userid: userId, newestfirst: 1, limit: 20 })

  const getSubmissions = (assignId) =>
    get('mod_assign_get_submissions', { 'assignmentids[0]': assignId })

  const saveGrade = (assignId, userId, grade, feedback = '') => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_save_grade')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('userid', userId)
    url.searchParams.set('grade', grade)
    url.searchParams.set('attemptnumber', -1)
    url.searchParams.set('addattempt', 0)
    url.searchParams.set('workflowstate', 'released')
    url.searchParams.set('applytoall', 0)
    url.searchParams.set('plugindata[assignfeedbackcomments_editor][text]', feedback)
    url.searchParams.set('plugindata[assignfeedbackcomments_editor][format]', 1)
    return fetch(url.toString()).then(r => r.json()).catch(() => ({ error: true }))
  }

  const getEnrolledUsers = (courseId) =>
    get('core_enrol_get_enrolled_users', { courseid: courseId })

  // Chunk array requests into GET batches of 8 courses per query string to prevent 414 URI Too Large errors on Mobile WebKit/Proxies while keeping native Moodle URL array format
  const getAssignments = async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const assignments = []
      const chunkSize = 8
      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
        const url = `/proxy/api?wstoken=${token}&wsfunction=mod_assign_get_assignments&moodlewsrestformat=json&${ids}`
        const r = await fetch(url)
        if (!r.ok) continue
        const data = await r.json()
        if (data && Array.isArray(data.courses)) {
          data.courses.forEach(c => {
            ;(c.assignments || []).forEach(a => {
              assignments.push({ ...a, courseid: c.id, coursename: c.fullname, courseshort: c.shortname })
            })
          })
        }
      }
      return assignments.sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))
    } catch (e) {
      console.warn('getAssignments error:', e.message)
      return []
    }
  }

  const getSubmissionStatus = (assignId) =>
    get('mod_assign_get_submission_status', { assignid: assignId })

  const getCalendarEvents = () =>
    get('core_calendar_get_action_events_by_timesort', {
      timesortfrom: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7,
      timesortto:   Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
      limitnum: 150,
    })

  const uploadFileToDraft = async (file) => {
    try {
      const formData = new FormData()
      formData.append('file_1', file, file.name)
      formData.append('token', token)
      const resp = await fetch('/proxy/upload', { method: 'POST', body: formData })
      return resp.json()
    } catch (e) {
      return { error: e.message }
    }
  }

  const saveSubmission = (assignId, itemId) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_save_submission')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('plugindata[files_filemanager]', itemId)
    return fetch(url.toString()).then(r => r.json()).catch(() => ({ error: true }))
  }

  const deleteSubmission = (assignId) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_save_submission')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('plugindata[files_filemanager]', 0)
    return fetch(url.toString()).then(r => r.json()).catch(() => ({ error: true }))
  }

  const submitForGrading = (assignId) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_submit_for_grading')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('acceptsubmissionstatement', 1)
    return fetch(url.toString()).then(r => r.json()).catch(() => ({ error: true }))
  }

  // Fast parallel fetching for course contents
  const getCourseFiles = async (courses) => {
    if (!courses || !courses.length) return []
    const items = []
    await Promise.all(
      courses.map(async (c) => {
        try {
          const url = `/proxy/api?wstoken=${token}&wsfunction=core_course_get_contents&moodlewsrestformat=json&courseid=${c.id}`
          const r = await fetch(url)
          if (!r.ok) return
          const sections = await r.json()
          if (!Array.isArray(sections)) return
          sections.forEach(sec => {
            ;(sec.modules || []).forEach(mod => {
              ;(mod.contents || []).forEach(f => {
                if (f.type === 'file' && f.filename && !f.filename.endsWith('/')) {
                  items.push({
                    ...f,
                    itemType: 'file',
                    coursename: c.fullname,
                    courseshort: c.shortname,
                    courseid: c.id,
                    sectionname: sec.name || '',
                    modname: mod.name,
                    modtype: mod.modname,
                    url: f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + token,
                  })
                }
                if (f.type === 'url' && f.fileurl) {
                  items.push({
                    filename: mod.name || f.filename,
                    fileurl: f.fileurl,
                    filesize: 0,
                    timemodified: f.timemodified,
                    itemType: 'link',
                    coursename: c.fullname,
                    courseshort: c.shortname,
                    courseid: c.id,
                    sectionname: sec.name || '',
                    modname: mod.name,
                    modtype: 'url',
                    url: f.fileurl,
                  })
                }
              })
            })
          })
        } catch (e) {
          console.warn('getCourseFiles error for', c.shortname, e.message)
        }
      })
    )
    return items
  }

  const getResourceFiles = async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const resources = []
      const chunkSize = 8
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })

      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
        const url = `/proxy/api?wstoken=${token}&wsfunction=mod_resource_get_resources_by_courses&moodlewsrestformat=json&${ids}`
        const r = await fetch(url)
        if (!r.ok) continue
        const data = await r.json()
        const resList = data?.resources || []
        if (Array.isArray(resList)) {
          resList.forEach(r => {
            const course = courseMap[r.course] || {}
            const f = r.contentfiles?.[0] || {}
            if (f.fileurl) {
              resources.push({
                filename: f.filename || r.name,
                fileurl: f.fileurl || '',
                filesize: f.filesize || 0,
                timemodified: f.timemodified || r.timemodified,
                itemType: 'file',
                coursename: course.fullname || '',
                courseshort: course.shortname || '',
                courseid: r.course,
                sectionname: '',
                modname: r.name,
                modtype: 'resource',
                url: f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + token,
              })
            }
          })
        }
      }
      return resources
    } catch (e) {
      console.warn('getResourceFiles error', e.message)
      return []
    }
  }

  const getUrlResources = async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const urls = []
      const chunkSize = 8
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })

      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
        const url = `/proxy/api?wstoken=${token}&wsfunction=mod_url_get_urls_by_courses&moodlewsrestformat=json&${ids}`
        const r = await fetch(url)
        if (!r.ok) continue
        const data = await r.json()
        const urlList = data?.urls || []
        if (Array.isArray(urlList)) {
          urlList.forEach(u => {
            const course = courseMap[u.course] || {}
            urls.push({
              id: u.id,
              filename: u.name,
              fileurl: u.externalurl,
              filesize: 0,
              timemodified: u.timemodified,
              itemType: 'link',
              coursename: course.fullname || '',
              courseshort: course.shortname || '',
              courseid: u.course,
              sectionname: 'General',
              modname: u.name,
              modtype: 'url',
              url: u.externalurl,
            })
          })
        }
      }
      return urls
    } catch (e) {
      console.warn('getUrlResources error', e.message)
      return []
    }
  }

  return {
    get, token,
    getSiteInfo, getCourses, getAllCourses, getAssignments, getGrades,
    getSubmissionStatus, getSubmissions, saveGrade, getEnrolledUsers,
    getCalendarEvents,
    uploadFileToDraft, saveSubmission, deleteSubmission, submitForGrading,
    getCourseFiles, getResourceFiles, getUrlResources, getNotifications,
  }
}
