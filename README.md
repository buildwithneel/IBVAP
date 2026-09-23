# IBVAP — Frontend

Frontend only, matching your two wireframes: a Ministry of Home Affairs–style login screen and a border-camera monitoring dashboard.

## Stack
React + TypeScript + Tailwind CSS, built with Vite.
Two small libraries were added only because your own requirements need them:
- `react-router-dom` — to move between the Login page and the Dashboard pages
- `framer-motion` — for the page-change animation you asked for

No state management library, no UI kit, no CSS framework beyond Tailwind.

## Run it
```
npm install
npm run dev
```

## Structure
```
src/
  pages/Login.tsx        Wireframe 2 — emblem block + login form
  pages/Dashboard.tsx     Wireframe 1 — sidebar + camera grid + stats + alerts
  components/Sidebar.tsx  Dashboard, Camera Feed, Camera Alert, Reports, Guidance, User Details
  components/TopBar.tsx   live date/time
  components/CameraGrid.tsx
  components/StatsStrip.tsx
  components/AlertsPanel.tsx
  data/mockData.ts        placeholder camera/alert/stat data — replace with your API
```

## Design notes
- Palette follows a 60/30/10 split: neutral off-white/white for most of the UI, slate/navy for structure (sidebar, headers, borders), and color reserved strictly for live status and alerts (green = active camera, amber = warning, red = alert/critical).
- Font is Inter (`Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif`) with dominant Semi-Bold (600) weight for clear typographic hierarchy.
- Corners are rounded throughout (`rounded-2xl` on cards/tiles, `rounded-full` on buttons/pills) — no sharp edges anywhere.
- The only animation is the fade transition between Login and Dashboard, plus a pulse on live/alert indicators — kept deliberate rather than scattered.

## What's still a stand-in
- Login doesn't call a real auth endpoint — it just checks the fields aren't empty and navigates.
- Camera feeds are placeholder tiles, not real video streams.
- Camera Feed / Camera Alert / Reports / Guidance / User Details sidebar links route to `/dashboard/*` but don't have their own pages yet — happy to build those out next.
