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

## Run locally

This is a dependency-free static website. Open `index.html` in a browser, or serve the project folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Data notes

The data model is isolated in `js/storage.js` to keep a future backend/API migration simple. At the moment, browser storage belongs to the current browser and device: clearing browser site data removes the records. Export records regularly before clearing browser data.
