import { useState, useEffect, useRef } from 'react'
import { Layout, Book, Clock, AlertCircle, FileCheck, CheckCircle2, Sparkles, Files, GraduationCap, Calendar, FileText } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { truncate, daysLeft, getFormattedDate, fmt } from '../utils/helpers'
import AssignmentItem from '../components/AssignmentItem'
import Spinner from '../components/Spinner'
import { useNavigate } from 'react-router-dom'

function DinoGame({ user }) {
  const canvasRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('moodle_dino_high_score') || '0')
    } catch (e) {
      return 0
    }
  })

  // Leaderboard data
  const basePlayers = [
    { name: 'Yash Patel', score: 980 },
    { name: 'Dev Shah', score: 750 },
    { name: 'Priyansh', score: 420 },
    { name: 'Riya', score: 210 }
  ]

  const getLeaderboard = () => {
    const list = [...basePlayers, { name: user?.fullname || 'You', score: highScore, isUser: true }]
    return list.sort((a, b) => b.score - a.score).slice(0, 5)
  }

  const leaderboard = getLeaderboard()

  // Game ref variables to avoid state-refresh delays in loop
  const gameRef = useRef({
    dinoY: 0,
    dinoVy: 0,
    obstacles: [],
    frame: 0,
    speed: 5,
    score: 0,
    isPlaying: false
  })

  useEffect(() => {
    gameRef.current.isPlaying = isPlaying
  }, [isPlaying])

  // Key jump handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        triggerJump()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, gameOver])

  const triggerJump = () => {
    if (gameOver) {
      restartGame()
      return
    }
    if (!isPlaying) {
      setIsPlaying(true)
      return
    }
    const state = gameRef.current
    if (state.dinoY === 0) {
      state.dinoVy = -11 // Jump impulse
    }
  }

  const restartGame = () => {
    const state = gameRef.current
    state.dinoY = 0
    state.dinoVy = 0
    state.obstacles = []
    state.frame = 0
    state.speed = 5
    state.score = 0
    setScore(0)
    setGameOver(false)
    setIsPlaying(true)
  }

  // Loop
  useEffect(() => {
    let animationId
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const loop = () => {
      const state = gameRef.current
      
      // Update sizes dynamically matching the parent element width
      const width = canvas.width = canvas.parentElement.clientWidth || 300
      const height = canvas.height = 130
      
      // Clear
      ctx.clearRect(0, 0, width, height)

      // Draw Ground
      ctx.strokeStyle = '#444b5a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, height - 15)
      ctx.lineTo(width, height - 15)
      ctx.stroke()

      if (state.isPlaying && !gameOver) {
        state.frame++
        // Score based on frames
        if (state.frame % 5 === 0) {
          state.score++
          setScore(state.score)
        }

        // Increase speed slowly
        if (state.frame % 300 === 0) {
          state.speed += 0.5
        }

        // Apply physics
        state.dinoY += state.dinoVy
        state.dinoVy += 0.65 // Gravity
        if (state.dinoY > 0) {
          state.dinoY = 0
          state.dinoVy = 0
        }

        // Spawn obstacles
        const lastObstacle = state.obstacles[state.obstacles.length - 1]
        if (!lastObstacle || (width - lastObstacle.x > 200 + Math.random() * 150)) {
          if (Math.random() < 0.02) {
            state.obstacles.push({
              x: width,
              width: 15 + Math.random() * 10,
              height: 20 + Math.random() * 15
            })
          }
        }

        // Move obstacles and check collisions
        state.obstacles = state.obstacles.filter(obs => {
          obs.x -= state.speed
          
          // Collision check
          const dinoX = 30
          const dinoW = 20
          const dinoH = 26
          const dinoBottom = height - 15 - state.dinoY
          const dinoTop = dinoBottom - dinoH

          const obsX = obs.x
          const obsW = obs.width
          const obsH = obs.height
          const obsBottom = height - 15
          const obsTop = obsBottom - obsH

          const collides = (
            dinoX < obsX + obsW &&
            dinoX + dinoW > obsX &&
            dinoTop < obsBottom &&
            dinoBottom > obsTop
          )

          if (collides) {
            setGameOver(true)
            setIsPlaying(false)
            setHighScore(prev => {
              const next = Math.max(prev, state.score)
              localStorage.setItem('moodle_dino_high_score', String(next))
              return next
            })
          }

          return obs.x + obs.width > 0
        })
      }

      // Draw Dino (Pixel Dino Shape)
      const dinoX = 30
      const dinoW = 20
      const dinoH = 26
      const dinoBottom = height - 15 - state.dinoY
      const dinoTop = dinoBottom - dinoH

      ctx.fillStyle = '#6366f1' // var(--accent)
      // Draw body
      ctx.fillRect(dinoX, dinoTop + 6, dinoW - 4, dinoH - 8)
      // Draw head
      ctx.fillRect(dinoX + 6, dinoTop, 10, 8)
      // Draw snout
      ctx.fillRect(dinoX + 12, dinoTop + 2, 6, 4)
      // Draw tail
      ctx.fillRect(dinoX - 4, dinoTop + 8, 4, 8)
      // Draw legs
      const walk = Math.floor(state.frame / 6) % 2
      if (state.dinoY < 0) {
        // jumping legs
        ctx.fillRect(dinoX + 2, dinoBottom - 2, 4, 3)
        ctx.fillRect(dinoX + 10, dinoBottom - 2, 4, 3)
      } else {
        ctx.fillRect(dinoX + 2, dinoBottom - 2, 4, walk === 0 ? 3 : 1)
        ctx.fillRect(dinoX + 10, dinoBottom - 2, 4, walk === 1 ? 3 : 1)
      }

      // Draw Obstacles (Cacti/Books)
      ctx.fillStyle = '#f59e0b' // var(--warning)
      state.obstacles.forEach(obs => {
        const obsBottom = height - 15
        const obsTop = obsBottom - obs.height
        // Draw main stem
        ctx.fillRect(obs.x, obsTop, obs.width, obs.height)
        // Draw left arm
        ctx.fillRect(obs.x - 4, obsTop + 6, 4, obs.height - 12)
        ctx.fillRect(obs.x - 4, obsTop + 6, obs.width + 4, 4)
        // Draw right arm
        ctx.fillRect(obs.x + obs.width, obsTop + 8, 4, obs.height - 14)
        ctx.fillRect(obs.x, obsTop + 8, obs.width + 4, 4)
      })

      // If game is idle, draw overlay
      if (!state.isPlaying && !gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px Inter,sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Press SPACE or CLICK to Start Game', width / 2, height / 2)
      }

      // If game over, draw game over screen
      if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#ef4444' // var(--danger)
        ctx.font = 'bold 16px Space Grotesk,sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('GAME OVER', width / 2, height / 2 - 10)
        ctx.fillStyle = '#fff'
        ctx.font = '11px Inter,sans-serif'
        ctx.fillText(`Score: ${state.score}  |  Press Space or Click to Restart`, width / 2, height / 2 + 15)
      }

      animationId = requestAnimationFrame(loop)
    }

    loop()

    return () => cancelAnimationFrame(animationId)
  }, [isPlaying, gameOver])

  const getMedal = (index) => {
    if (index === 0) return '🥇 '
    if (index === 1) return '🥈 '
    if (index === 2) return '🥉 '
    return `${index + 1}. `
  }

  return (
    <div className="dino-game-container">
      {/* Game Area */}
      <div 
        onClick={triggerJump} 
        style={{ 
          background: 'var(--surface2)', 
          border: '1px solid var(--border)', 
          borderRadius: 14, 
          overflow: 'hidden', 
          position: 'relative', 
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
        <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 11, borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)' }}>
          <span>Score: <strong>{score}</strong></span>
          <span>Personal Best: <strong>{highScore}</strong></span>
        </div>
      </div>

      {/* Leaderboard */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          🏆 Leaderboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
          {leaderboard.map((player, index) => (
            <div 
              key={index} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: 12, 
                color: player.isUser ? 'var(--accent)' : 'var(--text2)',
                fontWeight: player.isUser ? 700 : 500
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                {getMedal(index)}{player.name}
              </span>
              <span style={{ fontWeight: 700 }}>{player.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { courses, assignments, submissions, files, loading, user, ignoredAssignmentIds = [], calendarEvents = [] } = useAppData()
  const navigate = useNavigate()

  const soon = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => { const d = daysLeft(a.duedate); return d >= 0 && d <= 7 })

  const pending = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => {
      const sub = submissions[a.id]
      return sub?.lastattempt?.submission?.status !== 'submitted'
    })

  const upcoming = assignments
    .filter(a => !ignoredAssignmentIds.includes(a.id))
    .filter(a => a.duedate && daysLeft(a.duedate) >= 0)
    .filter(a => submissions[a.id]?.lastattempt?.submission?.status !== 'submitted')
    .slice(0, 5)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="page-title">Dashboard</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{getFormattedDate()}</div>
      </div>
      <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Welcome back, {truncate(user?.lastname || user?.fullname || '', 20)}!
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap blue"><GraduationCap size={20} /></div>
          <div>
            <div className="stat-label">Courses</div>
            <div className="stat-value blue">{courses.length || '—'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap cyan"><Clock size={20} /></div>
          <div>
            <div className="stat-label">Pending</div>
            <div className="stat-value cyan">{loading ? '—' : pending.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap orange"><AlertCircle size={20} /></div>
          <div>
            <div className="stat-label">Due Soon</div>
            <div className="stat-value orange">{loading ? '—' : soon.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap purple"><Files size={20} /></div>
          <div>
            <div className="stat-label">Files</div>
            <div className="stat-value purple">{files.length || '—'}</div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card-panel">
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} className="text-cyan" />
              <span className="section-title">Pending Submissions</span>
            </div>
          </div>
          {loading ? <Spinner text="" /> : upcoming.length
            ? <div className="assign-list">
                {upcoming.map(a => (
                  <AssignmentItem 
                    key={a.id} 
                    assignment={a} 
                    compact 
                    onClick={() => navigate('/assignments', { state: { openAssignmentId: a.id } })} 
                  />
                ))}
              </div>
            : <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CheckCircle2 size={32} className="text-accent" style={{ opacity: 0.5 }} />
                <span>All assignments caught up!</span>
              </div>
          }
        </div>
        <div className="card-panel">
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} className="text-blue" />
              <span className="section-title">Moodle Dino Jump & Scoreboard</span>
            </div>
          </div>
          {loading ? (
            <Spinner text="" />
          ) : (
            <DinoGame user={user} />
          )}
        </div>
      </div>
    </div>
  )
}
