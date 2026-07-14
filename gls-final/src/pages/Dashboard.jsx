import { useState, useEffect, useRef } from 'react'
import { Layout, Book, Clock, AlertCircle, FileCheck, CheckCircle2, Sparkles, Files, GraduationCap, Calendar, FileText } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { truncate, daysLeft, getFormattedDate, fmt } from '../utils/helpers'
import AssignmentItem from '../components/AssignmentItem'
import Spinner from '../components/Spinner'
import { useNavigate } from 'react-router-dom'

const dinoRun = [
  [
    "00011110",
    "00111111",
    "00111100",
    "01111100",
    "11111111",
    "00101100",
    "00101100",
    "01100110"
  ],
  [
    "00011110",
    "00111111",
    "00111100",
    "01111100",
    "11111111",
    "00110010",
    "00110010",
    "01100011"
  ]
]

const dinoDuck = [
  "0001111000",
  "0011111100",
  "1111111111",
  "1111111111",
  "0011000000"
]

const cactusSmall = [
  "010",
  "010",
  "111",
  "010",
  "010",
  "010"
]

const cactusBig = [
  "01010",
  "01010",
  "11111",
  "01010",
  "01010",
  "01010",
  "01010"
]

const birdFrames = [
  [
    "01000010",
    "10111101",
    "01111110",
    "00111100"
  ],
  [
    "00000000",
    "01111110",
    "11111111",
    "00111100"
  ]
]

function drawPixels(ctx, map, px, py, size, color) {
  ctx.fillStyle = color
  for (let r = 0; r < map.length; r++) {
    for (let cIdx = 0; cIdx < map[r].length; cIdx++) {
      if (map[r][cIdx] === '1') {
        ctx.fillRect(px + cIdx * size, py + r * size, size, size)
      }
    }
  }
}

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
    { name: '—', score: 0 },
    { name: '—', score: 0 },
    { name: '—', score: 0 },
    { name: '—', score: 0 }
  ]

  const getLeaderboard = () => {
    const list = [...basePlayers, { name: user?.username || 'You', score: highScore, isUser: true }]
    return list.sort((a, b) => b.score - a.score).slice(0, 5)
  }

  const leaderboard = getLeaderboard()

  const SPRITE_SIZE = 5
  const GROUND = 170
  const DINO_H = 8 * SPRITE_SIZE
  const DINO_W = 8 * SPRITE_SIZE
  const DUCK_H = 5 * SPRITE_SIZE
  const DUCK_W = 10 * SPRITE_SIZE

  // Game ref variables to avoid state-refresh delays in loop
  const gameRef = useRef({
    dino: { y: GROUND - DINO_H, vy: 0, jump: false, duck: false, frame: 0, legTimer: 0 },
    obs: [],
    speed: 6,
    score: 0,
    over: false,
    frame: 0,
    started: false,
    nextSpawn: 60
  })

  const triggerJump = () => {
    const state = gameRef.current
    if (state.over) {
      // reset
      state.dino = { y: GROUND - DINO_H, vy: 0, jump: false, duck: false, frame: 0, legTimer: 0 }
      state.obs = []
      state.speed = 6
      state.score = 0
      state.over = false
      state.frame = 0
      state.started = true
      state.nextSpawn = 60
      setScore(0)
      setGameOver(false)
      setIsPlaying(true)
      return
    }
    if (!state.started) {
      state.started = true
      setIsPlaying(true)
    }
    if (!state.dino.jump && !state.dino.duck) {
      state.dino.vy = -12
      state.dino.jump = true
    }
  }

  const triggerDuck = (v) => {
    const state = gameRef.current
    if (state.started && !state.over && !state.dino.jump) {
      state.dino.duck = v
    }
  }

  // Key handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        triggerJump()
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        triggerDuck(true)
      }
    }
    const handleKeyUp = (e) => {
      if (e.code === 'ArrowDown') {
        triggerDuck(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Game loop
  useEffect(() => {
    let animationId
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    const loop = () => {
      const state = gameRef.current
      const width = 600
      const height = 200

      ctx.clearRect(0, 0, width, height)

      // Fetch dynamic colors from the computed style
      const colorText = getComputedStyle(canvas).getPropertyValue('--text').trim() || '#fafafa'
      const colorText3 = getComputedStyle(canvas).getPropertyValue('--text3').trim() || '#52525b'
      const colorBorder2 = getComputedStyle(canvas).getPropertyValue('--border2').trim() || '#444b5a'
      const colorAccent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#6366f1'
      const colorSuccess = getComputedStyle(canvas).getPropertyValue('--success').trim() || '#10b981'

      // Draw Ground
      ctx.fillStyle = colorBorder2
      ctx.fillRect(0, GROUND, width, 2)

      // Draw Ground Dashes
      ctx.fillStyle = colorText3
      for (let i = 0; i < width; i += 20) {
        ctx.fillRect((i - (state.frame * state.speed) % 20 + width) % width, GROUND + 4, 8, 2)
      }

      if (state.started && !state.over) {
        state.frame++
        state.speed += 0.0025
        state.dino.vy += 0.8
        state.dino.y += state.dino.vy
        if (state.dino.y > GROUND - DINO_H) {
          state.dino.y = GROUND - DINO_H
          state.dino.vy = 0
          state.dino.jump = false
        }

        // Spawn obstacles
        state.nextSpawn--
        if (state.nextSpawn <= 0) {
          const r = Math.random()
          if (r < 0.25 && state.score > 150) {
            const heights = [GROUND - 25, GROUND - 50, GROUND - 75]
            state.obs.push({
              type: 'bird',
              x: 610,
              y: heights[Math.floor(Math.random() * heights.length)],
              w: 8 * SPRITE_SIZE,
              h: 4 * SPRITE_SIZE,
              count: 1
            })
          } else if (r < 0.6) {
            const count = Math.random() < 0.4 ? 1 : (Math.random() < 0.75 ? 2 : 3)
            state.obs.push({
              type: 'small',
              x: 610,
              w: count * 3 * SPRITE_SIZE,
              h: 6 * SPRITE_SIZE,
              count: count
            })
          } else {
            const count = Math.random() < 0.5 ? 1 : (Math.random() < 0.8 ? 2 : 3)
            state.obs.push({
              type: 'big',
              x: 610,
              w: count * 5 * SPRITE_SIZE,
              h: 7 * SPRITE_SIZE,
              count: count
            })
          }
          state.nextSpawn = Math.floor(50 + Math.random() * 60 - Math.min(state.speed * 2, 35))
          if (state.nextSpawn < 25) state.nextSpawn = 25
        }

        // Move obstacles
        state.obs.forEach(o => o.x -= state.speed)
        state.obs = state.obs.filter(o => o.x > -30)

        // Update score
        state.score += 0.15
        setScore(Math.floor(state.score))

        // Leg walk animation timing
        state.dino.legTimer++
        if (state.dino.legTimer > 6) {
          state.dino.legTimer = 0
          state.dino.frame = 1 - state.dino.frame
        }

        // Collision detection
        const dx1 = 44
        const dx2 = 44 + (state.dino.duck ? DUCK_W : DINO_W)
        const dyTop = state.dino.duck ? GROUND - DUCK_H : state.dino.y
        const dyBot = state.dino.duck ? GROUND : state.dino.y + DINO_H

        state.obs.forEach(o => {
          const ox1 = o.x
          const ox2 = o.x + o.w
          const oyTop = o.type === 'bird' ? o.y : GROUND - o.h
          const oyBot = o.type === 'bird' ? o.y + o.h : GROUND

          if (dx2 > ox1 && dx1 < ox2 && dyBot > oyTop && dyTop < oyBot) {
            state.over = true
            setGameOver(true)
            setIsPlaying(false)
            setHighScore(prev => {
              const next = Math.max(prev, Math.floor(state.score))
              localStorage.setItem('moodle_dino_high_score', String(next))
              return next
            })
          }
        })
      }

      // Draw Dino
      if (state.dino.duck && !state.dino.jump) {
        drawPixels(ctx, dinoDuck, 44 - (DUCK_W - DINO_W) / 2, GROUND - DUCK_H, SPRITE_SIZE, colorAccent)
      } else {
        drawPixels(ctx, dinoRun[state.dino.jump ? 0 : state.dino.frame], 44, state.dino.y, SPRITE_SIZE, colorAccent)
      }

      // Draw Obstacles
      state.obs.forEach(o => {
        if (o.type === 'bird') {
          const f = Math.floor(state.frame / 10) % 2
          drawPixels(ctx, birdFrames[f], o.x, o.y, SPRITE_SIZE, colorSuccess)
        } else if (o.type === 'small') {
          for (let i = 0; i < o.count; i++) {
            drawPixels(ctx, cactusSmall, o.x + i * 3 * SPRITE_SIZE, GROUND - o.h, SPRITE_SIZE, colorSuccess)
          }
        } else {
          for (let i = 0; i < o.count; i++) {
            drawPixels(ctx, cactusBig, o.x + i * 5 * SPRITE_SIZE, GROUND - o.h, SPRITE_SIZE, colorSuccess)
          }
        }
      })

      // Score drawn inside canvas
      ctx.fillStyle = colorText
      ctx.font = '16px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('Score: ' + Math.floor(state.score), 580, 25)

      // Start Screen
      if (!state.started) {
        ctx.fillStyle = colorText
        ctx.font = '18px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Tap / Space to start', width / 2, height / 2)
      }

      // Game Over Screen
      if (state.over) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#ef4444'
        ctx.font = 'bold 20px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('GAME OVER', width / 2, height / 2 - 10)
        ctx.fillStyle = colorText
        ctx.font = '14px monospace'
        ctx.fillText('Tap / Space to restart', width / 2, height / 2 + 15)
      }

      animationId = requestAnimationFrame(loop)
    }

    loop()

    return () => cancelAnimationFrame(animationId)
  }, [])

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
          position: 'relative', 
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        <canvas 
          ref={canvasRef} 
          width={600} 
          height={200} 
          style={{ 
            display: 'block', 
            width: '100%', 
            height: 'auto',
            imageRendering: 'pixelated'
          }} 
        />
        <div style={{ 
          padding: '10px 14px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: 12, 
          border: '1px solid var(--border)', 
          borderRadius: 12, 
          background: 'var(--surface2)', 
          color: 'var(--text)',
          marginTop: 12
        }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} className="text-blue" />
              <span className="section-title">Alien Jump          Scoreboard</span>
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
