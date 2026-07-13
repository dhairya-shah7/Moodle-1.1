import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

export function useMoodle() {
  const { token } = useAuth()

  const get = useCallback(async (fn, params = {}) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', fn)
    url.searchParams.set('moodlewsrestformat', 'json')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const r = await fetch(url.toString())
    return r.json()
  }, [token])

  const getSiteInfo      = () => get('core_webservice_get_site_info')
  const getCourses       = (userId) => get('core_enrol_get_users_courses', { userid: userId })
  const getGrades        = (userId) => get('gradereport_overview_get_course_grades', { userid: userId })
  // Faculty/admin: fetch all courses on the site
  const getAllCourses     = () => get('core_course_get_courses')
  const getNotifications = (userId) => get('message_popup_get_popup_notifications', { userid: userId, newestfirst: 1, limit: 20 })

  // Faculty: get all student submissions for an assignment
  const getSubmissions = (assignId) =>
    get('mod_assign_get_submissions', { 'assignmentids[0]': assignId })

  // Faculty: save a grade for a student submission
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
    return fetch(url.toString()).then(r => r.json())
  }

  // Faculty: get enrolled students in a course
  const getEnrolledUsers = (courseId) =>
    get('core_enrol_get_enrolled_users', { courseid: courseId })

  // FIX 1: Send ALL course IDs, not just first few
  const getAssignments = async (courses) => {
    if (!courses.length) return []
    // Build query string with all course IDs
    const ids = courses.map((c, i) => `courseids[${i}]=${c.id}`).join('&')
    const url = `/proxy/api?wstoken=${token}&wsfunction=mod_assign_get_assignments&moodlewsrestformat=json&${ids}`
    const data = await fetch(url).then(r => r.json())
    const assignments = []
    if (data.courses) {
      data.courses.forEach(c => {
        ;(c.assignments || []).forEach(a => {
          assignments.push({ ...a, courseid: c.id, coursename: c.fullname, courseshort: c.shortname })
        })
      })
    }
    return assignments.sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))
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
    const formData = new FormData()
    formData.append('file_1', file, file.name)
    formData.append('token', token)
    const resp = await fetch('/proxy/upload', { method: 'POST', body: formData })
    return resp.json()
  }

  const saveSubmission = (assignId, itemId) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_save_submission')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('plugindata[files_filemanager]', itemId)
    return fetch(url.toString()).then(r => r.json())
  }

  const submitForGrading = (assignId) => {
    const url = new URL('/proxy/api', window.location.origin)
    url.searchParams.set('wstoken', token)
    url.searchParams.set('wsfunction', 'mod_assign_submit_for_grading')
    url.searchParams.set('moodlewsrestformat', 'json')
    url.searchParams.set('assignmentid', assignId)
    url.searchParams.set('acceptsubmissionstatement', 1)
    return fetch(url.toString()).then(r => r.json())
  }

  // FIX 2 & 3: Include both type=file AND type=url (Google Drive links)
  const getCourseFiles = async (courses) => {
    const items = []
    for (const c of courses) {
      try {
        const url = `/proxy/api?wstoken=${token}&wsfunction=core_course_get_contents&moodlewsrestformat=json&courseid=${c.id}`
        const sections = await fetch(url).then(r => r.json())
        if (!Array.isArray(sections)) continue
        sections.forEach(sec => {
          ;(sec.modules || []).forEach(mod => {
            ;(mod.contents || []).forEach(f => {
              // Include files (PDFs, docs etc)
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
              // FIX 3: Also include Google Drive / external URL links
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
                  url: f.fileurl, // external link, no token needed
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
    if (!courses.length) return []
    try {
      const ids = courses.map((c, i) => `courseids[${i}]=${c.id}`).join('&')
      const url = `/proxy/api?wstoken=${token}&wsfunction=mod_resource_get_resources_by_courses&moodlewsrestformat=json&${ids}`
      const data = await fetch(url).then(r => r.json())
      const resources = data.resources || []
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })
      return resources.map(r => {
        const course = courseMap[r.course] || {}
        const f = r.contentfiles?.[0] || {}
        return {
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
          url: f.fileurl ? f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + token : '',
        }
      }).filter(f => f.url)
    } catch (e) {
      console.warn('getResourceFiles error', e.message)
      return []
    }
  }

  const getUrlResources = async (courses) => {
    if (!courses.length) return []
    try {
      const ids = courses.map((c, i) => `courseids[${i}]=${c.id}`).join('&')
      const url = `/proxy/api?wstoken=${token}&wsfunction=mod_url_get_urls_by_courses&moodlewsrestformat=json&${ids}`
      const data = await fetch(url).then(r => r.json())
      const urls = data.urls || []
      const courseMap = {}
      courses.forEach(c => { courseMap[c.id] = c })
      return urls.map(u => {
        const course = courseMap[u.course] || {}
        return {
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
        }
      })
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
    uploadFileToDraft, saveSubmission, submitForGrading,
    getCourseFiles, getResourceFiles, getUrlResources, getNotifications,
  }
}
