/**
 * Google Picker for choosing a Drive folder.
 *
 * Needs three values in .env.local (see docs/drive-picker-setup.md):
 *   VITE_GOOGLE_CLIENT_ID  the OAuth web client (same one Supabase uses for sign-in)
 *   VITE_GOOGLE_API_KEY    an API key restricted to the Picker API and our sites
 *   VITE_GOOGLE_APP_ID     the Cloud project number
 * Without them the Browse button stays hidden and staff paste a link instead.
 *
 * It asks for the drive.file scope only: the dashboard can see a folder only
 * after someone picks it here, never the rest of their Drive.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const pickerConfigured = Boolean(CLIENT_ID && API_KEY && APP_ID)

export type PickedFolder = { id: string; name: string; url: string }

// Google's scripts have no published types here; keep the surface we use small.
declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

const loaded = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => {
          loaded.delete(src)
          reject(new Error(`Couldn't load ${src}`))
        }
        document.head.appendChild(s)
      }),
    )
  }
  return loaded.get(src)!
}

async function loadPicker() {
  await Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')])
  if (!window.google?.picker) {
    await new Promise<void>((resolve, reject) =>
      window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error("Couldn't load Google Picker")) }),
    )
  }
}

let token: { value: string; expires: number } | null = null

function getToken(hint?: string): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return Promise.resolve(token.value)
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: hint,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        token = { value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e: any) => reject(new Error(e?.message || e?.type || 'Google sign-in was closed')),
    })
    client.requestAccessToken({ prompt: token ? '' : undefined })
  })
}

/**
 * Opens Google's Drive picker showing folders only (My Drive and shared
 * drives). Resolves with the chosen folder, or null if the person cancels.
 * `email` pre-selects their Google account.
 */
export async function pickDriveFolder(email?: string): Promise<PickedFolder | null> {
  if (!pickerConfigured) throw new Error('Google Drive browsing is not set up yet.')
  await loadPicker()
  const oauth = await getToken(email)
  const g = window.google

  return new Promise((resolve) => {
    const folders = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
    const sharedDrives = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setEnableDrives(true)

    const picker = new g.picker.PickerBuilder()
      .setTitle("Choose this project's folder")
      .addView(folders)
      .addView(sharedDrives)
      .enableFeature(g.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(oauth)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOrigin(window.location.origin)
      .setCallback((data: any) => {
        const action = data[g.picker.Response.ACTION]
        if (action === g.picker.Action.PICKED) {
          const doc = data[g.picker.Response.DOCUMENTS][0]
          resolve({ id: doc[g.picker.Document.ID], name: doc[g.picker.Document.NAME], url: doc[g.picker.Document.URL] })
        } else if (action === g.picker.Action.CANCEL) resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}
