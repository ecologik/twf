import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import logo from './assets/twf-logo-white.png'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import RequireRole from './auth/RequireRole'
import Home from './pages/Home'
import Login from './pages/Login'
import Pending from './pages/Pending'
import Privacy from './pages/Privacy'
import ResetPassword from './pages/ResetPassword'
import Users from './pages/admin/Users'
import SectionPlaceholder from './pages/SectionPlaceholder'

// The map library is big, so the Projects pages load only when opened.
const ProjectList = lazy(() => import('./pages/projects/ProjectList'))
const ProjectForm = lazy(() => import('./pages/projects/ProjectForm'))
const AllProjectsMap = lazy(() => import('./pages/map/AllProjectsMap'))
const PracticeTypes = lazy(() => import('./pages/admin/PracticeTypes'))
import { SECTIONS } from './nav/sections'

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
              {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
              {isAdmin && <NavLink to="/admin/practices">Practices</NavLink>}
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

function SubNav() {
  const { profile } = useAuth()
  const role = profile?.role
  if (role !== 'admin' && role !== 'board') return null
  const visible = SECTIONS.filter((s) => s.roles.includes(role))
  return (
    <nav className="subnav" aria-label="Sections">
      <div className="subnav-inner">
        {visible.map((s) => (
          <span key={s.path} className="subnav-item">
            {s.path === '/board' && visible.length > 1 && <span className="subnav-sep" aria-hidden="true" />}
            <NavLink to={s.path}>{s.label}</NavLink>
          </span>
        ))}
      </div>
    </nav>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <SubNav />
        <main>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/pending" element={<Pending />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<RequireRole allow={['admin']}><Home /></RequireRole>} />
              <Route path="/projects" element={<RequireRole allow={['admin']}><ProjectList /></RequireRole>} />
              <Route path="/projects/new" element={<RequireRole allow={['admin']}><ProjectForm /></RequireRole>} />
              <Route path="/projects/:id" element={<RequireRole allow={['admin']}><ProjectForm /></RequireRole>} />
              <Route path="/map" element={<RequireRole allow={['admin']}><AllProjectsMap /></RequireRole>} />
              {SECTIONS.filter((s) => s.path !== '/projects' && s.path !== '/map').map((s) => (
                <Route
                  key={s.path}
                  path={s.path}
                  element={<RequireRole allow={s.roles}><SectionPlaceholder section={s} /></RequireRole>}
                />
              ))}
              <Route path="/admin/users" element={<RequireRole allow={['admin']}><Users /></RequireRole>} />
              <Route path="/admin/practices" element={<RequireRole allow={['admin']}><PracticeTypes /></RequireRole>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
