import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Folder,
  Calendar as CalendarIcon,
  Bell,
  Settings,
  LogOut,
  User,
  Trophy,
  Sun,
  Moon,
  Search,
  ChevronUp,
  Inbox,
  Heart,
  HelpCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { truncate } from '../utils/helpers'
import { useTheme } from '../hooks/useTheme'
import toast from 'react-hot-toast'

const MOODLE = 'https://btech.glsmoodle.in'

const NAV_BY_ROLE = {
  student: {
    primary: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/courses', icon: BookOpen, label: 'Courses' },
      { to: '/assignments', icon: FileText, label: 'Assignments', badgeKey: 'assign' },
      { to: '/calendar', icon: CalendarIcon, label: 'Calendar' },
    ],
    more: [
      { to: '/notifications', icon: Bell, label: 'Notifications', badgeKey: 'notif' },
      { to: '/grades', icon: Trophy, label: 'My Grades' },
      { to: '/profile', icon: User, label: 'Profile' },
      { to: 'https://btech.glsmoodle.in/user/preferences.php', icon: Settings, label: 'Moodle Prefs', external: true },
      { to: '/debug', icon: Search, label: 'Diagnostics', adminOnly: true },
    ],
  },
  faculty: {
    primary: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/courses', icon: BookOpen, label: 'Courses' },
      { to: '/assignments', icon: FileText, label: 'Assignments' },
      { to: '/submissions', icon: Inbox, label: 'Submissions' },
    ],
    more: [
      { to: '/calendar', icon: CalendarIcon, label: 'Calendar' },
      { to: '/notifications', icon: Bell, label: 'Notifications', badgeKey: 'notif' },
      { to: '/grades', icon: Trophy, label: 'Gradebook' },
      { to: '/profile', icon: User, label: 'Profile' },
      { to: 'https://btech.glsmoodle.in/user/preferences.php', icon: Settings, label: 'Moodle Prefs', external: true },
      { to: '/debug', icon: Search, label: 'Diagnostics', adminOnly: true },
    ],
  },
  admin: {
    primary: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/courses', icon: BookOpen, label: 'Courses' },
      { to: '/assignments', icon: FileText, label: 'Assignments' },
      { to: '/submissions', icon: Inbox, label: 'Submissions' },
    ],
    more: [
      { to: '/calendar', icon: CalendarIcon, label: 'Calendar' },
      { to: '/notifications', icon: Bell, label: 'Notifications', badgeKey: 'notif' },
      { to: '/grades', icon: Trophy, label: 'Gradebook' },
      { to: '/profile', icon: User, label: 'Profile' },
      { to: '/admin', icon: Settings, label: 'Site Admin' },
      { to: 'https://btech.glsmoodle.in/user/preferences.php', icon: Settings, label: 'Moodle Prefs', external: true },
      { to: '/debug', icon: Search, label: 'Diagnostics', adminOnly: true },
    ],
  },
}

const ROLE_COLORS = {
  student: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Student' },
  faculty: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'Faculty' },
  admin: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Admin' },
}

export default function Sidebar({ badges = {} }) {
  const { user, logout, isAdmin, isFaculty } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useRef(null)
  const moreBtnRef = useRef(null)
  const [showFaq, setShowFaq] = useState(false)
  const [faqMessage, setFaqMessage] = useState('')
  const [faqSending, setFaqSending] = useState(false)
  const [faqSuccess, setFaqSuccess] = useState(false)
  const [notifPermission, setNotifPermission] = useState(() => typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const [likesCount, setLikesCount] = useState(0)
  const [hasLiked, setHasLiked] = useState(false)
  const [liking, setLiking] = useState(false)

  const isTargetAdminUser = user?.username?.toLowerCase() === 'a24cse057'

  useEffect(() => {
    if (!user?.username) return
    fetch(`/proxy/likes?target=a24cse057&user=${encodeURIComponent(user?.username || '')}`)
      .then(r => r.json())
      .then(data => {
        if (data.count !== undefined) setLikesCount(data.count)
        if (data.hasLiked !== undefined) setHasLiked(data.hasLiked)
      })
      .catch(e => console.error('Failed to load likes in Sidebar', e))
  }, [user?.username])

  const handleLike = async (e) => {
    e.stopPropagation()
    if (hasLiked || liking || !user?.username) return
    setLiking(true)
    try {
      const res = await fetch('/proxy/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ likedBy: user.username, targetUser: 'a24cse057' })
      }).then(r => r.json())

      if (res.success) {
        setHasLiked(true)
        setLikesCount(res.count)
        toast.success('Liked! ❤️')
      }
    } catch (e) {
      toast.error('Failed to record like')
    }
    setLiking(false)
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }

    const onMouseDown = (event) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target)) {
        if (moreBtnRef.current && moreBtnRef.current.contains(event.target)) {
          return
        }
        setSheetOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  const initials = (user?.lastname || user?.fullname || 'U')[0].toUpperCase()
  const dispName = truncate(user?.fullname || user?.lastname || '', 20)
  const dispId = truncate(user?.username || '', 18)
  const roleKey = isAdmin ? 'admin' : isFaculty ? 'faculty' : 'student'
  const navSet = NAV_BY_ROLE[roleKey]
  const roleStyle = ROLE_COLORS[roleKey] || ROLE_COLORS.student
  const visibleMoreItems = navSet.more.filter((item) => !item.adminOnly || isAdmin)

  return (
    <>
      {/* Backdrop & Navigation */}
      {sheetOpen && <div className="bottom-nav__backdrop" onClick={() => setSheetOpen(false)} />}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <div className="bottom-nav__items" role="tablist" aria-label="Navigation tabs">
          {navSet.primary.map(({ to, icon: Icon, label, badgeKey }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav__item${isActive ? ' active' : ''}`} onClick={() => setSheetOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
              {badgeKey && badges[badgeKey] > 0 && <em>{badges[badgeKey]}</em>}
            </NavLink>
          ))}

          <button ref={moreBtnRef} type="button" className={`bottom-nav__item${sheetOpen ? ' active' : ''}`} onClick={() => setSheetOpen((value) => !value)} aria-expanded={sheetOpen} aria-controls="bottom-nav-sheet">
            <ChevronUp size={18} />
            <span>More</span>
          </button>
        </div>
      </nav>

      <div id="bottom-nav-sheet" className={`bottom-nav__sheet${sheetOpen ? ' open' : ''}`} ref={sheetRef} aria-hidden={!sheetOpen}>
        <div className="bottom-nav__sheet-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
            <div className="bottom-nav__avatar" style={{ flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="bottom-nav__name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{user?.fullname}</span>
                {isTargetAdminUser ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0
                  }}>
                    <Heart size={13} fill="#ef4444" color="#ef4444" />
                    <span>{likesCount} {likesCount === 1 ? 'Like' : 'Likes'}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLike}
                    disabled={hasLiked || liking}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 12, cursor: hasLiked ? 'default' : 'pointer',
                      background: hasLiked ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface3)',
                      border: `1px solid ${hasLiked ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`,
                      color: hasLiked ? '#ef4444' : 'var(--text2)',
                      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s', flexShrink: 0,
                      opacity: liking ? 0.6 : 1
                    }}
                    title={hasLiked ? 'You have already liked' : 'Click to send a heart'}
                  >
                    <Heart size={13} fill={hasLiked ? '#ef4444' : 'none'} color={hasLiked ? '#ef4444' : 'currentColor'} />
                    <span>{hasLiked ? 'Liked' : 'Like'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFaq(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 12, cursor: 'pointer',
                    background: 'var(--surface3)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease', flexShrink: 0
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface3)'}
                  title="FAQ & Support Help"
                >
                  <HelpCircle size={13} />
                  <span>FAQ</span>
                </button>
              </div>
              <div className="bottom-nav__meta">{dispId}</div>
              <div className="bottom-nav__role">{roleStyle.label}</div>
            </div>
          </div>
        </div>

        <div className="bottom-nav__sheet-grid">
          {visibleMoreItems.map(({ to, icon: Icon, label, badgeKey, external }) => {
            if (external) {
              return (
                <a key={to} href={to} target="_blank" rel="noopener noreferrer" className="bottom-nav__sheet-item" onClick={() => setSheetOpen(false)}>
                  <Icon size={16} />
                  <span>{label}</span>
                </a>
              )
            }
            return (
              <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav__sheet-item${isActive ? ' active' : ''}`} onClick={() => setSheetOpen(false)}>
                <Icon size={16} />
                <span>{label}</span>
                {badgeKey && badges[badgeKey] > 0 && <em>{badges[badgeKey]}</em>}
              </NavLink>
            )
          })}
        </div>

        {/* Device Notifications Enablement */}
        <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {typeof Notification === 'undefined' && (
            <div style={{
              width: '100%',
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.15)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '10px',
              fontSize: 12,
              fontWeight: 500,
              textAlign: 'center',
              lineHeight: 1.4
            }}>
              {/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
                ? '📱 To enable mobile alerts on iOS, tap the share icon in Safari and select "Add to Home Screen".'
                : '⚠️ Notifications are not supported on this browser/device.'}
            </div>
          )}
          {typeof Notification !== 'undefined' && notifPermission === 'denied' && (
            <div style={{
              width: '100%',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444',
              borderRadius: 12,
              padding: '10px',
              fontSize: 12,
              fontWeight: 500,
              textAlign: 'center',
              lineHeight: 1.4
            }}>
              ⚠️ Notifications blocked. Please reset site permissions in your browser settings to enable alerts.
            </div>
          )}
          {typeof Notification !== 'undefined' && notifPermission === 'default' && (
            <button
              type="button"
              onClick={async () => {
                let permission
                try {
                  permission = await Notification.requestPermission()
                } catch (e) {
                  permission = await new Promise((resolve) => {
                    Notification.requestPermission(resolve)
                  })
                }
                setNotifPermission(permission)
                if (permission === 'granted') {
                  if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.ready
                    reg.showNotification('Moodle 1.1', {
                      body: 'Device notifications successfully enabled!',
                      icon: '/logo192.png'
                    })
                  } else {
                    new Notification('Moodle 1.1', {
                      body: 'Device notifications successfully enabled!',
                      icon: '/logo192.png'
                    })
                  }
                }
              }}
              style={{
                width: '100%',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-bd)',
                color: 'var(--accent)',
                borderRadius: 12,
                padding: '10px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              🔔 Enable Device Notifications
            </button>
          )}
          {typeof Notification !== 'undefined' && notifPermission === 'granted' && (
            <div style={{
              width: '100%',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: '#10b981',
              borderRadius: 12,
              padding: '10px',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center'
            }}>
              ✓ Device Notifications Active
            </div>
          )}
        </div>

        <div className="bottom-nav__sheet-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="bottom-nav__theme-toggle" type="button" onClick={toggle} style={{ width: '100%' }}>
            {isDark ? <><Moon size={16} /> Dark</> : <><Sun size={16} /> Light</>}
          </button>
          <button type="button" onClick={() => { setSheetOpen(false); logout(); navigate('/') }} className="danger" style={{ width: '100%' }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* FAQ Overlay Modal */}
      {showFaq && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }} onClick={() => setShowFaq(false)}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            width: '100%',
            maxWidth: 480,
            padding: 24,
            position: 'relative',
            boxShadow: 'var(--shadow-lg)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>FAQ & Support Help</div>
              <button type="button" onClick={() => { setShowFaq(false); setFaqSuccess(false); setFaqMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>❓ How do I submit an assignment?</div>
                <div style={{ color: 'var(--text2)' }}>Click on the assignment from the Dashboard or Assignments page, select your files, and click "Upload and Submit".</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>❓ How do I hide a course from my view?</div>
                <div style={{ color: 'var(--text2)' }}>Click the trash icon in the top right corner of the Course Card. It can be restored at any time from your Profile settings.</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>❓ Can I access files offline?</div>
                <div style={{ color: 'var(--text2)' }}>Yes, any files or external links you open are cached on your browser so you can view them later.</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>❓ How do I enable device notifications?</div>
                <div style={{ color: 'var(--text2)' }}>Click "Enable Device Notifications" in the menu to get alerts about new files and deadlines.</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Send Support Message / Inquiry</div>
              {faqSuccess ? (
                <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 10, padding: 12, color: 'var(--success)', fontSize: 13, textAlign: 'center' }}>
                  ✓ Message sent successfully to support!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <textarea
                    placeholder="Describe your issue or request here..."
                    value={faqMessage}
                    onChange={e => setFaqMessage(e.target.value)}
                    style={{
                      width: '100%',
                      height: 80,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      color: 'var(--text)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      resize: 'none'
                    }}
                  />
                  <button
                    type="button"
                    disabled={faqSending || !faqMessage.trim()}
                    onClick={async () => {
                      setFaqSending(true)
                      try {
                        const res = await fetch('/proxy/feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            wstoken: localStorage.getItem('moodle_token') || '',
                            username: user?.username || 'Anonymous',
                            message: faqMessage
                          })
                        }).then(r => r.json())
                        if (res && res.success) {
                          setFaqSuccess(true)
                        } else {
                          alert('Failed to send inquiry. Please try again.')
                        }
                      } catch (e) {
                        alert('An error occurred while sending.')
                      }
                      setFaqSending(false)
                    }}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: (faqSending || !faqMessage.trim()) ? 0.6 : 1
                    }}
                  >
                    {faqSending ? 'Sending Inquiry...' : 'Send Inquiry'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}