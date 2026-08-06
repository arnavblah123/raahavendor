/**
 * Checks your two Supabase settings before you run the app.
 *
 *   npm run check
 *
 * This isolates "did I copy the right values" from "is the app broken",
 * which are otherwise very hard to tell apart from the error messages.
 *
 * Deliberately dependency-free and read-only.
 */
import { readFileSync, existsSync } from 'node:fs'

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'

const ok = (m, d) => console.log(`  ${GREEN}✓${RESET} ${m}${d ? `  ${DIM}${d}${RESET}` : ''}`)
const bad = (m, d) => console.log(`  ${RED}✗${RESET} ${m}${d ? `\n      ${DIM}${d}${RESET}` : ''}`)
const warn = (m, d) => console.log(`  ${YELLOW}!${RESET} ${m}${d ? `\n      ${DIM}${d}${RESET}` : ''}`)

function loadEnv() {
  const file = ['.env.local', '.env'].find((f) => existsSync(f))
  if (!file) return { vars: {}, file: null }
  const vars = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { vars, file }
}

console.log(`\n${BOLD}Checking your Supabase settings${RESET}\n`)

const { vars, file } = loadEnv()
if (!file) {
  bad('No .env.local file found', 'Run:  cp .env.example .env.local   then fill in your two values.')
  process.exit(1)
}
ok(`Found ${file}`)

const url = (vars.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
const key = vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let failed = false

// --- 1. Project URL ---------------------------------------------------------
if (!url) {
  bad('NEXT_PUBLIC_SUPABASE_URL is empty', 'Supabase dashboard → Project Settings → Data API → Project URL')
  failed = true
} else if (url.includes('supabase.com/dashboard')) {
  bad('That is the dashboard address, not the Project URL',
      `You pasted: ${url}\n      You need the one that looks like https://abcdefghijkl.supabase.co\n      Find it under Project Settings → Data API → Project URL.`)
  failed = true
} else if (/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|red)$/.test(url)) {
  ok('Project URL looks right', url)
} else {
  // Could be a self-hosted instance or a custom domain — unusual, not wrong.
  warn('Project URL is not a standard supabase.co address', `Got: ${url}  — carrying on, in case you are self-hosting.`)
}

// --- 2. The browser key -----------------------------------------------------
if (!key) {
  bad('No key set', 'Fill in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY on older projects)')
  failed = true
} else if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
  bad(`${RED}${BOLD}That is a SECRET key — remove it now${RESET}`,
      'A secret key bypasses every security rule. Delete it from .env.local, and rotate it in\n      Supabase → Project Settings → API Keys. Use the Publishable key instead.')
  failed = true
} else if (key.startsWith('sb_publishable_')) {
  ok('Publishable key found', `${key.slice(0, 22)}…`)
} else if (key.startsWith('eyJ')) {
  // Legacy JWT key — check it is the anon one, not service_role.
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString())
    if (claims.role === 'service_role') {
      bad(`${RED}${BOLD}That is the service_role key — remove it now${RESET}`,
          'It bypasses every security rule. Use the anon public key instead.')
      failed = true
    } else {
      ok('Legacy anon key found', `role=${claims.role}`)
    }
  } catch {
    warn('Key looks like a JWT but could not be read', 'Re-copy it from the dashboard.')
  }
} else {
  warn('Key format not recognised', `Starts with: ${key.slice(0, 12)}…  — expected sb_publishable_ or eyJ`)
}

if (failed) {
  console.log(`\n${RED}Fix the above, then run this again.${RESET}\n`)
  process.exit(1)
}

// --- 3. Can we reach the project? ------------------------------------------
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function get(path) {
  const res = await fetch(`${url}${path}`, { headers })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text }
}

try {
  const health = await get('/auth/v1/health')
  if (health.status === 200) ok('Login service is reachable')
  else if (health.status === 401) {
    bad('Project reachable but the key was rejected', 'Re-copy the Publishable key — it may be truncated or from a different project.')
    process.exit(1)
  } else warn(`Login service returned ${health.status}`, health.text.slice(0, 120))
} catch (e) {
  bad('Could not reach your project', `${e.message}\n      Check the Project URL, and that the project is not paused (Supabase dashboard → your project).`)
  process.exit(1)
}

// --- 4. Did the migration run, and is security on? -------------------------
const probe = await get('/rest/v1/orders?select=id&limit=1')
const code = probe.json?.code
const message = probe.json?.message || ''

if (code === '42P01' || /relation .* does not exist|Could not find the table/i.test(message)) {
  bad('The orders table does not exist',
      'Step 2 has not been run yet. Paste supabase/migrations/0001_init.sql into the\n      Supabase SQL Editor and press Run.')
  process.exit(1)
}

if (probe.status === 200 && Array.isArray(probe.json)) {
  bad(`${RED}${BOLD}SECURITY PROBLEM: anyone can read your orders without logging in${RESET}`,
      'The migration should have revoked access for the anonymous role. Re-run\n      supabase/verify_setup.sql and check the "Public access blocked" row.')
  process.exit(1)
}

if (code === '42501' || probe.status === 401 || probe.status === 403) {
  ok('Tables exist and are locked to signed-in users only', 'anonymous access refused, as intended')
} else {
  warn(`Unexpected response from the orders table (${probe.status})`, probe.text.slice(0, 160))
}

// --- 5. Reference data seeded? ---------------------------------------------
const settings = await get('/rest/v1/app_settings?select=id&limit=1')
if (settings.json?.code === '42P01') {
  warn('app_settings table missing', 'The migration may not have finished. Re-run supabase/verify_setup.sql.')
} else {
  ok('Settings table present')
}

console.log(`\n${GREEN}${BOLD}All good.${RESET} Your settings are correct and the database is set up.`)
console.log(`Next:  ${BOLD}npm run dev${RESET}  then open http://localhost:3000\n`)
