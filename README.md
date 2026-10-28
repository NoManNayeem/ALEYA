# ALEYA: The Last Ferry (শেষ খেয়া) — Episode 1 web MVP

PlayCanvas 2 + TypeScript + Vite. See `docs/ALEYA_PRD_Web_MVP_FIXED.md` for the product spec.

## Run
```bash
npm install
npm run dev          # http://localhost:5173  (?debug exposes window.__aleya QA hooks)
npm run build        # provenance + license gates, then static build in dist/
npm run preview
```

## Test
```bash
npm test                                   # unit: domain, puzzles, saves (1000-cycle IndexedDB), content + localization
node tools/dev/playthrough.mjs A|B [url]   # automated full playthrough to ending A or B (needs dev/preview server)
node tools/dev/shot.mjs [url] '[steps]'    # scripted screenshots
```

## Layout
- `apps/web` — shell, coordinator (boot/menu/play/pause/finish), platform adapter, input devices
- `packages/game-core` — engine-independent rules: flags, quests, inventory, journal, puzzles P1–P6 + reconstruction, threats, nav, input actions, settings, versioned saves, narrative director
- `packages/renderer-pc` — PlayCanvas stage, quality profiles, procedural materials/prefabs, skinned characters, camera director, rain/lightning, water
- `packages/audio` — Web Audio buses, synthesized ambience/SFX/score, voice placeholders
- `packages/ui` — HTML/CSS screens, HUD, puzzle widgets (pointer/keyboard/gamepad)
- `packages/content-schema` — zod schemas + cross-reference/localization validator
- `content/episodes/ep01` — scene manifests, sequences, dialogue, puzzles, quests, strings (bn, en)
- `tools/asset-pipeline` — character builder, provenance + dependency-license gates

## Assets & licensing
All environment art, textures and audio are generated from code (original, CC0). Characters are built from
CC0 MakeHuman assets: `python3 -I tools/asset-pipeline/build_characters.py`. Provenance is in
`docs/ASSET_LICENSES.csv`; after reviewing a changed source run
`node tools/asset-pipeline/verify-provenance.mjs --rehash`. Records are marked as needing human legal sign-off before release.

## Known gaps vs. the PRD (human production work)
Recorded Bangla voice performances (placeholder murmur now), composed score (generative placeholder),
hand-authored character art/mocap, native-speaker Bangla QA, cross-browser/device performance matrix, mobile packaging.
