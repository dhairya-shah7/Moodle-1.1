import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (typeof window !== 'undefined') {
  if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
    ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
      const reader = this.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    }
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      const list = Array.isArray(registrations) ? registrations : Array.from(registrations || [])
      for (let i = 0; i < list.length; i++) {
        list[i].unregister().then(() => {
          console.log('Unregistered active ServiceWorker')
        })
      }
    }).catch(err => {
      console.warn('Service Worker unregister check failed:', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

