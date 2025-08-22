import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './App.css'
import Home from './components/Home'
import TicketSystem from './components/TicketSystem'
import ConversationHistory from './components/ConversationHistory'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ticket" element={<TicketSystem />} />
        <Route path="/history" element={<ConversationHistory />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
