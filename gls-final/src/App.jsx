import React, { Component, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
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
import Profile from './pages/Profile'
import Grades from './pages/Grades'
import Submissions from './pages/Submissions'
import NotFound from './pages/NotFound'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CRITICAL SYSTEM RECOVERY]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <NotFound error={this.state.error} isCrash={true} />
    }
    return this.props.children
  }
}

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
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/grades" element={<ProtectedRoute><Grades /></ProtectedRoute>} />
          {/* Faculty-only */}
          <Route path="/submissions" element={<FacultyRoute><Submissions /></FacultyRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

      <BottomNav badges={badges || {}} />

      <Toaster 
        position="top-right" 
        toastOptions={{ 
          duration: 4000,
          style: { 
            background: 'var(--surface2)', 
            color: 'var(--text)', 
            border: '1px solid var(--border)', 
            fontFamily: "'DM Sans',sans-serif" 
          } 
        }} 
      >
        {(t) => (
          <ToastBar toast={t}>
            {({ icon, message }) => (
              <>
                {icon}
                {message}
                {t.type !== 'loading' && (
                  <button 
                    onClick={() => toast.dismiss(t.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text2)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0 4px',
                      marginLeft: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0.7,
                      transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                  >
                    ✕
                  </button>
                )}
              </>
            )}
          </ToastBar>
        )}
      </Toaster>
    </div>
  )
}

function InnerApp() {
  return <AppDataProvider><AppLayout /></AppDataProvider>
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <InnerApp />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
