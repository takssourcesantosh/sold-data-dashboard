# Spreadsheet App

Browser-based spreadsheet with SQLite persistence. No backend, no cloud.

## Stack

- **React + Vite** — fast dev/build
- **sql.js** — SQLite compiled to WASM, runs entirely in-browser
- **IndexedDB** — persists the SQLite binary between sessions
- **@tanstack/react-virtual** — virtual scrolling for 10k+ rows
- **papaparse** — CSV parsing

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Usage

1. **Upload CSV** — drag-and-drop anywhere on the page, or click "Upload CSV" button
2. **Edit cells** — double-click any cell to edit; Tab to move between cells, Enter/Esc to commit/cancel
3. **Sort** — click any column header to sort asc/desc
4. **Search** — type in the search bar to filter all rows in real time
5. **Export** — click "Export" to download the current (filtered) data as CSV
6. **Persistence** — data survives page refresh via IndexedDB

## Notes

- All data stays local — nothing is sent to any server
- SQLite DB is auto-created from CSV column names on upload
- Column types are all TEXT; SQLite handles sorting lexicographically
- Uploading a new CSV replaces the existing table
