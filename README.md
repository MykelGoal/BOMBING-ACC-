# Ledgerly

A clean personal debt record book for everyday lending. Record debts in one line, view every person's balance and history, and export your records when needed.

## What it does

- **Fast entry:** write `Michael +500` when you lend money and `Michael -200` when Michael pays back.
- **Smart name matching:** start typing an existing name such as `DJ`; matching people appear instantly. Select one with a click or the arrow keys, then finish the amount.
- **Live totals:** the dashboard calculates every outstanding balance automatically.
- **Full history:** each transaction carries its exact saved date and time.
- **Correction controls:** each history item has **Edit** and **Delete** actions. Deleting a mistaken entry asks for confirmation and recalculates the balance immediately.
- **Personal records:** search or select a person to see their complete ledger and add entries directly.
- **Private by default:** records are stored only in the browser's `localStorage`; no account or server is required.
- **Export:** download all data as a CSV file from **Export records**.
- **Installable app:** the site is a Progressive Web App (PWA). On a supported browser, choose **Install app** or use the browser menu’s **Add to Home screen** option to use it like an app.

## Project structure

```text
index.html          Application markup
styles.css          Responsive visual design
js/
  app.js            Application controller and event handling
  storage.js        Versioned localStorage data layer
  format.js         Parsing, money/date formatting, safety helpers
  ui.js             Reusable DOM rendering helpers
```

## Cloud login and sync

The app is wired to the supplied Supabase project and supports simple email-and-password accounts. A person opens the site, chooses **Create an account**, and creates their own private login; no administrator needs to know their email in advance.

1. In **Supabase → SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). This creates the protected customer and transaction tables.
2. In **Supabase → Authentication → Sign In / Providers → Email**, keep **Enable email signup** on and turn **off** “Confirm email”. With confirmation off, creating an account signs the person straight in — no Gmail confirmation email is needed. The app attempts instant login automatically after signup; it only asks for an email confirmation when this setting is still enabled. (Turn “Confirm email” back on before a public launch if you want to verify email addresses.)

Each account’s data is isolated by Row Level Security and syncs after every change.

## Run locally

This is a dependency-free static website. Open `index.html` in a browser, or serve the project folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Data notes

The data model is isolated in `js/storage.js` to keep a future backend/API migration simple. At the moment, browser storage belongs to the current browser and device: clearing browser site data removes the records. Export records regularly before clearing browser data.
