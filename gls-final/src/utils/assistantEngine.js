import { daysLeft, fmt as formatDeadline, isAssignmentSubmitted } from './helpers'

function cleanSearchKeyword(rawQuery) {
  return String(rawQuery)
    .toLowerCase()
    .replace(/\b(materials|material|documents|document|resources|resource|assignments|assignment|courses|course|download|downloads|files|file|docs|doc|pdfs|pdf|ppts|ppt|notes|note|show|give|list|find|get|all|the|for|in|of|my|me|when|is|due|date|deadline|except|excluding|without|other|than|ignored|ignore|ignoreds)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function processAssistantQuery(userQuery = '', dataContext = {}) {
  const q = String(userQuery).toLowerCase().trim()
  if (!q) {
    return {
      text: "Hello! I'm your Moodle Assistant. Ask me anything about your remaining assignments, deadlines, files, or ignored tasks.",
      type: 'greeting'
    }
  }

  const {
    courses = [],
    assignments = [],
    submissions = {},
    files = [],
    ignoredAssignmentIds = [],
    hiddenCourseIds = [],
    user = {}
  } = dataContext

  const isSubmitted = (assignId, assignObj) => {
    const sub = submissions[assignId]
    return isAssignmentSubmitted(sub, assignObj)
  }

  // Check if query explicitly asks to exclude ignored assignments
  const isExcludingIgnored = 
    q.includes('except ignore') || 
    q.includes('without ignore') || 
    q.includes('not ignore') || 
    q.includes('exclude ignore') || 
    q.includes('excluding ignore') || 
    q.includes('other than ignore') || 
    q.includes('no ignore')

  // Check if query explicitly asks to view only ignored assignments
  const isExplicitIgnoredQuery = !isExcludingIgnored && (
    q.includes('show ignore') || 
    q.includes('what are ignored') || 
    q.includes('ignored assignment') || 
    q.includes('ignored list') || 
    q === 'ignored' || 
    q === 'ignored assignments'
  )

  // Active (non-ignored) assignments pool
  const activeAssignments = assignments.filter(a => !ignoredAssignmentIds.includes(a.id))

  const keyword = cleanSearchKeyword(q)

  // ── 1. Explicit Ignored Assignments Query
  if (isExplicitIgnoredQuery) {
    const ignoredList = assignments.filter(a => ignoredAssignmentIds.includes(a.id))
    if (ignoredList.length === 0) {
      return {
        text: "You haven't ignored any assignments yet! You can ignore assignments from your Assignments dashboard.",
        type: 'info'
      }
    }
    return {
      text: `You currently have ${ignoredList.length} ignored assignment${ignoredList.length > 1 ? 's' : ''}:`,
      items: ignoredList.map(a => ({
        id: a.id,
        title: a.name,
        subtitle: `${a.coursename || a.courseshort || 'Course'} • ${formatDeadline(a.duedate)}`,
        badge: 'Ignored',
        type: 'assignment'
      })),
      type: 'list'
    }
  }

  // ── 2. Submitted / Completed Assignments Query
  if (q.includes('submit') || q.includes('submitted') || q.includes('completed') || q.includes('done') || q.includes('finished')) {
    const submittedList = activeAssignments.filter(a => isSubmitted(a.id, a))
    if (submittedList.length === 0) {
      return {
        text: "You haven't submitted any active assignments yet.",
        type: 'info'
      }
    }
    return {
      text: `You have submitted ${submittedList.length} assignment${submittedList.length > 1 ? 's' : ''}:`,
      items: submittedList.map(a => ({
        id: a.id,
        title: a.name,
        subtitle: `${a.coursename || a.courseshort || 'Course'} • Submitted`,
        badge: 'Submitted',
        type: 'assignment'
      })),
      type: 'list'
    }
  }

  // ── 3. Files / Documents Query
  if (q.includes('file') || q.includes('doc') || q.includes('pdf') || q.includes('ppt') || q.includes('notes') || q.includes('material') || q.includes('download') || q.includes('resource')) {
    const matchedFiles = keyword
      ? files.filter(f => 
          f.filename?.toLowerCase().includes(keyword) || 
          f.coursename?.toLowerCase().includes(keyword) || 
          f.courseshort?.toLowerCase().includes(keyword) ||
          f.modname?.toLowerCase().includes(keyword)
        )
      : files

    if (matchedFiles.length === 0) {
      return {
        text: keyword ? `No files found matching "${keyword}". Try checking the Files page directly.` : "No course files available right now.",
        type: 'info'
      }
    }

    return {
      text: `Found ${matchedFiles.length} file${matchedFiles.length > 1 ? 's' : ''}${keyword ? ` for "${keyword}"` : ''}:`,
      items: matchedFiles.slice(0, 10).map(f => ({
        id: f.url || f.fileurl || f.filename,
        title: f.filename || f.modname,
        subtitle: `${f.coursename || f.courseshort || 'Course'} (${f.modtype || f.itemType})`,
        url: f.url || f.fileurl,
        type: 'file'
      })),
      type: 'file_list'
    }
  }

  // ── 4. Deadline / Due Dates Query (Always Excludes Ignored Assignments)
  if (q.includes('deadline') || q.includes('when is') || q.includes('due date') || q.includes('when due')) {
    const pendingDeadlines = activeAssignments
      .filter(a => !isSubmitted(a.id, a))
      .sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))

    if (pendingDeadlines.length === 0) {
      return {
        text: "🎉 You have no upcoming active deadlines! All caught up.",
        type: 'success'
      }
    }

    return {
      text: `Here are your upcoming active deadlines (excluding ignored):`,
      items: pendingDeadlines.slice(0, 8).map(a => {
        const d = daysLeft(a.duedate)
        let statusBadge = d < 0 ? 'Overdue' : d === 0 ? 'Due Today' : d === 1 ? 'Due Tomorrow' : `${d}d left`
        return {
          id: a.id,
          title: a.name,
          subtitle: `${a.coursename || a.courseshort || 'Course'} • ${formatDeadline(a.duedate)}`,
          badge: statusBadge,
          type: 'assignment'
        }
      }),
      type: 'list'
    }
  }

  // ── 5. General / Keyword / Remaining Assignments Query
  if (q.includes('assignment') || q.includes('task') || q.includes('remain') || q.includes('pending') || q.includes('todo') || q.includes('incomplete') || q.includes('what to do') || keyword.length > 0) {
    const pool = keyword
      ? activeAssignments.filter(a => 
          a.name?.toLowerCase().includes(keyword) || 
          a.coursename?.toLowerCase().includes(keyword) || 
          a.courseshort?.toLowerCase().includes(keyword)
        )
      : activeAssignments.filter(a => !isSubmitted(a.id, a))

    const pendingList = pool.sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))

    if (pendingList.length === 0) {
      return {
        text: keyword ? `No active assignments found matching "${keyword}".` : "🎉 You have no pending active assignments!",
        type: 'info'
      }
    }

    return {
      text: keyword ? `Found ${pendingList.length} assignment${pendingList.length > 1 ? 's' : ''} matching "${keyword}" (excluding ignored):` : `You have ${pendingList.length} active assignment${pendingList.length > 1 ? 's' : ''} (excluding ignored):`,
      items: pendingList.slice(0, 10).map(a => {
        const d = daysLeft(a.duedate)
        const sub = isSubmitted(a.id, a)
        let statusBadge = sub ? 'Submitted' : (d < 0 ? 'Overdue' : d === 0 ? 'Due Today' : d === 1 ? 'Due Tomorrow' : `${d}d left`)
        return {
          id: a.id,
          title: a.name,
          subtitle: `${a.coursename || a.courseshort || 'Course'} • ${formatDeadline(a.duedate)}`,
          badge: statusBadge,
          type: 'assignment'
        }
      }),
      type: 'list'
    }
  }

  // ── 6. Hidden Courses Query
  if (q.includes('hidden course') || q.includes('hidden courses')) {
    const hiddenList = courses.filter(c => hiddenCourseIds.includes(c.id))
    if (hiddenList.length === 0) {
      return {
        text: "You haven't hidden any courses from your dashboard.",
        type: 'info'
      }
    }
    return {
      text: `You have ${hiddenList.length} hidden course${hiddenList.length > 1 ? 's' : ''}:`,
      items: hiddenList.map(c => ({
        id: c.id,
        title: c.fullname,
        subtitle: c.shortname,
        badge: 'Hidden',
        type: 'course'
      })),
      type: 'list'
    }
  }

  // ── 7. Fallback Guided Response
  return {
    text: "I didn't quite catch that. Here are some things you can ask me:",
    suggestions: [
      "📋 Assignments except ignored",
      "⏰ Upcoming deadlines",
      "📁 PPL course files",
      "🚫 Show ignored assignments"
    ],
    type: 'help'
  }
}
