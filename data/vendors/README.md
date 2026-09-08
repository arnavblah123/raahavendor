# Vendor list from the old software

Sixty vendors extracted from the vCard export of the previous software, cleaned
up for this app.

| File | What it is |
|---|---|
| `raaha-vendors.csv` | The list as a spreadsheet. GitHub shows it as a table — click it. |
| `vendors.json` | The same list, read by the **Import vendors** button in the app's Settings page. |
| `raaha-vendors-import.sql` | The same list as SQL, for anyone who prefers the Supabase SQL Editor. Not needed if you use the button. |
| `vendor-book.html` | A searchable page of the list. Download and open in a browser. |

## How they get into the app

They load themselves. The first time anyone opens the Today, Vendors or Place
order screen after a deploy, every vendor not already in the app is added.
Names that already exist are skipped, so this can run on every visit and never
duplicates. There is also an **Import vendors** button under Settings, which
runs exactly the same code by hand.

## What was cleaned up

- The "DEFAULT" placeholder record from the old software was dropped.
- Phones are stored as +91 numbers so Call and WhatsApp work. Kanya and
  Nilesh Creations have Delhi landlines (Call works, WhatsApp will not).
- R.F. Couture and Shubhandam had dummy numbers (1234567890-style) in the old
  software; their phone is left blank with a note saying so.
- The city is derived from the pincode where the old software only stored an
  area name; the area and pincode are kept in the notes.
- Categories are set to Other (Embroidery for Bhairav Embro Design). Change
  them on each vendor's page as you go.
