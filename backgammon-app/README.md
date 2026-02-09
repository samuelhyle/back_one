# Backgammon Lounge (local)

## Run

```bash
npm install
npm run dev
```

Open the URL shown in your terminal (usually http://localhost:5173).

## Multiplayer (local testing)

This build uses a localStorage-backed `window.storage` shim, so you can test two players by opening two tabs in the **same** browser:
- Tab 1 → Create New Game
- Tab 2 → Join Available Game

To make it real multiplayer across devices, replace `window.storage` with a real backend (WebSockets / Supabase / Firebase / etc.).
