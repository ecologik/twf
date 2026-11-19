# Browse Drive button: Google Cloud setup

The project Overview's **Google Drive folder** card always lets staff paste a folder link.
The **Browse Drive…** button opens Google's own folder picker, and it appears only once the three
values below are in `.env.local`. This takes about 10 minutes in the same Google Cloud project used for
Google sign-in (**TWF Dashboard**, see `docs/auth-setup.md`).

## 1. Turn on the APIs
Google Cloud console, project **TWF Dashboard** > **APIs & Services > Library**. Enable:
- **Google Picker API**
- **Google Drive API**

## 2. Add the Drive scope to the consent screen
**Google Auth Platform > Data Access > Add or remove scopes**. Add
`https://www.googleapis.com/auth/drive.file` and save.

This scope only lets the dashboard see the folders and files someone picks in the picker, never
the rest of their Drive. Google counts it as non-sensitive, so the app doesn't need Google's review.

## 3. Check the OAuth client
**Google Auth Platform > Clients**. Open the web client that sign-in uses. Under **Authorized
JavaScript origins** it should already list `https://twf.ecologik.net` and `http://localhost:5173`.
Copy its **Client ID**.

## 4. Create an API key
**APIs & Services > Credentials > Create credentials > API key**, then **Edit API key**:
- Name: `TWF Drive picker`
- Application restrictions: **Websites**, add `https://twf.ecologik.net/*` and `http://localhost:5173/*`
- API restrictions: **Restrict key**, tick **Google Picker API**

Copy the key.

## 5. Find the project number
**Cloud overview > Dashboard > Project info > Project number**. This is a number, not the project ID.

## 6. Add them to `.env.local` and deploy
```
VITE_GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=<api key>
VITE_GOOGLE_APP_ID=<project number>
```
Then `npm run dev` to try it, and `.\deploy.ps1` to put it live. The build bakes the values in. They are
public by design: the client ID and the referrer-restricted key are meant to be in browser code.

## TWF's Google Workspace
- Staff pick folders with their own `@watershedfoundation.org` Google account. The picker shows
  whatever that person can already see in Drive, including shared drives.
- If TWF's Workspace blocks unapproved apps, the first Browse shows "access blocked". Then a
  Workspace admin (Lyn or Ian) opens **Admin console > Security > Access and data control > API
  controls > Manage third-party app access**, finds the app by its Client ID, and sets it to **Trusted**.
- The Cloud project doesn't have to belong to TWF for this to work. Owning it from a TWF account is
  still tidier, because TWF keeps it if the developer changes. That's the same advice as for sign-in.
