# Working on Raaha Vendor Tracker

## How the owner wants deliverables

The owner runs this app for their shop and does **not** have tools to open
HTML, SQL or CSV files on their own machine. So:

- **Never hand over a loose file as the deliverable.** Put it in this
  repository (it is private) and push it, then give the GitHub link.
- **Anything that needs to reach the database goes through the app**, as a
  button an admin can tap in Settings — not as SQL to paste. The one
  exception is the numbered migrations in `supabase/migrations/`, which the
  README already walks the owner through.
- **Data carried over from the old software lives in `data/`** (see
  `data/vendors/`), in JSON that the app can read, plus a CSV that GitHub
  renders as a table so the owner can check it in the browser.
- Keep the plain-language docs (`README.md`, `HOW-TO-USE.md`) current when a
  screen changes. The owner and staff read those, not the code.

## Before you push

```bash
npx tsc --noEmit && npm test && npm run build
```

Migrations can be exercised on a local Postgres 16 by stubbing the `auth`
and `storage` schemas; see the SQL functional test approach in the history of
migration 0002.

## Things that must stay true

See "Things worth knowing before you change anything" in `README.md`: dates
are IST strings, money lives in separate admin-only tables, the original
promised date is never edited, and every multi-row write is one database
function.
