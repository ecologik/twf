import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import RequireRole from './auth/RequireRole'
import Home from './pages/Home'
import Board from './pages/Board'
import Login from './pages/Login'
import Pending from './pages/Pending'
import Users from './pages/admin/Users'

function Nav() {
  const { profile, signOut } = useAuth()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'board')) return null
  const isAdmin = profile.role === 'admin'
  return (
    <nav className="topnav">
      <span className="brand">Watershed Foundation</span>
      {isAdmin && <NavLink to="/" end>Home</NavLink>}
      <NavLink to="/board">Board</NavLink>
      {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
      <span className="spacer" />
      <span className="muted small">{profile.email}</span>
      <button onClick={signOut}>Sign out</button>
    </nav>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <main>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/pending" element={<Pending />} />
            <Route path="/" element={<RequireRole allow={['admin']}><Home /></RequireRole>} />
            <Route path="/board" element={<RequireRole allow={['admin', 'board']}><Board /></RequireRole>} />
            <Route path="/admin/users" element={<RequireRole allow={['admin']}><Users /></RequireRole>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
