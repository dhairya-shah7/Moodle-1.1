import { useEffect, useRef } from 'react'
import { useTheme } from '../hooks/useTheme'

export default function NetworkBackground() {
    const canvasRef = useRef(null)
    const { isDark } = useTheme()

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        let animationFrameId
        let particles = []

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            initParticles()
        }

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width
                this.y = Math.random() * canvas.height
                this.vx = (Math.random() - 0.5) * 0.5
                this.vy = (Math.random() - 0.5) * 0.5
                this.radius = Math.random() * 1.5 + 0.5
            }

            update() {
                this.x += this.vx
                this.y += this.vy

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1
            }

            draw() {
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
                ctx.fillStyle = isDark
                    ? 'rgba(248, 113, 113, 0.45)'      // warm light-red/orange dots in dark mode
                    : 'rgba(251, 146, 60, 0.28)'       // soft orange in light mode
                ctx.fill()
            }
        }

        const initParticles = () => {
            const count = Math.floor((canvas.width * canvas.height) / 15000)
            particles = Array.from({ length: Math.min(count, 100) }, () => new Particle())
        }

        const drawLines = () => {
            const maxDist = 150
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x
                    const dy = particles[i].y - particles[j].y
                    const dist = Math.sqrt(dx * dx + dy * dy)

                    if (dist < maxDist) {
                        const opacity = 1 - dist / maxDist
                        ctx.beginPath()
                        ctx.moveTo(particles[i].x, particles[i].y)
                        ctx.lineTo(particles[j].x, particles[j].y)
                        ctx.strokeStyle = isDark
                            ? `rgba(248, 113, 113, ${opacity * 0.18})`   // warm orange-red lines
                            : `rgba(251, 146, 60, ${opacity * 0.14})`    // orange lines in light mode
                        ctx.lineWidth = 0.8
                        ctx.stroke()
                    }
                }
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            particles.forEach(p => {
                p.update()
                p.draw()
            })
            drawLines()
            animationFrameId = requestAnimationFrame(animate)
        }

        window.addEventListener('resize', resize)
        resize()
        animate()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
        }
    }, [isDark])

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                pointerEvents: 'none',
                opacity: 0.8
            }}
        />
    )
}
