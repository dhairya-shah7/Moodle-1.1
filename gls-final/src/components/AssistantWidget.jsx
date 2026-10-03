import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, X, Send, Download, FileText, Trash2, ExternalLink, Upload } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { processAssistantQuery } from '../utils/assistantEngine'
import BobbyAssistant from './BobbyAssistant'

export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      response: {
        text: "Hi! I'm Bobby, your Moodle & Assignment Assistant. Ask me about remaining assignments, deadlines, or course files — or send/upload any PDF or Word assignment to solve, edit, and submit!",
        suggestions: [
          "📋 Which assignments are remaining?",
          "⏰ When are my upcoming deadlines?",
          "🚫 Which assignments have I ignored?",
          "📁 Search for course files"
        ],
        type: 'greeting'
      },
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const [input, setInput] = useState('')
  const dataContext = useAppData()
  const { bobbySession, openBobbyWithTask, closeBobbySession, assignments = [], files = [] } = dataContext
  const chatEndRef = useRef(null)
  const quickUploadRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (bobbySession?.isOpen && bobbySession?.sessionId) {
      setIsOpen(true)
      setActiveTab('solver')
    }
  }, [bobbySession?.isOpen, bobbySession?.sessionId])

  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, activeTab])

  const handleQuickUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    openBobbyWithTask({
      localFile: file,
      assignment: bobbySession?.assignment || null,
      attachmentFile: null
    })
    e.target.value = ''
  }

  const handleSend = (queryText) => {
    const textToSend = queryText || input
    if (!textToSend || !textToSend.trim()) return

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend.trim(),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }

    const botResult = processAssistantQuery(textToSend, dataContext)
    const botMsg = {
      id: Date.now() + 1,
      sender: 'bot',
      response: botResult,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
  }

  const handleItemClick = (item) => {
    if (item.type === 'assignment' && item.id) {
      setIsOpen(false)
      navigate('/assignments', { state: { openAssignmentId: item.id } })
    } else if (item.type === 'file') {
      if (item.url) {
        window.open(item.url, '_blank', 'noopener,noreferrer')
      } else {
        setIsOpen(false)
        navigate('/files')
      }
    } else if (item.type === 'course' && item.id) {
      setIsOpen(false)
      navigate('/courses')
    }
  }

  const handleSendChatItemToBobby = (e, item) => {
    e.stopPropagation()
    if (item.type === 'assignment' && item.id) {
      const fullAssign = assignments.find(a => String(a.id) === String(item.id))
      if (fullAssign) {
        const allFiles = [
          ...(fullAssign.introattachments || []),
          ...(fullAssign.introfiles || [])
        ]
        const supported = allFiles.find(f => {
          const ext = f.filename?.split('.').pop()?.toLowerCase()
          return ext === 'pdf' || ext === 'docx'
        })
        openBobbyWithTask({
          assignment: fullAssign,
          attachmentFile: supported || null,
          localFile: null
        })
      }
    } else if (item.type === 'file') {
      const matchedFile = files.find(f => f.url === item.url || f.filename === item.title) || {
        filename: item.title,
        url: item.url,
        coursename: item.subtitle || ''
      }
      openBobbyWithTask({
        assignment: {
          name: (item.title || 'Course Assignment').replace(/\.[^.]+$/, ''),
          coursename: matchedFile.coursename || item.subtitle || '',
          courseshort: matchedFile.courseshort || ''
        },
        attachmentFile: matchedFile,
        localFile: null
      })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([
      {
        id: Date.now(),
        sender: 'bot',
        response: {
          text: "Chat cleared! Ask me about your Moodle tasks or switch to Assignment Solver to solve a PDF/DOCX.",
          suggestions: [
            "📋 Which assignments are remaining?",
            "⏰ When are my upcoming deadlines?",
            "🚫 Which assignments have I ignored?",
            "📁 Search for course files"
          ],
          type: 'greeting'
        },
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      }
    ])
  }

  return (
    <>
      <input
        ref={quickUploadRef}
        type="file"
        accept=".pdf,.docx"
        style={{ display: 'none' }}
        onChange={handleQuickUpload}
      />

      {/* Floating Action Button (hidden when drawer is open so it never overlaps the drawer corner) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: 74,
            right: 20,
            zIndex: 9999,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 52,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.45)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease, boxShadow 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1.0)'}
          title="Bobby — Moodle & Assignment Assistant"
        >
          <Bot size={26} />
        </button>
      )}

      {/* Expandable Bobby Drawer */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 74,
          right: 14,
          width: 'calc(100vw - 28px)',
          maxWidth: activeTab === 'solver' ? 540 : 400,
          height: activeTab === 'solver' ? 'min(540px, calc(100dvh - 156px))' : 'min(450px, calc(100dvh - 156px))',
          maxHeight: 'calc(100vh - 156px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: '0 20px 44px rgba(0,0,0,0.38)',
          backdropFilter: 'blur(16px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'max-width 0.2s ease, height 0.2s ease',
          fontFamily: "'DM Sans', sans-serif"
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Bot size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                  Bobby
                </div>
                <div style={{ fontSize: 10, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                  Bobby Assistant • Moodle & Solver
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {activeTab === 'chat' && (
                <button
                  onClick={clearChat}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear Chat"
                >
                  <Trash2 size={16} />
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Unified Mode Switcher Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: '8px 12px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '7px 10px',
                borderRadius: 9,
                border: activeTab === 'chat' ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeTab === 'chat' ? 'var(--accent)' : 'var(--surface)',
                color: activeTab === 'chat' ? '#fff' : 'var(--text2)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Bot size={13} /> Chat & Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('solver')}
              style={{
                padding: '7px 10px',
                borderRadius: 9,
                border: activeTab === 'solver' ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeTab === 'solver' ? 'var(--accent)' : 'var(--surface)',
                color: activeTab === 'solver' ? '#fff' : 'var(--text2)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <FileText size={13} /> Assignment Solver
            </button>
          </div>

          {activeTab === 'solver' ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              {bobbySession?.assignment || bobbySession?.attachmentFile || bobbySession?.localFile ? (
                <BobbyAssistant
                  key={bobbySession?.sessionId || 'default-solver'}
                  assignment={bobbySession?.assignment || null}
                  attachmentFile={bobbySession?.attachmentFile || null}
                  localFile={bobbySession?.localFile || null}
                  embeddedInDrawer={true}
                  onClose={() => {
                    closeBobbySession()
                    setActiveTab('chat')
                  }}
                />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: 'var(--text2)',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  Upload from Courses/Assignment
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Messages Log */}
              <div style={{
                flex: 1,
                padding: '16px 14px 12px 14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      maxWidth: '88%',
                      padding: '10px 14px',
                      borderRadius: msg.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: msg.sender === 'user' ? 'var(--accent)' : 'var(--surface2)',
                      color: msg.sender === 'user' ? '#fff' : 'var(--text)',
                      fontSize: 13,
                      lineHeight: 1.45,
                      border: msg.sender === 'user' ? 'none' : '1px solid var(--border)'
                    }}>
                      {msg.sender === 'user' ? (
                        msg.text
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div>{msg.response.text}</div>

                          {/* Items Cards */}
                          {msg.response.items && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              {msg.response.items.map(item => {
                                const ext = (item.title || '').split('.').pop()?.toLowerCase()
                                const canSolveInBobby = item.type === 'assignment' || (item.type === 'file' && (ext === 'pdf' || ext === 'docx'))
                                return (
                                  <div 
                                    key={item.id} 
                                    onClick={() => handleItemClick(item)}
                                    style={{
                                      padding: '9px 12px',
                                      background: 'var(--surface3)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 12,
                                      fontSize: 12,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      userSelect: 'none',
                                      flexWrap: 'wrap'
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.borderColor = 'var(--accent)'
                                      e.currentTarget.style.transform = 'translateY(-1px)'
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.borderColor = 'var(--border)'
                                      e.currentTarget.style.transform = 'translateY(0)'
                                    }}
                                  >
                                    <div style={{ minWidth: 120, flex: 1 }}>
                                      <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.title}
                                      </div>
                                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
                                        {item.subtitle}
                                      </div>
                                    </div>

                                    {item.badge && (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: 8,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        background: item.badge.includes('Overdue') || item.badge.includes('Today') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                        color: item.badge.includes('Overdue') || item.badge.includes('Today') ? '#ef4444' : '#f59e0b',
                                        flexShrink: 0
                                      }}>
                                        {item.badge}
                                      </span>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      {canSolveInBobby && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleSendChatItemToBobby(e, item)}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: 6,
                                            border: '1px solid var(--accent)',
                                            background: 'var(--accent-soft)',
                                            color: 'var(--accent)',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 3
                                          }}
                                        >
                                          <Bot size={11} /> Solve
                                        </button>
                                      )}
                                      <span
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 6,
                                          background: 'var(--accent)',
                                          color: '#fff',
                                          fontSize: 10,
                                          fontWeight: 600,
                                          flexShrink: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                      >
                                        {item.type === 'file' ? <Download size={11} /> : <ExternalLink size={11} />} Open
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Suggestion Chips */}
                          {msg.response.suggestions && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              {msg.response.suggestions.map((sug, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSend(sug.replace(/^[^\s]+\s/, ''))}
                                  style={{
                                    textAlign: 'left',
                                    padding: '6px 10px',
                                    background: 'var(--surface3)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 10,
                                    color: 'var(--accent)',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface3)'}
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, padding: '0 4px' }}>
                      {msg.time}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input Box */}
              <div style={{
                padding: 10,
                background: 'var(--surface2)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <input
                  type="text"
                  placeholder="Ask Bobby about assignments, deadlines, files..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: 1,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: 12,
                    outline: 'none'
                  }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: input.trim() ? 1 : 0.5
                  }}
                >
                  <Send size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

