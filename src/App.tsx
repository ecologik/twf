import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import logo from './assets/twf-logo-white.png'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import RequireRole from './auth/RequireRole'
import Home from './pages/Home'
import Board from './pages/Board'
import Login from './pages/Login'
import Pending from './pages/Pending'
import Privacy from './pages/Privacy'
import ResetPassword from './pages/ResetPassword'
import Users from './pages/admin/Users'

function Nav() {
  const { profile, signOut } = useAuth()
  const approved = profile && (profile.role === 'admin' || profile.role === 'board')
  const isAdmin = profile?.role === 'admin'
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link to="/" className="topnav-logo" aria-label="The Watershed Foundation dashboard home">
          <img src={logo} alt="TWF, The Watershed Foundation" width={449} height={200} />
        </Link>
        {approved && (
          <>
            <nav className="topnav-links">
              {isAdmin && <NavLink to="/" end>Home</NavLink>}
              <NavLink to="/board">Board</NavLink>
              {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
            </nav>
            <div className="topnav-user">
              <span className="topnav-email">{profile.email}</span>
              <button className="topnav-button" onClick={signOut}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </header>
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
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
