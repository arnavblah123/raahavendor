# Raaha Vendor Tracker

A vendor order follow-up and delivery tracker for **Raaha by Archana Bansal**.

Its single job: every morning, tell you exactly which vendors you must chase
today — and never let an order go quiet.

**Running cost: ₹0 per month.** Vercel's free plan plus Supabase's free plan.
No SMS gateway, no WhatsApp API, no background jobs, nothing that bills you.

---

## Setting it up

This takes about fifteen minutes. You do not need to know how to code — just
follow the steps in order.

### Step 1 — Create a Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign up (free).
2. Click **New project**.
3. Give it a name (`raaha-vendor-tracker`), choose a database password, and pick
   the region closest to you — **Mumbai (ap-south-1)** if you are in India.
4. Wait about two minutes while it is created.

### Step 2 — Create the database tables

1. In your new project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/migrations/0001_init.sql` from this project, copy
   **everything** in it, and paste it into the editor.
4. Click **Run**.
5. Click **New query** again and do the same with
   `supabase/migrations/0002_po_and_inward.sql`. This one adds photos and
   measurements on order items, purchase orders, inwarding, and the private
   storage bucket the photos live in.

You should see *Success. No rows returned* both times. That is correct — it
has just built all the tables, security rules, indexes and the photo bucket.

You only ever do this once, in that order.

> **Already running the app before purchase orders existed?** Just run
> `0002_po_and_inward.sql` on your existing project. Nothing you have entered
> is touched. New orders are numbered `RAAHA-ORD-…` from now on so they cannot
> be confused with purchase order numbers; old orders keep their numbers.

### Step 3 — Create your login

1. Click **Authentication** in the left sidebar, then **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email and a password. Turn **Auto Confirm User** ON.
4. Click **Create user**.

> **Important:** the *first account created* automatically becomes the admin.
> This happens the moment you click **Create user** — not when they first sign
> in. So create your own login before anybody else's.
>
> If you get the order wrong, fix it in the SQL Editor:
>
> ```sql
> update profiles set role = 'admin'
>  where id = (select id from auth.users where email = 'you@raaha.in');
>
> update profiles set role = 'staff'
>  where id = (select id from auth.users where email = 'someone.else@raaha.in');
> ```
>
> To see who currently holds which role:
>
> ```sql
> select u.email, p.role
>   from profiles p join auth.users u on u.id = p.id
>  order by p.role, u.email;
> ```

### Step 4 — Copy your two settings

1. Click **Project Settings** (the gear icon) → **API Keys**.
2. You need two values:
   - **Project URL** — under *Project Settings → Data API*. It looks like
     `https://abcdefghijkl.supabase.co`
   - **Publishable key** — on the **API Keys** tab. It starts with
     `sb_publishable_`. If you do not see one, click **Create new API keys**.

Keep this tab open — you will paste them in the next step.

> **If your project is older than November 2025** it will have an *anon public*
> key (a long string starting with `eyJ`) on a **Legacy** tab instead. That
> works too — use it, and put it on the `NEXT_PUBLIC_SUPABASE_ANON_KEY` line in
> Step 5 rather than the publishable one.

> Never copy a **Secret key** (`sb_secret_…`) or the old **service_role** key.
> The app does not need one, and it would bypass every security rule you just
> set up in Step 2.

### Step 5 — Run it on your computer

Open a terminal in this project folder and run:

```bash
npm install
cp .env.example .env.local
```

Open the new `.env.local` file in any text editor and paste your two values
after the `=` signs. Save it.

Now check them before starting the app:

```bash
npm run check
```

This tells you in plain language whether the URL and key are right, whether the
project is reachable, whether Step 2 actually ran, and whether your data is
properly locked to signed-in users. It will also stop you if you have pasted a
secret key by mistake. Fix anything it flags, then:

```bash
npm run dev
```

Open **http://localhost:3000** and sign in with the email and password from
Step 3.

### Step 6 — Put it online

The easiest way needs no command line at all, and re-deploys itself every time
the code changes.

1. Go to **[vercel.com](https://vercel.com)** and sign in **with GitHub**.
2. Click **Add New… → Project**.
3. Find `raahavendor` in the list and click **Import**.
4. Leave every build setting alone — Vercel detects Next.js on its own.
5. Open **Environment Variables** and add the same two from your `.env.local`:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |

   (Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead if you have an older project.)

   **Add them before the first deploy.** If you forget, the build succeeds but
   every page fails with "Supabase is not configured" until you add them and
   redeploy.

6. Click **Deploy** and wait two or three minutes.

You will get a link like `raahavendor.vercel.app`. Open it on your phone and
use **Share → Add to Home Screen** so it behaves like an app.

From then on, every push to the `claude/raaha-vendor-tracker-9lrnii` branch
deploys automatically.

#### After the first deploy

In Supabase, go to **Authentication → URL Configuration** and set **Site URL**
to your new Vercel address. Nothing breaks if you skip it today — the app signs
in with a password and never sends a link — but it matters the day you want
password-reset emails to work.

> **Forgotten passwords** are reset by you, in Supabase under
> **Authentication → Users → … → Reset password**. There is deliberately no
> "forgot password" link in the app.

### Step 7 — Add your team

Add each staff member in Supabase under **Authentication → Users**, exactly as
you did for yourself in Step 3. Everyone after the first account becomes
**staff** automatically, and they appear in **Settings → Users** in the app
straight away, where you can promote or disable them.

---

## Who can see what

| | Admin (you) | Staff |
|---|---|---|
| Place orders, log follow-ups, record dispatch | ✅ | ✅ |
| Add photos and measurements to an order | ✅ | ✅ |
| Raise a purchase order, print it, send it | ✅ | ✅ |
| Inward goods against a PO and flag problems | ✅ | ✅ |
| Type in the invoice price at inward | ✅ | ✅ writes it, never reads it back |
| Resolve a flagged piece | ✅ | ❌ |
| Add and edit vendors | ✅ | ✅ |
| See order amounts, advances, payment terms, PO rates | ✅ | ❌ never sent to their device |
| Change the original promised date | ✅ | ❌ |
| Cancel a purchase order, delete anything | ✅ | ❌ |
| Settings page | ✅ | ❌ |

Staff genuinely cannot see money — the amounts are kept in separate tables that
their login has no permission to read, so the numbers never even reach their
phone. It is enforced by the database, not just hidden in the screen.

---

## How the reminders work

When you place an order you enter the lead time the vendor quoted, for example
45 days. The app works out the expected dispatch date and schedules follow-up
reminders along the way — by default at 30%, 50%, 75% and 90% of the lead time,
plus the expected date itself.

For an order placed on 1 September with a 45-day lead time you would be
reminded on **15 Sep, 24 Sep, 5 Oct, 12 Oct** and **16 Oct**.

Once the promised date has passed, a fresh reminder appears every 3 days until
the goods are dispatched or the order is cancelled.

**These are worked out from dates in the database each time the app is opened.**
There is no scheduled job and no server running in the background — which is
exactly why the app costs nothing to run. It also means reminders will not
disappear if you do not open the app for a week; they will all be waiting.

If a vendor asks for more time, record the new date when you log the follow-up.
The app then:

- keeps the **original** promised date untouched, so all your delay figures stay
  honest,
- reschedules the remaining reminders across the days that are actually left,
- and adds a red **Revised 3×** badge so a vendor who keeps pushing is obvious.

You can change the percentages, or add your own schedule, in **Settings**.

---

## Photos, measurements, purchase orders and inwarding

The order is the *promise*; the purchase order is the *document*; the inward
is the *proof*. Each step checks the previous one.

1. **Placing the order** — for every piece the form asks for a **photo** of
   what is being ordered and, if the vendor is making it to size, the
   **measurements**. Neither is compulsory, but if either is missing the app
   makes you say so before the order goes in. Photos are shrunk on the phone
   and kept in a private storage bucket only signed-in users can open.
2. **Raise the PO** — one tap after placing the order (or any time later from
   the order page). The number is generated automatically as
   `PO/2026-27/0001` and restarts every financial year; it is generated inside
   the database, so two people raising POs at the same moment can never get the
   same number. The PO lists every piece with its photo and measurements,
   prints on A4, saves as PDF from the print dialog, and can be sent on
   WhatsApp. Rates appear on it only when an admin raises it.
3. **Inward the goods** — when the parcel arrives, open the order and tap
   **Inward goods**. For every line you enter how many came and the price on
   the vendor's invoice. If the order carried measurements you measure the
   piece again and type what you get; the app shows the difference next to
   each. **Any difference at all switches the flag on** and asks you to write
   down what is wrong. You can also flag a piece by hand for anything else —
   damage, wrong colour, wrong fabric.
4. **The owner decides** — flagged pieces appear on the dashboard and on the
   **Inwards** page until an admin marks them as seen, with a note on what was
   decided. Staff see the note on the order afterwards.

Inwarding keeps the rest of the app honest: pieces that arrived were
necessarily sent, so if the dispatch was never logged the app records it for
you, and when the last piece is in the order moves to **Received** on its own.
A partial inward asks for the vendor's promised date for the balance, exactly
as a partial dispatch does.

---

## Everyday use

See **[HOW-TO-USE.md](./HOW-TO-USE.md)** — written in plain language for staff.

---

## For a developer

```bash
npm run dev     # development server
npm run build   # production build
npm test        # unit tests for the scheduling logic
```

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Supabase
(Postgres + Auth + Row Level Security) · date-fns · Recharts.

Server Components do the reading, Server Actions do the writing. There is no
separate backend.

### Where things live

```
app/(app)/          the signed-in screens
  page.tsx            morning dashboard
  orders/             list, place order, order detail
    [id]/po/          the printable purchase order
    [id]/inward/      goods receipt against the PO
  inwards/            flagged pieces for the owner, and the receiving log
  vendors/            list, add, scorecard
  reports/  settings/
  actions.ts          every write in the app
lib/
  followups.ts        the scheduling ladder — pure, no database, fully tested
  scorecard.ts        vendor grading and fill rate — also pure
  measurements.ts     ordered-vs-measured comparison and flagging — pure, tested
  po.ts               financial-year PO numbering and the PO WhatsApp text
  images.ts           shrinks a phone photo before upload
  dates.ts            calendar dates in IST (never the server's timezone)
  money.ts            ₹ in the Indian lakh/crore system
  whatsapp.ts         message templates and wa.me links
  queries.ts          server-side reads
supabase/migrations/  the schema, security rules and database functions
  0001_init.sql         orders, follow-ups, dispatches
  0002_po_and_inward.sql photos, measurements, purchase orders, inwarding
tests/                unit tests for scheduling, money, measurements and PO numbering
```

### Things worth knowing before you change anything

- **Dates are `'YYYY-MM-DD'` strings, not `Date` objects.** Vercel runs in UTC
  while the shop runs in IST. If "today" came from `new Date()` the dashboard
  would roll over at 5:30 AM IST and every morning's list would be wrong. Use
  `todayIST()` and the helpers in `lib/dates.ts`.
- **`lib/followups.ts` takes `today` as an argument** and never reads the clock.
  That is what makes the scheduling rules testable.
- **`original_expected_dispatch_date` is never edited.** A database trigger
  blocks staff from changing it. Every delay figure measures against it.
- **Money lives in `order_finance`, `order_item_finance` and `vendor_finance`.**
  Postgres row-level security cannot hide individual *columns*, and in Supabase
  every logged-in user is the same database role — so hiding money from staff
  requires separate tables with their own policy. Do not move those columns back
  into the main tables.
- **Dispatch, revision, order creation, PO creation and inwarding each run
  inside one database function**, so a half-applied dispatch or inward cannot
  corrupt the piece counts.
- **Photos never touch the Next.js server.** The browser shrinks the image and
  uploads it straight to the private `order-photos` bucket with the user's own
  session; pages render short-lived signed links. Nothing is public.
- **Invoice prices at inward are write-only for staff.** The
  `inward_item_finance` table lets a member insert but only an admin select, so
  the person holding the invoice can type it in without the app ever showing
  them a price. `purchase_order_finance` follows the same admin-only rule as
  `order_finance`.
- **`qty_received` is not `qty_dispatched`.** Dispatched is what the vendor
  sent; received is what has been inwarded at the shop. `record_inward()`
  keeps the two consistent by logging a dispatch for anything that arrived
  without one.

### If you want the daily email digest later

It is deliberately not built — it would be the only thing needing a scheduled
job. The clean way to add it: one Vercel Cron entry hitting a route that calls
`getDashboard()` and sends the result through Resend's free tier. Nothing in the
current design needs to change to allow it.
