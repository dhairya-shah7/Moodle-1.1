import { daysLeft, fmt as formatDeadline, isAssignmentSubmitted } from './helpers'

const ACRONYM_MAP = {
  'ppl': ['ppl', 'programming language', 'principle of programming languages'],
  'divp': ['divp', 'digital image', 'video processing', 'image processing'],
  'cd': ['compiler', 'compiler design', 'cd'],
  'os': ['operating system', 'os'],
  'cn': ['computer network', 'network', 'cn'],
  'dbms': ['database', 'dbms', 'sql'],
  'wt': ['web technology', 'web tech', 'wt'],
  'ai': ['artificial intelligence', 'ai'],
  'ml': ['machine learning', 'ml']
}

function cleanSearchKeyword(rawQuery) {
  return String(rawQuery)
    .toLowerCase()
    .replace(/\b(materials|material|documents|document|resources|resource|assignments|assignment|courses|course|download|downloads|files|file|docs|doc|pdfs|pdf|ppts|ppt|notes|note|show|give|list|find|get|all|the|for|in|of|my|me|when|is|due|date|deadline|except|excluding|without|other|than|ignored|ignore|ignoreds|today|tomorrow|overdue|late|this|week|soon)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesSearch(text = '', queryTerm = '') {
  if (!text || !queryTerm) return false
  const lowerText = String(text).toLowerCase()
  const lowerTerm = String(queryTerm).toLowerCase()

  if (lowerText.includes(lowerTerm)) return true

  // Check acronym expansion
  for (const [acronym, terms] of Object.entries(ACRONYM_MAP)) {
    if (lowerTerm === acronym || terms.some(t => lowerTerm.includes(t))) {
      if (terms.some(t => lowerText.includes(t)) || lowerText.includes(acronym)) {
        return true
      }
    }
  }
  return false
}

export function processAssistantQuery(userQuery = '', dataContext = {}) {
  const q = String(userQuery).toLowerCase().trim()

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

  // ── 0. Conversational Greetings & Gratitude
  if (!q || q === 'hi' || q === 'hello' || q === 'hey' || q === 'yo' || q.includes('who are you') || q.includes('what can you do') || q.includes('help')) {
    return {
      text: `Hello ${user?.firstname || ''}! I'm your Moodle Assistant. Ask me about remaining assignments, deadlines, files, or overall progress!`,
      suggestions: [
        "📋 Assignments except ignored",
        "⏰ What's due today or tomorrow?",
        "📁 PPL / DIVP course files",
        "📊 Summary of my progress"
      ],
      type: 'greeting'
    }
  }

  if (q.includes('thank') || q.includes('thanks') || q.includes('great') || q.includes('awesome')) {
    return {
      text: "You're very welcome! Happy to help you stay ahead in your courses. Let me know if you need anything else! 😊",
      type: 'info'
    }
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

  // ── 1. Academic Summary & Overview Query
  if (q.includes('summary') || q.includes('overview') || q.includes('stats') || q.includes('progress') || q.includes('how am i doing') || q.includes('dashboard')) {
    const pendingCount = activeAssignments.filter(a => !isSubmitted(a.id, a)).length
    const overdueCount = activeAssignments.filter(a => !isSubmitted(a.id, a) && daysLeft(a.duedate) < 0).length
    const dueSoonCount = activeAssignments.filter(a => !isSubmitted(a.id, a) && daysLeft(a.duedate) >= 0 && daysLeft(a.duedate) <= 7).length
    const submittedCount = activeAssignments.filter(a => isSubmitted(a.id, a)).length

    return {
      text: `📊 Here is your Academic Snapshot:\n• ⏳ Pending: ${pendingCount}\n• 🚨 Overdue: ${overdueCount}\n• ⏰ Due Soon: ${dueSoonCount}\n• ✅ Submitted: ${submittedCount}\n• 📁 Course Files: ${files.length}`,
      suggestions: [
        "📋 Show pending assignments",
        "⏰ Show upcoming deadlines",
        "📁 Browse course files"
      ],
      type: 'info'
    }
  }

  // ── 2. Time-Based Queries ("due today", "due tomorrow", "overdue", "this week")
  if (q.includes('today') || q.includes('tomorrow') || q.includes('overdue') || q.includes('this week') || q.includes('urgent')) {
    let filtered = activeAssignments.filter(a => !isSubmitted(a.id, a))
    let timeLabel = "upcoming urgent"

    if (q.includes('today')) {
      filtered = filtered.filter(a => daysLeft(a.duedate) === 0)
      timeLabel = "due today"
    } else if (q.includes('tomorrow')) {
      filtered = filtered.filter(a => daysLeft(a.duedate) === 1)
      timeLabel = "due tomorrow"
    } else if (q.includes('overdue')) {
      filtered = filtered.filter(a => daysLeft(a.duedate) < 0)
      timeLabel = "overdue"
    } else if (q.includes('this week') || q.includes('soon')) {
      filtered = filtered.filter(a => daysLeft(a.duedate) >= 0 && daysLeft(a.duedate) <= 7)
      timeLabel = "due this week"
    }

    if (filtered.length === 0) {
      return {
        text: `🎉 Good news! You have no assignments ${timeLabel}.`,
        type: 'success'
      }
    }

    return {
      text: `Found ${filtered.length} assignment${filtered.length > 1 ? 's' : ''} ${timeLabel}:`,
      items: filtered.map(a => {
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

  // ── 3. Explicit Ignored Assignments Query
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

  // ── 4. Submitted / Completed Assignments Query
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

  // ── 5. Files / Documents Query (with Fuzzy Acronym Search)
  if (q.includes('file') || q.includes('doc') || q.includes('pdf') || q.includes('ppt') || q.includes('notes') || q.includes('material') || q.includes('download') || q.includes('resource')) {
    const matchedFiles = keyword
      ? files.filter(f => 
          matchesSearch(f.filename, keyword) || 
          matchesSearch(f.coursename, keyword) || 
          matchesSearch(f.courseshort, keyword) ||
          matchesSearch(f.modname, keyword)
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

  // ── 6. Deadline / Due Dates Query
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

  // ── 7. Topic / Subject / Keyword Matching (Fuzzy Acronym & Name)
  if (keyword.length > 0) {
    const matchedAssignments = activeAssignments.filter(a => 
      matchesSearch(a.name, keyword) || 
      matchesSearch(a.coursename, keyword) || 
      matchesSearch(a.courseshort, keyword)
    )

    const matchedCourseFiles = files.filter(f => 
      matchesSearch(f.filename, keyword) || 
      matchesSearch(f.coursename, keyword) || 
      matchesSearch(f.courseshort, keyword)
    )

    if (matchedAssignments.length > 0 || matchedCourseFiles.length > 0) {
      const combinedItems = [
        ...matchedAssignments.map(a => ({
          id: a.id,
          title: a.name,
          subtitle: `Assignment • ${a.courseshort || 'Course'}`,
          badge: isSubmitted(a.id, a) ? 'Submitted' : 'Pending',
          type: 'assignment'
        })),
        ...matchedCourseFiles.slice(0, 5).map(f => ({
          id: f.url || f.fileurl || f.filename,
          title: f.filename || f.modname,
          subtitle: `File • ${f.courseshort || 'Course'}`,
          url: f.url || f.fileurl,
          type: 'file'
        }))
      ]

      return {
        text: `Found results for "${keyword}" (excluding ignored):`,
        items: combinedItems,
        type: 'list'
      }
    }
  }

  // ── 8. General Active Assignments List
  if (q.includes('assignment') || q.includes('task') || q.includes('remain') || q.includes('pending') || q.includes('todo') || q.includes('incomplete') || q.includes('what to do')) {
    const pendingList = activeAssignments
      .filter(a => !isSubmitted(a.id, a))
      .sort((a, b) => (a.duedate || 999999999) - (b.duedate || 999999999))

    if (pendingList.length === 0) {
      return {
        text: "🎉 You have no pending active assignments!",
        type: 'info'
      }
    }

    return {
      text: `You have ${pendingList.length} active assignment${pendingList.length > 1 ? 's' : ''} (excluding ignored):`,
      items: pendingList.slice(0, 10).map(a => {
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

  // ── 9. Fallback Guided Response
  return {
    text: "I didn't quite catch that. Here are some things you can ask me:",
    suggestions: [
      "📋 Assignments except ignored",
      "⏰ What's due today or tomorrow?",
      "📊 Summary of my progress",
      "📁 PPL / DIVP course files"
    ],
    type: 'help'
  }
}
