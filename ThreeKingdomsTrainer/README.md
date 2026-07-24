# Three Kingdoms Alias Trainer

A read/write trainer for **BLIND삼국** (`ThreeKingdomsAlias.exe`) that talks
to the game's renderer via Chrome DevTools Protocol. It does not modify any
file in the game's install directory.

## Prerequisites

- Node.js 20+
- Windows 10/11 x64
- The Steam release of BLIND삼국

## Setup

1. Follow `docs/steam-debug-launch.md` to add
   `--remote-debugging-port=9222` to the Steam launch options.
2. Install dependencies:

       npm install

3. Run in development (Vite + Electron together):

       npm run dev

4. Or run the smoke CLI alone:

       npm run smoke

## Build & package

    npm run package

Produces `out/Three Kingdoms Alias Trainer-0.1.0-x64.exe` (NSIS installer).

## Use

1. Launch the game from Steam.
2. Launch the trainer.
3. Confirm the status banner reads **Connected to game on 127.0.0.1:9222**.
4. Click **Run smoke**. The console will print likely window-state roots
   (`state`, `gameStore`, etc.).
5. Type a path like `state.player.gold` and a numeric value like `999999`,
   then press **Apply**. Refresh the game's gold display to see the change.

## Limits (v1)

- JSON scalar writes only. Arrays/objects are rejected.
- No lock / freeze. The change is one-shot; if the game overwrites the value
  on the next frame, re-apply.
- No hot-path presets. You must know the game's state shape.
