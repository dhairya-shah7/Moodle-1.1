import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import NetworkBackground from './components/NetworkBackground'
import BottomNav from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Assignments from './pages/Assignments'
import Files from './pages/Files'
import CalendarPage from './pages/Calendar'
import Notifications from './pages/Notifications'
import Debug from './pages/Debug'
import Submissions from './pages/Submissions'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import Grades from './pages/Grades'

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth()
  return isLoggedIn ? children : <Navigate to="/" replace />
}

function FacultyRoute({ children }) {
  const { isLoggedIn, isFaculty } = useAuth()
  if (!isLoggedIn) return <Navigate to="/" replace />
  if (!isFaculty) return <Navigate to="/dashboard" replace />
  return children
}

function AdminRoute({ children }) {
  const { isLoggedIn, isAdmin } = useAuth()
  if (!isLoggedIn) return <Navigate to="/" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

function AppLayout() {
  const { isLoggedIn } = useAuth()
  const { badges } = useAppData()

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <div className="app-shell">
      <NetworkBackground />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/courses" element={<ProtectedRoute><Courses /></ProtectedRoute>} />
          <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute><Files /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/debug" element={<AdminRoute><Debug /></AdminRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/grades" element={<ProtectedRoute><Grades /></ProtectedRoute>} />
          {/* Faculty-only */}
          <Route path="/submissions" element={<FacultyRoute><Submissions /></FacultyRoute>} />
          {/* Admin-only */}
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>

      <BottomNav badges={badges || {}} />

      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: "'DM Sans',sans-serif" } }} />
    </div>
  )
}

function InnerApp() {
  return <AppDataProvider><AppLayout /></AppDataProvider>
}

export default function App() {
  useEffect(() => {
    // Disable right-click
    const handleContextMenu = (e) => e.preventDefault()
    document.addEventListener('contextmenu', handleContextMenu)

    // Disable dev tools shortcut keys
    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault()
        return false
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </BrowserRouter>
  )
}
