# Sign-in setup (Google + email)

One-time steps that need a person at the Google Cloud, Supabase and SendGrid dashboards.
Project ref: `jhowpquqdmdjwviqnjll`.

## 1. Google Cloud: OAuth client (about 10 minutes)

Ideally do this signed in as a TWF Google account, so the app belongs to TWF.

1. Go to https://console.cloud.google.com, create a project named **TWF Dashboard**.
2. **Google Auth Platform > Branding**: app name "Watershed Foundation Dashboard", support email, and under
   **Authorized domains** add `ecologik.net` and `supabase.co`.
3. **Audience**: choose **External**, then **Publish app** (In production). Only the basic
   email/profile scopes are used, so Google doesn't need to verify the app.
4. **Clients > Create client**, type **Web application**:
   - Authorized JavaScript origins: `https://twf.ecologik.net` and `http://localhost:5173`
   - Authorized redirect URI: `https://jhowpquqdmdjwviqnjll.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.

## 2. Supabase dashboard

1. **Authentication > Sign In / Providers > Google**: turn on, paste the Client ID and secret, save.
2. Same page, **Email**: leave it **on**, with **Confirm email** on. People without a Google account sign
   up with email and password. They get no access, and nobody is emailed, until they click the confirmation link.
3. **Authentication > URL Configuration**:
   - Site URL: `https://twf.ecologik.net`
   - Redirect URLs: `https://twf.ecologik.net/**` and `http://localhost:5173/**`
4. **SQL Editor**: paste and run `supabase/migrations/20261117000000_auth_roles.sql`.
5. Still in the SQL Editor, add the approvers (lowercase emails):

   ```sql
   insert into public.signup_approvers (email, receives_emails) values
     ('lyn@example.com', true),
     ('mariah@example.com', true),
     ('jon@example.com', false);  -- admin, but no sign-up emails
   ```

   They become admins the first time they sign in. Anyone who signed in *before* being added
   can be promoted with `update public.profiles set role = 'admin' where email = '...';`

## 3. SendGrid

1. TWF's group authenticates the sending domain in SendGrid (**Settings > Sender Authentication >
   Authenticate Your Domain**). SendGrid gives DNS records (mostly CNAMEs) to add at the domain's DNS host.
2. **Settings > API Keys > Create API Key**, Restricted Access, with only **Mail Send** on. Copy it.
3. Set the function's secrets (Supabase dashboard **Edge Functions > Secrets**, or from twf-dash):

   ```powershell
   npx -y supabase secrets set --project-ref jhowpquqdmdjwviqnjll `
     SENDGRID_API_KEY=SG.xxxx `
     NOTIFY_FROM=noreply@<twf-domain> `
     SITE_URL=https://twf.ecologik.net
   ```

   `NOTIFY_FROM` must be on the domain authenticated in step 1. `NOTIFY_FROM_NAME` is optional.
4. Deploy the function (it must skip JWT checks, since the database calls it):

   ```powershell
   npx -y supabase functions deploy notify-signup --no-verify-jwt --project-ref jhowpquqdmdjwviqnjll
   ```

4. Point Supabase's own emails (confirm email, reset password) at SendGrid. Supabase's built-in mailer
   only sends to your Supabase team members and a few per hour, so email sign-up won't work without this.
   **Authentication > Emails > SMTP Settings**, turn on **Enable custom SMTP**:
   - Sender email: same as `NOTIFY_FROM`; Sender name: `Watershed Foundation`
   - Host `smtp.sendgrid.net`, Port `587`, Username `apikey` (literally), Password: the SendGrid API key
   Then under **Authentication > Rate Limits**, raise "emails sent per hour" from the default (e.g. to 30).

## 4. Site

The Google consent screen links to `https://twf.ecologik.net/privacy`, which this PR adds (public, no sign-in).


Merge the PR, pull in twf-dash, and run `.\deploy.ps1`.

## Check it works

1. Sign in at https://twf.ecologik.net with a Gmail account that is not an approver. You should see
   "Waiting for approval", and Lyn/Mariah should get an email.
1. Create an account with a non-Google email. You should get a confirmation email; after clicking it,
   Lyn/Mariah get the sign-up email. Try "Forgot password?" too.
2. Sign in as an approver, open **Users**, and click **Make Board** on the test account.
3. Back on the test account, click **Check again**: it should see only the Board section.

If no email arrives, check **Edge Functions > notify-signup > Logs** in Supabase.
