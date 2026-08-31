import { useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'

async function fetchWithTimeout(resource, options = {}, timeoutMs = 12000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const response = await fetch(resource, {
      ...options,
      ...(controller ? { signal: controller.signal } : {})
    })
    if (id) clearTimeout(id)
    return response
  } catch (error) {
    if (id) clearTimeout(id)
    throw error
  }
}

async function safeJsonFetch(url, options = {}, timeoutMs = 25000) {
  try {
    const res = await fetchWithTimeout(url, options, timeoutMs)
    if (!res.ok) {
      return { error: true, status: res.status, message: `HTTP ${res.status}` }
    }
    const text = await res.text()
    if (!text || !text.trim()) {
      return { error: true, message: 'Empty response body' }
    }
    if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('Fortinet') || text.includes('Cyberoam') || text.includes('fgta_')) {
      console.warn('Campus firewall / Fortinet block page detected.')
      return { error: true, firewallBlocked: true, message: 'Campus firewall blocking active' }
    }
    try {
      const data = JSON.parse(text)
      if (data && (data.errorcode === 'invalidtoken' || data.message === 'Invalid token - token not found')) {
        console.warn('Stale/invalid Moodle token detected. Clearing session.')
        try {
          localStorage.removeItem('moodle_token')
          localStorage.removeItem('moodle_user')
          localStorage.removeItem('moodle_role')
          localStorage.removeItem('moodle_teaching_ids')
        } catch (e) {}
        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
          window.location.href = '/'
        }
        return { error: true, invalidToken: true, message: 'Invalid token' }
      }
      return data
    } catch (e) {
      console.warn('JSON parse error from:', url, e.message)
      return { error: true, message: 'Invalid JSON format' }
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    console.warn(`Fetch error for ${url}:`, isTimeout ? 'Request timed out' : err.message)
    return { error: true, message: isTimeout ? 'Request timed out' : err.message }
  }
}

export function useMoodle() {
  const { token, deptId, department } = useAuth()

  const apiHeaders = useMemo(() => ({
    'X-Moodle-Dept': deptId || 'btech',
    'X-Moodle-Url': department?.url || '',
  }), [deptId, department?.url])

  const get = useCallback(async (fn, params = {}) => {
    try {
      if (!token) return { error: true, message: 'No token' }
      const url = new URL('/proxy/api', window.location.origin)
      url.searchParams.set('wstoken', token)
      url.searchParams.set('wsfunction', fn)
      url.searchParams.set('moodlewsrestformat', 'json')
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
      return await safeJsonFetch(url.toString(), { headers: apiHeaders })
    } catch (err) {
      console.warn(`Fetch error for ${fn}:`, err.message)
      return { error: true, message: err.message }
    }
  }, [token, apiHeaders])

  const post = useCallback(async (fn, params = {}) => {
    try {
      if (!token) return { error: true, message: 'No token' }
      const bodyParams = {
        wstoken: token,
        wsfunction: fn,
        moodlewsrestformat: 'json',
        ...params
      }
      return await safeJsonFetch('/proxy/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiHeaders
        },
        body: JSON.stringify(bodyParams)
      })
    } catch (err) {
      console.warn(`POST error for ${fn}:`, err.message)
      return { error: true, message: err.message }
    }
  }, [token, apiHeaders])

  const getSiteInfo      = useCallback(() => get('core_webservice_get_site_info'), [get])
  const getCourses       = useCallback((userId) => get('core_enrol_get_users_courses', { userid: userId }), [get])
  const getGrades        = useCallback((userId) => get('gradereport_overview_get_course_grades', { userid: userId }), [get])
  const getAllCourses    = useCallback(() => get('core_course_get_courses'), [get])
  const getNotifications = useCallback((userId) => get('message_popup_get_popup_notifications', { userid: userId, newestfirst: 1, limit: 20 }), [get])

  const getSubmissions = useCallback((assignId) =>
    get('mod_assign_get_submissions', { 'assignmentids[0]': assignId }), [get])

  const saveGrade = useCallback((assignId, userId, grade, feedback = '') => {
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
  }, [post])

  const getEnrolledUsers = useCallback((courseId) =>
    get('core_enrol_get_enrolled_users', { courseid: courseId }), [get])

  // Chunk array requests into GET batches of 8 courses per query string to prevent 414 URI Too Large errors on Mobile WebKit/Proxies while keeping native Moodle URL array format
  const getAssignments = useCallback(async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const assignments = []
      const chunkSize = 8
      const chunks = []
      for (let i = 0; i < courses.length; i += chunkSize) {
        chunks.push(courses.slice(i, i + chunkSize))
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
            const url = `/proxy/api?wstoken=${token}&wsfunction=mod_assign_get_assignments&moodlewsrestformat=json&${ids}`
            const data = await safeJsonFetch(url, { headers: apiHeaders })
            if (data && Array.isArray(data.courses)) {
              data.courses.forEach(c => {
                ;(c.assignments || []).forEach(a => {
                  assignments.push({ ...a, courseid: c.id, coursename: c.fullname, courseshort: c.shortname })
                })
              })
            }
          } catch (e) {
            console.warn('getAssignments chunk error:', e.message)
          }
        })
      )

      return assignments.sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))
    } catch (e) {
      console.warn('getAssignments error:', e.message)
      return []
    }
  }, [token, apiHeaders])

  const getSubmissionStatus = useCallback((assignId) =>
    get('mod_assign_get_submission_status', { assignid: assignId }), [get])

  const getCalendarEvents = useCallback(() =>
    get('core_calendar_get_action_events_by_timesort', {
      timesortfrom: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7,
      timesortto:   Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
      limitnum: 150,
    }), [get])

  const uploadFileToDraft = useCallback(async (file) => {
    try {
      const formData = new FormData()
      formData.append('file_1', file, file.name)
      formData.append('token', token)
      const res = await fetchWithTimeout('/proxy/upload', {
        method: 'POST',
        headers: apiHeaders,
        body: formData
      }, 25000)
      if (!res.ok) return { error: `Upload HTTP ${res.status}` }
      const text = await res.text()
      try {
        return JSON.parse(text)
      } catch (e) {
        return { error: 'Invalid JSON server response' }
      }
    } catch (e) {
      return { error: e.message }
    }
  }, [token, apiHeaders])

  const saveSubmission = useCallback((assignId, itemId) => {
    return post('mod_assign_save_submission', {
      assignmentid: assignId,
      'plugindata[files_filemanager]': itemId,
    })
  }, [post])

  const deleteSubmission = useCallback((assignId) => {
    return post('mod_assign_save_submission', {
      assignmentid: assignId,
      'plugindata[files_filemanager]': 0,
    })
  }, [post])

  const submitForGrading = useCallback((assignId) => {
    return post('mod_assign_submit_for_grading', {
      assignmentid: assignId,
      acceptsubmissionstatement: 1,
    })
  }, [post])

  const fetchFileBlob = useCallback(async (fileUrl) => {
    try {
      const url = `/proxy/file?url=${encodeURIComponent(fileUrl)}&token=${encodeURIComponent(token)}`
      const res = await fetch(url, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.blob()
    } catch (err) {
      console.warn('fetchFileBlob error:', err.message)
      throw err
    }
  }, [token, apiHeaders])

  const getCourseFiles = useCallback(async (courses) => {
    if (!courses || !courses.length) return []
    const items = []
    const batchSize = 3
    for (let i = 0; i < courses.length; i += batchSize) {
      const batch = courses.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (c) => {
          try {
            const url = `/proxy/api?wstoken=${token}&wsfunction=core_course_get_contents&moodlewsrestformat=json&courseid=${c.id}`
            const sections = await safeJsonFetch(url, { headers: apiHeaders })
            if (!Array.isArray(sections)) return
            sections.forEach(sec => {
              ;(sec.modules || []).forEach(mod => {
                ;(mod.contents || []).forEach(f => {
                  if (f.fileurl && f.filename && !f.filename.endsWith('/') && f.type !== 'url') {
                    items.push({
                      ...f,
                      itemType: 'file',
                      coursename: c.fullname,
                      courseshort: c.shortname,
                      courseid: c.id,
                      sectionname: sec.name || '',
                      modname: mod.name,
                      modtype: mod.modname || 'file',
                      url: f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + token,
                    })
                  }
                  if (f.type === 'url' || (f.fileurl && mod.modname === 'url')) {
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
    }
    return items
  }, [token, apiHeaders])

  const getResourceFiles = useCallback(async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const resources = []
      const chunkSize = 8
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })
      const chunks = []
      for (let i = 0; i < courses.length; i += chunkSize) {
        chunks.push(courses.slice(i, i + chunkSize))
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
            const url = `/proxy/api?wstoken=${token}&wsfunction=mod_resource_get_resources_by_courses&moodlewsrestformat=json&${ids}`
            const data = await safeJsonFetch(url, { headers: apiHeaders })
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
          } catch (e) {
            console.warn('getResourceFiles chunk error:', e.message)
          }
        })
      )
      return resources
    } catch (e) {
      console.warn('getResourceFiles error', e.message)
      return []
    }
  }, [token, apiHeaders])

  const getUrlResources = useCallback(async (courses) => {
    if (!courses || !courses.length) return []
    try {
      const urls = []
      const chunkSize = 8
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })
      const chunks = []
      for (let i = 0; i < courses.length; i += chunkSize) {
        chunks.push(courses.slice(i, i + chunkSize))
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const ids = chunk.map((c, idx) => `courseids[${idx}]=${c.id}`).join('&')
            const url = `/proxy/api?wstoken=${token}&wsfunction=mod_url_get_urls_by_courses&moodlewsrestformat=json&${ids}`
            const data = await safeJsonFetch(url, { headers: apiHeaders })
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
          } catch (e) {
            console.warn('getUrlResources chunk error:', e.message)
          }
        })
      )
      return urls
    } catch (e) {
      console.warn('getUrlResources error', e.message)
      return []
    }
  }, [token, apiHeaders])

  return useMemo(() => ({
    get, post, token,
    getSiteInfo, getCourses, getAllCourses, getAssignments, getGrades,
    getSubmissionStatus, getSubmissions, saveGrade, getEnrolledUsers,
    getCalendarEvents,
    uploadFileToDraft, saveSubmission, deleteSubmission, submitForGrading,
    fetchFileBlob,
    getCourseFiles, getResourceFiles, getUrlResources, getNotifications,
  }), [
    get, post, token,
    getSiteInfo, getCourses, getAllCourses, getAssignments, getGrades,
    getSubmissionStatus, getSubmissions, saveGrade, getEnrolledUsers,
    getCalendarEvents,
    uploadFileToDraft, saveSubmission, deleteSubmission, submitForGrading,
    fetchFileBlob,
    getCourseFiles, getResourceFiles, getUrlResources, getNotifications,
  ])
}

