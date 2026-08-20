import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Home, RotateCcw, Lock } from 'lucide-react'

export default function NotFound({ error, isCrash = false }) {
  let navigate = null
  try {
    navigate = useNavigate()
  } catch (e) {}

  const handleGoHome = () => {
    if (navigate) {
      navigate('/dashboard')
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="not-found-container" style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <div style={{
        maxWidth: 520,
        width: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '36px 28px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow effect background */}
        <div style={{
          position: 'absolute',
          top: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none',
          borderRadius: '50%'
        }} />

        {/* Icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#ef4444'
        }}>
          <ShieldAlert size={36} />
        </div>

        {/* Status */}
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#ef4444',
          marginBottom: 8
        }}>
          {isCrash ? 'System Recovery Mode' : '404 Error'}
        </div>

        <h1 style={{
          fontSize: 26,
          fontWeight: 800,
          color: 'var(--text)',
          marginBottom: 12,
          lineHeight: 1.2
        }}>
          {isCrash ? 'Service Temporarily Unavailable' : 'Page Not Found'}
        </h1>

        <p style={{
          fontSize: 14,
          color: 'var(--text2)',
          lineHeight: 1.6,
          marginBottom: 24
        }}>
          {isCrash
            ? 'An unexpected error occurred in your current session. The system safety protocol has safely isolated the session.'
            : 'The requested page URL does not exist or access has been restricted by system security protocols.'}
        </p>

        {error && (
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 24,
            textAlign: 'left',
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--danger)',
            wordBreak: 'break-word',
            maxHeight: 100,
            overflowY: 'auto'
          }}>
            {String(error.message || error)}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 28
        }}>
          <button
            onClick={handleGoHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Home size={16} /> Go to Dashboard
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <RotateCcw size={16} /> Reload Page
          </button>
        </div>

        {/* Security Footer Badge */}
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text3)'
        }}>
          <Lock size={12} color="var(--text3)" />
          <span>GLS University Moodle 1.1 • Protected Session</span>
        </div>
      </div>
    </div>
  )
}
