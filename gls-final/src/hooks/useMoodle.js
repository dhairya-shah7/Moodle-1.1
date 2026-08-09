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
      const text = await r.text()
      try {
        return JSON.parse(text)
      } catch (e) {
        console.warn(`JSON parse error for ${fn}:`, text.slice(0, 100))
        return { error: true, message: 'Invalid JSON response' }
      }
    } catch (err) {
      console.warn(`Fetch error for ${fn}:`, err.message)
      return { error: true, message: err.message }
    }
  }, [token])

  const post = useCallback(async (fn, bodyParams = {}) => {
    try {
      if (!token) return { error: true, message: 'No token' }
      const url = new URL('/proxy/api', window.location.origin)
      const params = new URLSearchParams()
      params.set('wstoken', token)
      params.set('wsfunction', fn)
      params.set('moodlewsrestformat', 'json')
      Object.entries(bodyParams).forEach(([k, v]) => params.set(k, v))

      const r = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      if (!r.ok) return { error: true, status: r.status }
      const text = await r.text()
      try {
        return JSON.parse(text)
      } catch (e) {
        console.warn(`JSON parse error for POST ${fn}:`, text.slice(0, 100))
        return { error: true, message: 'Invalid JSON response' }
      }
    } catch (err) {
      console.warn(`Fetch error for POST ${fn}:`, err.message)
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
    return post('mod_assign_save_grade', {
      assignmentid: assignId,
      userid: userId,
      grade: grade,
      attemptnumber: -1,
      addattempt: 0,
      workflowstate: 'released',
      applytoall: 0,
      'plugindata[assignfeedbackcomments_editor][text]': feedback,
      'plugindata[assignfeedbackcomments_editor][format]': 1,
    })
  }

  const getEnrolledUsers = (courseId) =>
    get('core_enrol_get_enrolled_users', { courseid: courseId })

  // Chunk array requests into POST batches of 6 courses max to prevent 414 URI Too Large errors on Mobile WebKit/Proxies
  const getAssignments = async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const assignments = []
      const chunkSize = 6
      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const params = {}
        chunk.forEach((c, idx) => {
          params[`courseids[${idx}]`] = c.id
        })
        const data = await post('mod_assign_get_assignments', params)
        if (data && data.courses && Array.isArray(data.courses)) {
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
    return post('mod_assign_save_submission', {
      assignmentid: assignId,
      'plugindata[files_filemanager]': itemId,
    })
  }

  const deleteSubmission = (assignId) => {
    return post('mod_assign_save_submission', {
      assignmentid: assignId,
      'plugindata[files_filemanager]': 0,
    })
  }

  const submitForGrading = (assignId) => {
    return post('mod_assign_submit_for_grading', {
      assignmentid: assignId,
      acceptsubmissionstatement: 1,
    })
  }

  const getCourseFiles = async (courses) => {
    if (!courses || !courses.length) return []
    const items = []
    for (const c of courses) {
      try {
        const sections = await get('core_course_get_contents', { courseid: c.id })
        if (!Array.isArray(sections)) continue
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
    }
    return items
  }

  const getResourceFiles = async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const resources = []
      const chunkSize = 6
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })

      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const params = {}
        chunk.forEach((c, idx) => {
          params[`courseids[${idx}]`] = c.id
        })
        const data = await post('mod_resource_get_resources_by_courses', params)
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
      const chunkSize = 6
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })

      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize)
        const params = {}
        chunk.forEach((c, idx) => {
          params[`courseids[${idx}]`] = c.id
        })
        const data = await post('mod_url_get_urls_by_courses', params)
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
    get, post, token,
    getSiteInfo, getCourses, getAllCourses, getAssignments, getGrades,
    getSubmissionStatus, getSubmissions, saveGrade, getEnrolledUsers,
    getCalendarEvents,
    uploadFileToDraft, saveSubmission, deleteSubmission, submitForGrading,
    getCourseFiles, getResourceFiles, getUrlResources, getNotifications,
  }
}
