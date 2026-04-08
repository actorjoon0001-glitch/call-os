import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Showrooms from './pages/Showrooms'
import Agents from './pages/Agents'
import Customers from './pages/Customers'
import CallLogs from './pages/CallLogs'
import ConsultLogs from './pages/ConsultLogs'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/showrooms" element={<Showrooms />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/call-logs" element={<CallLogs />} />
          <Route path="/consult-logs" element={<ConsultLogs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
