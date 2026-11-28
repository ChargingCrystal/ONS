# Deploy Ons to Vercel and Supabase

Start with a reviewed commit on `main`, a GitHub account with access to the repository, and accounts on Supabase and Vercel. Use Node 24.x locally to match CI and the Vercel build. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) for migrations. The commands below use Bash, such as Git Bash on Windows. The smoke commands also use `curl` and `jq`.

**Approval checkpoint.** Project creation, granting GitHub access, storing credentials, applying hosted migrations, deploying, configuring OAuth, and assigning domains are separate cloud actions. The steps below are for the project owner to perform. In a brand-new Vercel project, the first deployment is classified as **Production** and uses Production variables. Confirm that first deployment before selecting **Deploy**. The next deployment from a non-production branch can be a Preview. [Vercel deployment environments](https://vercel.com/docs/deployments/environments#first-deployment)

## 1. Create the hosted Supabase project

1. Open the [Supabase dashboard](https://supabase.com/dashboard), choose your organization or create one if needed, and select **New project**. Name it `ons`, choose a strong database password, and store the password in your password manager.
2. Choose a region. For the team in Germany and the Netherlands, use the specific **Central EU (Frankfurt)** region if available. Record the actual region so the Vercel function can run nearby. Select **Create new project** and wait for it to finish. [Supabase regions](https://supabase.com/docs/guides/platform/regions)
3. Open **Connect** for the project URL and project ref. Copy the **Publishable key** from **Project Settings → API Keys**. The ref is also in the dashboard project URL, and for standard Supabase URLs the API hostname is `<project-ref>.supabase.co`. Record the name, ref, URL, and region. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## 2. Apply migrations from main

The backend owner runs these commands from a clean, up-to-date `main` checkout. Set `PROJECT_REF` to the ref copied from the intended dashboard project. Confirm that the terminal names the same target before applying anything. The database password belongs in the CLI prompt when requested.

```bash
git switch main
git pull --ff-only origin main
supabase --version
supabase login
PROJECT_REF='replace-with-the-Supabase-project-ref'
supabase link --project-ref "$PROJECT_REF"
supabase migration list --remote
supabase db push --dry-run --remote
```

Read the dry run. A fresh project should show all checked-in migrations in order, starting with `001_couple_planner.sql`, `002_private_gallery.sql`, and `003_date_categories.sql`. If the target or migration history is unexpected, resolve it before proceeding. After approving the push, apply exactly the reviewed migrations and check the result.

```bash
supabase db push --remote
supabase migration list --remote
```

All checked-in versions should now appear in the remote column. In Supabase, check **Table Editor → public** for `spaces`, `members`, `dates`, and `locations`, then **Storage → Buckets** for the private `gallery` bucket. Keep schema changes in migrations and leave seed data out of production. These examples use the Supabase CLI v3 remote flags. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows#pushing-to-a-remote-project)

## 3. Import the app into Vercel

1. Open the [Vercel dashboard](https://vercel.com/dashboard) and select the intended account or team. Choose **Add New → Project**, connect GitHub if prompted, and import `ChargingCrystal/ONS`. If GitHub asks which repositories to grant access to, select Ons.
2. In the import screen, review these values before you deploy.

   | Setting | Value |
   | --- | --- |
   | Framework Preset | Nuxt |
   | Root Directory | Repository root |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | Leave the Nuxt default |
   | Production Branch | `main`, selected from the repository's default branch |

3. For a functional first Production deployment, add the two variables below with **Production** selected if the import screen exposes environment selection. If it applies variables to all environments, complete the process-only bootstrap without variables, then use **Project → Settings → Environment Variables** to add both for **Production** and redeploy the Production deployment. A process-only deployment can serve `/api/health`, while authenticated routes need the variables.

   | Variable | Value |
   | --- | --- |
   | `NUXT_PUBLIC_SUPABASE_URL` | Hosted project API URL, for example `https://<project-ref>.supabase.co` |
   | `NUXT_PUBLIC_SUPABASE_KEY` | The project's publishable key, or its legacy `anon` key |

   Use only the public app credentials in these variables. Keep the database password, Supabase secret or service-role key, Supabase CLI token, and Google client secret out of Vercel's public variables and the repository.

4. When the first Production deployment is approved, select **Deploy**. Wait for **Ready**, then open **Settings → Build and Deployment** and verify **Node.js Version** is **24.x**. Check that branch tracking points at `main`. Under **Settings → Functions → Function Regions**, select **Frankfurt (`fra1`)** if that is closest to the chosen Supabase region. Settings changes apply to a new deployment, so redeploy if you changed them after the first build. [Vercel Git import](https://vercel.com/docs/git) · [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) · [Function regions](https://vercel.com/docs/functions/configuring-functions/region)

## 4. Create and verify the Preview

1. Use an existing non-production branch with the desired revision, or create a `deploy-preview` branch from the reviewed `main` commit in GitHub using the branch picker and **Create branch**. This branch is for Vercel builds. Hosted migrations are still applied from `main`.
2. In Vercel, open **Project → Deployments**. If branch integration already built it, select that deployment. Otherwise select **Create Deployment**, enter the branch ref, and select **Create Deployment**. Confirm the deployment says **Preview**, references the intended branch and commit, and reaches **Ready**. [Deployments from Git refs](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)
3. Open **Visit** on that deployment and append `/api/health` to its HTTPS URL. Expect HTTP `200` with `{"status":"ok"}`. Use the commit-specific deployment URL to record a reproducible result. If Vercel Authentication protects the Preview, open it in a browser logged into an authorized Vercel account and check the status in the Network panel. For an accessible Preview, the equivalent command is:

   ```bash
   curl -i --fail-with-body 'https://<preview-deployment-host>/api/health'
   ```

4. A health-only Preview can leave its Supabase variables unset. To exercise data routes on a Preview, create an isolated Supabase project with test data, apply the same reviewed migrations from `main`, and set both variables in Vercel for **Preview** and the intended branch. Redeploy and perform the check below on that Preview. Keep Production credentials scoped to Production. [Vercel environment scopes](https://vercel.com/docs/deployments/environments) · [Deployment protection](https://vercel.com/docs/deployment-protection)

### Verify Auth and database connectivity

`/api/health` checks whether Nitro responds. To verify the deployed app reaches Supabase, use a confirmed test identity in the Supabase project configured for that deployment. The current app is an API prototype, so this check uses Supabase Auth directly.

1. In **Supabase → Authentication → Users**, select **Add user → Create new user**. Enter a disposable email and password and choose **Auto Confirm User** for the test identity. This lets you test without relying on email delivery. Keep normal email confirmation enabled for public signups.
2. Run these commands against the configured Production deployment or the isolated Preview. Enter that deployment's URL, its matching Supabase credentials, and the test user's details. If Vercel Authentication protects the deployment, use the authenticated [`vercel curl` CLI](https://vercel.com/docs/cli/curl) for the last request as shown below.

   ```bash
   read -r -p 'Deployment origin (https://...): ' APP_URL
   read -r -p 'Supabase project URL (https://...): ' SUPABASE_URL
   read -r -p 'Supabase publishable key: ' SUPABASE_PUBLIC_KEY
   read -r -p 'Test user email: ' TEST_EMAIL
   read -r -s -p 'Test user password: ' TEST_PASSWORD
   printf '\n'
   ACCESS_TOKEN=$(
     jq -nc --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" '{email:$email,password:$password}' |
       curl --fail-with-body -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
         -H "apikey: $SUPABASE_PUBLIC_KEY" -H 'Content-Type: application/json' --data-binary @- |
       jq -er '.access_token'
   )
   unset TEST_PASSWORD
   if [ -n "$ACCESS_TOKEN" ]; then
     curl -i --fail-with-body "$APP_URL/api/dashboard" \
       -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Accept: application/json'
   fi
   ```

   For a protected Preview, replace the dashboard curl request with the command below while the token is still set. Sign into the Vercel CLI with an account that has access to the deployment. The CLI can obtain or create an automation bypass token, so use this option only after the project owner has approved that access.

   ```bash
   vercel curl /api/dashboard --deployment "$APP_URL" -- \
     -i -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Accept: application/json'
   ```

3. Expect HTTP `200`, a `serverTime` timestamp, `nextMeeting: null`, and `categoriesByMonth: []` for a fresh unpaired account. A `401` can mean a missing or rejected bearer token, or Vercel protection if the response is a Vercel page. A JSON `503 internal` points to missing runtime config or an unavailable dependency. Check the deployment's environment variables, region, logs, and the Supabase project's status. Clear the token with `unset ACCESS_TOKEN` after the check.

## 5. Configure hosted Auth and Google OAuth

1. In the hosted project's **Authentication → Sign In / Providers → Email** settings, enable Email and set **Minimum password length** to **8** to match the app and local Auth. Keep email confirmation enabled for public signups. Local `supabase/config.toml` does not apply these settings to the hosted project. [Supabase password settings](https://supabase.com/docs/guides/auth/password-security)
2. In **Authentication → URL Configuration**, set **Site URL** to the canonical Production HTTPS origin. Under **Redirect URLs**, add the exact `https://<app-domain>/auth/callback` URL without a trailing slash or language prefix. Email confirmation and Google both use this path. For an isolated Preview backend, allow the exact callback on the stable Preview origin. The local callback is `http://localhost:3000/auth/callback`. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
3. In **Authentication → Sign In / Providers → Google**, copy the provider's **Callback URL**, normally `https://<project-ref>.supabase.co/auth/v1/callback`. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), choose the intended Google Cloud project, set up **Branding** and **Audience**, and add demo accounts under **Test users** while the OAuth app is in Testing.
4. Open **Clients → Create client → Web application**. Under **Authorized JavaScript origins**, add the HTTPS app origins you will actually use, without a path. Under **Authorized redirect URIs**, paste the exact **Supabase** callback URL from the previous step. Select **Create** and copy the client ID and secret to the Google provider settings in Supabase. Enable the provider and save. For a separate Preview backend, use its own callback and provider settings. [Supabase Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
5. From a signed-out browser, test the Google button and email confirmation separately. Return to the same app origin that started the flow so the browser retains the PKCE verifier. The app should land on `/auth/callback` and then navigate to the localized dashboard.

## 6. Add a custom domain when ready

1. In **Vercel → Project → Settings → Domains**, select **Add Domain** and enter the chosen domain or subdomain. Choose **Production** for the canonical app domain. For a staging subdomain, assign it to **Preview** and select its Git branch.
2. At the DNS provider, enter the record targets Vercel shows for the domain. Return to Vercel and wait for verification and HTTPS. Use Vercel's suggested redirects if keeping both an apex domain and a `www` alias.
3. When changing the canonical Production origin, update the Supabase **Site URL**, exact redirect allowlist, and Google **Authorized JavaScript origins**. The Google redirect URI stays the Supabase callback unless the Supabase Auth hostname changes. Retest `/api/health`, the authenticated dashboard check, and Google sign-in when available. [Vercel custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

## Local build verification

```bash
npm ci
npm test
NITRO_PRESET=vercel npm run build
```

In PowerShell, set `$env:NITRO_PRESET = 'vercel'` before running `npm run build`, and use `Remove-Item Env:NITRO_PRESET` afterward.

The local verification passed all 52 tests. The Vercel build emitted `.vercel/output/config.json` (Build Output API v3) and `.vercel/output/functions/__fallback.func/` with runtime `nodejs24.x`. The routing config sends `/api/health` to that function. Running its generated handler on loopback returned HTTP `200` with `{"status":"ok"}`. The Nuxt framework preset needs no checked-in `vercel.json` for this build. Live verification is the Preview check in step 4. [Vercel Nuxt preset](https://vercel.com/docs/frameworks/full-stack/nuxt) · [Build Output API](https://vercel.com/docs/build-output-api)

## Open decisions and risks

| Decision or risk | Impact |
| --- | --- |
| Region | Choose Supabase's specific region before creating the project. Supabase region changes require migration to a new project. Place the Vercel function near Supabase to reduce latency on API calls. [Supabase regions](https://supabase.com/docs/guides/platform/regions) · [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region) |
| First deployment and Preview data | Approve the initial Production deployment separately. Decide whether Preview is health-only or uses a second Supabase project and test data. |
| Cold starts and inactivity | Measure the first request and an authenticated request before the demo. Supabase Free projects can pause after one week of inactivity, and the process health check will still be green while the database is unavailable. Check the project from the dashboard before the demo. [Supabase Free pricing](https://supabase.com/pricing) |
| Free-tier limits | Supabase Free currently lists two active projects, a 500 MB database, 1 GB file storage, and separate 5 GB egress and cached-egress allowances. Vercel Hobby is for personal, non-commercial use and has usage caps. Confirm the intended use fits the plan. [Supabase pricing](https://supabase.com/pricing) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) |
| Photo uploads | Vercel's default function request limit is 4.5 MB. The app accepts up to 5 MiB, so some uploads can receive `413` before Nitro handles them. Use smaller demo photos until B1 moves uploads directly to Storage. [Vercel Functions limits](https://vercel.com/docs/functions/limitations#request-body-size) |
| Google and email | Decide whether to limit Google sign-in to demo test users. Google requires OAuth client credentials before you can enable the provider. Configure custom SMTP before relying on email confirmation or password reset for users outside the Supabase organization. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) |
| Domain | Use the generated Vercel URL for the initial check. Choose and approve a custom domain before changing DNS or canonical Auth redirects. |
