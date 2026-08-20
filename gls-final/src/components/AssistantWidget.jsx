import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Sparkles, RefreshCw, Download, FileText, CheckCircle, Clock, Trash2 } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { processAssistantQuery } from '../utils/assistantEngine'

export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      response: {
        text: "Hi! I'm your Moodle Assistant. Ask me about your remaining assignments, deadlines, files, or ignored tasks.",
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
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

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
          text: "Chat cleared! How can I help you with your Moodle tasks?",
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
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: 74,
          right: 20,
          zIndex: 9999,
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 52,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(59, 130, 246, 0.45)',
          cursor: 'pointer',
          transition: 'transform 0.2s ease, boxShadow 0.2s ease'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1.0)'}
        title="Moodle Assistant Chatbot"
      >
        {isOpen ? <X size={24} /> : <Bot size={26} />}
      </button>

      {/* Expandable Chat Drawer */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 136,
          right: 20,
          width: 'calc(100vw - 40px)',
          maxWidth: 380,
          height: 480,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(16px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'DM Sans', sans-serif"
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Moodle Assistant
                </div>
                <div style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  Active • Local Rule Engine
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

          {/* Messages Log */}
          <div style={{
            flex: 1,
            padding: 14,
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
                  maxWidth: '85%',
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
                          {msg.response.items.map(item => (
                            <div key={item.id} style={{
                              padding: '8px 10px',
                              background: 'var(--surface3)',
                              border: '1px solid var(--border)',
                              borderRadius: 10,
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8
                            }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.title}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                                  {item.subtitle}
                                </div>
                              </div>

                              {item.badge && (
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: 6,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: item.badge.includes('Overdue') || item.badge.includes('Today') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                  color: item.badge.includes('Overdue') || item.badge.includes('Today') ? '#ef4444' : '#3b82f6',
                                  flexShrink: 0
                                }}>
                                  {item.badge}
                                </span>
                              )}

                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2
                                  }}
                                >
                                  <Download size={11} /> Open
                                </a>
                              )}
                            </div>
                          ))}
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
              placeholder="Ask about assignments, deadlines, files..."
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
        </div>
      )}
    </>
  )
}
