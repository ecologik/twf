import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <article className="card prose">
      <h1>Privacy policy</h1>
      <p className="muted small">The Watershed Foundation Dashboard · Last updated November 17, 2026</p>

      <p>
        The Watershed Foundation Dashboard is a private tool for The Watershed Foundation's staff and board. This page
        explains what happens to your information when you sign in.
      </p>

      <h2>What we collect</h2>
      <p>
        When you sign in with Google, we receive your name, email address and profile picture from your Google
        account. We do not get your Google password, and we do not access your Gmail, contacts, calendar or files.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and keep you signed in.</li>
        <li>To decide what parts of the dashboard you can see (admin, board, or no access yet).</li>
        <li>
          When you first sign in, the Foundation's approvers get an email with your name and email address so they can
          approve your access.
        </li>
      </ul>

      <h2>Who it's shared with</h2>
      <p>
        We don't sell or share your information. It is stored with our service providers that run the dashboard:
        Supabase (database and sign-in) and SendGrid (sending the approval email). They process it only to provide
        those services.
      </p>

      <h2>Removing your information</h2>
      <p>
        To have your account and information removed, contact The Watershed Foundation and we'll delete it.
      </p>

      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </article>
  )
}
