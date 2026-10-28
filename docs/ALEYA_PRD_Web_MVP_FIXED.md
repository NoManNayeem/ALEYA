# ALEYA: THE LAST FERRY (শেষ খেয়া)
## Web-first MVP Product Requirements Document and Implementation Specification
**Document status:** Implementation baseline v1.0  
**Date:** 28 October 2026  
**Product:** Single-player, story-driven, photorealistic 2.5D mystery-adventure game  
**Release 1:** Desktop web (Windows/macOS/Linux browsers); responsive UI and mobile-ready game core  
**Future releases:** Android and iOS using a shared web game runtime inside a mobile host (Tauri 2 preferred for evaluation; Flutter WebView alternative)

> This PRD describes a ship-ready first episode, not a demo or a vertical slice. All budgets, times, and performance figures below are **design targets to validate**, not guarantees. The initial scope assumes a small cross-functional team and an original, openly licensed content pipeline.

## 1. Executive product decisions

| Decision | MVP specification |
|---|---|
| Experience | Suspense-driven investigation, environmental puzzles, 2 short escapes, cultural storytelling, cinematic exploration |
| Duration | 60-90 minutes for a first-time player; minimum 50 minutes observed in usability testing without artificial padding |
| Story | Fully resolved central mystery; two distinct epilogues; sequel hook after credits |
| Scope | Five connected playable spaces; 6 mandatory puzzles; 2 optional investigations; 3 speaking roles; 1 playable character |
| Graphics | Realistic 3D foreground and interactive props, PBR materials, high-fidelity backgrounds, wet surfaces, fog, rain, carefully art-directed lighting |
| Controls | Keyboard/mouse first; full gamepad parity; touch input designed now, shipped when mobile is tested |
| Platform | Modern desktop browsers with WebGL2; optional WebGPU feature path |
| Code | PlayCanvas Engine (MIT), TypeScript, Vite, standalone/self-hosted deployment |
| Licensing | Only approved open-source libraries and CC0/OFL/original rights-cleared art, music, dialogue, and sound |
| Business | Initial release with no mandatory account, no advertisements, no monetization dependency, and no analytics that block gameplay |

**North-star quality bar:** A player can open the game URL, select a graphics preset, complete the entire episode, understand the ending, see credits and licenses, and resume an interrupted session, without needing a developer's help.

## 2. Audience, proposition, positioning

**Primary audience:** Bengali- and English-speaking story-game players (approx. 16+), including the Bangladeshi diaspora, who value narrative, atmosphere, culturally grounded settings, and accessible puzzles. Rating and age classification must be determined before distribution.

**Player promise:** "An ordinary night by a Bangladeshi river turns into an unforgettable mystery. Every place tells a story; every sound matters."

**Distinctive advantages:** Specific Bangladesh delta architecture and objects (tea stall, jetty, tin-roof shops, cycle rickshaw, launch horn, rice sacks, Bangla signage), Bangla-first voice performance, monsoon-based tension, and a compact authored story with console-like cinematic craft.

**Three experience pillars:**
1. **Real place, impossible event.** Grounded materials, weather, voices, and believable physics contrast with subtle supernatural uncertainty.
2. **Constant narrative movement.** A new clue, risk, character beat, traversal event, or meaningful interaction every ~2-4 minutes; avoid empty walking.
3. **Deliberate restraint.** Tension via lighting, sound, framing, and implication, not combat or constant jump scares.

## 3. Boundaries and non-goals

**Included:** Full title-to-credits story; five levels; six mandatory puzzles; clue journal; local autosave/continue; pause/settings; graphics scaling; localized subtitles; environmental audio; two endings; keyboard/gamepad support; legal credits and asset provenance; deployment and monitoring; automated smoke tests.

**Not included in MVP:** Open world; multiplayer; online leaderboards; account/cloud saves; AI-generated live dialogue; procedural narrative; user-generated levels; monetization; custom character creator; vehicle driving; complex NPC schedules; full combat; VR; native Android/iOS apps at initial launch; massive freely explorable Sundarbans; 4K source textures delivered uncompressed.

**Important scope rule:** Existing assets may be 8K sources, but *shipped* textures must be LOD/quality-managed and bandwidth-aware. "Ultra-realistic" means convincing composition and materials, not indiscriminately maximum texture resolution.

## 4. Narrative bible: complete episode

**Premise.** Twelve years ago, a river ferry disappeared during a monsoon after a night of clandestine riverbank excavation. Asha, now a photojournalist, returns to her family's village when she receives an archived voice message from her missing younger brother, Rafi. A distant horn is heard on nights of heavy rain. Villagers call moving wetland lights 'Aleya'.

**Central question:** What happened to the people on the ferry, and why did the town bury the evidence?

**Canonical truth (revealed in MVP):** An improperly managed riverbank operation destabilized the approach to a jetty during a storm. Ferry crew diverted the vessel to take stranded people aboard; a bank collapse and strong current caused the ferry to ground in a hidden channel. The loss was concealed to protect those responsible. The apparent recent message was queued for delivery from a recovered storage device connected to the ferry incident. The flickering lights remain deliberately ambiguous, so folklore enriches the setting without substituting for plot logic. The episode definitively reveals what happened to the ferry and to Rafi.

**Player character:** Asha, late-20s photojournalist. Practical and determined rather than a fighter. She carries a raincoat, notebook/camera, lantern, and radio.

**Supporting voices:** Karim, older jetty caretaker with an unreliable memory; Mira, boat mechanic who assists by radio; Rafi, heard through carefully authored archived audio. A distorted silhouette called the River Watcher is an environmental threat, not a combat enemy.

**Acts:**
- **Act I / Return (0-18 min):** Asha arrives at a deserted ghat in a thunderstorm, restores a generator, and hears a voice from a disconnected radio.
- **Act II / Contradictions (18-40 min):** Market evidence contradicts official accounts; Asha discovers ferry loading records and a buried map.
- **Act III / Crossing (40-60 min):** Floodwater rises; a ruined embankment must be traversed; the moving lights lead to a hidden ferry route.
- **Act IV / Last Ferry (60-80 min):** Investigate the stranded vessel, reconstruct the crash, recover Rafi's final record, and confront the caretaker's cover-up.
- **Epilogue (80-90 min):** Choose to expose the truth immediately or protect a vulnerable surviving witness while preserving the evidence. Both conclusions close this incident; a post-credits light on a distant river hints at the next episode.

**Ending A / The Record:** Asha sends the evidence; the missing passengers are finally named publicly. Cost: the remaining witness faces scrutiny.

**Ending B / The Witness:** Asha secures the witness and evidence before disclosure. Cost: the truth is delayed but preserved. A meaningful difference in cutscene, dialogue, and credits epilogue; neither ending withholds the basic answer.

## 5. Level-by-level content and acceptance

| ID / Scene | Target time | Key environments | Gameplay | Required moment and completion |
|---|---:|---|---|---|
| L01 / The Ghat | 0-15m | Wooden jetty, ferry shelter, tea stall, muddy steps | movement tutorial, inspect lantern, breaker puzzle P1 | Lights return; horn heard from river; exit gate opens |
| L02 / Silent Bazaar | 15-35m | Closed shopfronts, rickshaw stand, flooded alley, old radio | ledger evidence P2, radio-frequency puzzle P3, optional photo O1 | Reveal first contradiction and blocked channel on hand map |
| L03 / Broken Embankment | 35-50m | Flooded walkway, bamboo footbridge, culvert | gate valve/flow puzzle P4, traversal and first escape | Open route to hidden bank; save before escape |
| L04 / The Lights | 50-65m | Reeds and mangrove-like creek, overturned boat, lookout | lantern signal puzzle P5, stealth/avoidance and optional shrine clue O2 | Discover ferry outline in the mist |
| L05 / The Last Ferry | 65-90m | Partially grounded passenger vessel, lower deck, wheelhouse | mechanical lock P6, clue reconstruction, final chase, choice, 2 epilogues | Complete ending and credits; chapter-complete flag |

**World constraint:** Scenes are compact 2.5D authored corridors with occasional depth branches. All five locations load independently through a scene manifest, allowing later episodes to add packages without rewriting the runtime.

**Scene quality checklist per location:** established geography; hero vista; path readable without an arrow clutter; 8-20 reactive props; background audio bed; foreground occluders; two distinct lighting beats; at least one camera event; at least one memorable non-interactive environmental detail; navigation collision verified; low/high asset versions; checkpoint; credits/provenance for every asset.

## 6. Gameplay systems and detailed rules

### 6.1 Movement and traversing
- Character moves on X (left/right), Z (limited depth), Y (height). The player cannot walk arbitrarily behind backdrop geometry.
- Walk approximately 1.6 m/s; run approximately 2.8 m/s; crouch approximately 0.8 m/s. Tune by usability testing to camera scale.
- Controls use normalized movement vectors and acceleration/deceleration, not animation-only displacement. Visual root motion may be blended but must not undermine collision.
- Edge detection prevents accidental falls where no scripted fall is intended. Drop-downs and jumps only where explicitly authored.
- `Idle`, `Walk`, `Run`, `Crouch`, `Interact`, `Climb`, `Stumble`, `Hide`, `Cutscene` are the minimum player states.

### 6.2 Interact, inspect, and clues
- Nearest valid interactable within approximately 1.7m highlights subtly when in view. Highlight can be disabled in accessibility settings.
- Interaction prompt uses a verb and object, e.g. `E | Read ledger` or Bengali equivalent; not a generic question-mark icon.
- Collectible clues remain in a journal with exact observed description, photo/illustration, timestamp or scene tag, and `new` status.
- Inventory is intentionally limited to **six key items**; non-story junk does not accumulate.
- Interaction supports click/tap, keyboard, and gamepad activation through the same action API.

### 6.3 Puzzles (six required)
| Puzzle | Input mechanic | Solution knowledge | Failure / hint / accessibility |
|---|---|---|---|
| P1: Breaker | inspect and connect 3 switches | fuse diagram in tea stall | no timer; hint after 90s |
| P2: Ferry ledger | match 4 entries to names/times | documents gathered in bazaar | no permanent wrong answers |
| P3: Radio | tune three frequency bands and order fragments | observed numbered radio labels | audio has subtitles and visual waveform |
| P4: Floodgate | rotate 3 valves and read water gauges | chalk diagrams on culvert | reset button; no physics deadlock |
| P5: Lantern signals | repeat 4-beat light pattern | visual sequence across creek | color-blind patterns and optional slow mode |
| P6: Wheelhouse lock | operate gearbox and align 3 toothed disks | captain's notes and metal wear | wrong solution resets mechanically, does not punish |

**Hint protocol:** No unsolicited hints before ~90 seconds of inactivity in the puzzle. Optional contextual hint levels 1 (attention), 2 (interpretation), 3 (explicit solution). Store hints separately from objective progress. `Skip puzzle` is an accessibility option enabled after repeated failures, flagged in the save for analytics only if user opted in.

### 6.4 Danger and fail states
- Exactly two scripted pursuit sequences plus one slow avoidance passage; no free-roaming combat AI.
- Threat logic uses `Dormant -> Telegraph -> Approach -> Pursue -> Search -> Reset/Exit`, with audiovisual warning before failure.
- On failure: minimal 2-4 second transition, checkpoint reload, no clues lost. No punitive long replay.
- The River Watcher never enters a puzzle area while the player is reading text. Threat sequences can be softened in accessibility settings.

### 6.5 Progress and pacing
- Minimum one narrative or gameplay event every 2-4 minutes in internally timed playthroughs.
- A scene objective should be readable in one sentence. Journal expands supporting clues without spoiling upcoming scenes.
- No collectible is required for progression unless it is unmissable or recoverable.
- Player choices determine ending, but cannot prevent the core mystery from resolving.

## 7. Controls and input abstraction

| Action | Keyboard | Gamepad | Later mobile mapping |
|---|---|---|---|
| Move | A/D or Left/Right; W/S or Up/Down for authored depth | Left stick | Virtual left stick |
| Interact / confirm | E or Enter | South face button | Context-sensitive tap button |
| Run | Left Shift | Right trigger | Run button / optional auto-run |
| Crouch / hide | Left Ctrl or C | East face button | Crouch button |
| Lantern | F | Right bumper | Lantern button |
| Inspect / journal | Tab or J | View / select | Journal icon |
| Aim lantern (if needed) | Mouse position or keyboard directional focus | Right stick | Touch drag in camera-safe zone |
| Pause / settings | Escape | Menu / Start | Pause icon |
| Puzzle navigation | Arrow/Tab + Enter; pointer | D-pad/stick + confirm | Direct touch |

**Input requirements:** All remappable keyboard controls; no action requires precise mouse aiming; keyboard-only puzzle completion; no hold longer than one second when an alternative exists; optional toggle-run; dead zones configurable for gamepad. `InputActions` is independent of PlayCanvas devices and supplies semantic actions to gameplay systems.

## 8. Cinematography and camera direction

**Camera grammar:** Perspective camera constrained on a spline/rail; 30-50mm equivalent framing as a starting artistic reference, adapted to gameplay visibility. Do not use free orbit in the MVP. Use foreground objects for parallax, slight lateral camera lag and depth movement, and deliberate composition that maintains the player's silhouette.

**Camera states:** `GameplayFollow`, `Establishing`, `Inspect`, `Dialogue`, `Reveal`, `Chase`, `Choice`, and `Ending`. All transitions have data-driven duration, ease, camera target, focus target, and skippable flag.

**Required authored shot list:**
1. Cold open: wide stormy river, ferry horn, black fade into Asha arrival.
2. Ghat entry: low track along wet planks, rain trails crossing practical lamps.
3. Breaker restoration: bright practical lamps reappear behind Asha.
4. Bazaar: slow dolly past abandoned rickshaw as a radio unexpectedly starts.
5. Ledger discovery: close focal shift from handwritten record to Asha's reaction.
6. Flooded bridge: high wide camera demonstrates imminent danger without obscuring gameplay.
7. Light encounter: deep river composition, three small distant light sources, almost no camera movement.
8. Ferry reveal: controlled sideways track that reveals hull behind foreground reeds.
9. Cabin truth: intimate constrained interior, archival voice and subtle push-in.
10. Final decision: stable paired compositions, with two distinct ending sequences.

**Cinematic rules:** Cutscenes may be skipped without skipping critical persistent flags; subtitles continue to be available; camera must return to the correct follow state; no rapid uncontrollable camera shake; no letterboxing that obscures puzzle UI; hold-to-skip option; prefer authored in-engine camera moves over video files to support mobile and localization.

## 9. Visual specification

**Visual target:** Wet, overcast Bangladeshi river delta; dense material detail, physically believable artificial lamps, authentic clutter, atmospheric depth, and restrained color grading. Reference photographs are for mood and art direction, not assumed reusable assets.

**Rendering path:** PlayCanvas PBR metallic/roughness; physically plausible albedo/roughness/normal/AO; HDR environment maps with matched light temperatures; baked lighting where static; a small number of important dynamic lights; shadows only for hero assets; camera post-processing (TAA or FXAA depending profile, SSAO selectively, controlled bloom, fog, subtle grading). Baseline WebGL2 and optional WebGPU; do not make WebGPU an MVP dependency.

**Graphic fidelity features:**
- Layered foreground, midground, background with actual geometric depth and texture parallax.
- Rain: screen-space streaks plus local particles around lights, surface splash decals, puddle ripples in important zones; particle density scales with quality setting.
- Water: animated normal layers, depth tint, shoreline foam/edge, rain ripples; no expensive full-scene fluid simulation.
- Fog: layered depth fog and local light shafts on `Ultra` or `High`, cheap alternatives on lower tiers.
- Reflections: cubemap/probe and planar cheats for hero puddles; screen-space reflections only if compatible and within budget, never mandatory.
- Vegetation: wind animation and instanced reeds, not per-blade dynamic geometry.
- Decals: mud splash, algae, oxidation, waterline marks, Bangla weathered signboards, wet footprints, rust drips.
- Realistic human: original rigged character with believable silhouette and clothing; minimize exposed complex face animation by cinematic framing and radio-driven dialogue.
- Gaussian splats: optional isolated background enhancement; excluded from traversal, collision, and critical readable clue surfaces unless independently tested on future WebViews.

**Source versus shipping:** Artists may begin with 4K-8K CC0 materials. Ship KTX2/Basis compressed images; typical midground 1K-2K, background 512-1K, rare desktop hero textures 2K-4K after profiling. Preserve source maps in asset repository, not client package.

**Quality profiles:**
| Setting | Render scale target | Effects | Asset profile |
|---|---|---|---|
| Ultra | 100% native, capped per target device | TAA, selective AO, fog shafts, max particles/shadows | high |
| High | 85-100% | TAA/AA, reduced fog and shadows | high/medium |
| Medium | 70-85% | cheaper AA, reduced fog/particles | medium |
| Low | 60-70% | simplified reflections, reduced AO/off, few particles | low |

Dynamic resolution option uses frame-time hysteresis and never changes texture resolution mid-interaction. `Ultra` is optional and must not define baseline success.

## 10. Asset production and source inventory

**Asset policy:** The tools must be open-source and game components must have distribution-compatible licenses. Third-party visual/audio assets should preferentially be CC0. The team may create its own original assets and explicitly release them under CC0 (art and sounds) or an appropriate permissive license. A public GitHub repository alone does *not* mean the file is open source or reusable.

| Asset category | Planned unique source deliverables | Where/how to obtain |
|---|---:|---|
| Main character | 1 original realistic rig, 12-16 animation clips | Blender sculpt/retopo/rig/custom clothing; optionally adapt rights-cleared CC0 mesh |
| Human secondary figures | 1 silhouette rig, 1 distant shadow variant | original variations of allowed meshes |
| Named speaking characters | 3 roles; in MVP mainly audio, portrait or partial-body representation | original recordings and art with performer releases |
| Environment modules | 25-35 reusable mesh modules | custom Bangladesh-specific forms in Blender |
| Props | 90-130 props, ~30 hero-interactable | CC0 base objects plus original culturally specific models |
| Materials | 55-80 PBR material families | Poly Haven + ambientCG CC0, transformed and optimized |
| Decals | 30-45 | original photography with location/property clearances, or original creation |
| Visual effects | 12-18 authored effects/presets | original procedural shaders, particles, light rigs |
| Dialogue | ~45-70 short spoken lines, 3 actors | original Bangla recordings; optional English subtitles |
| Sound effects | ~60-90 mastered assets | Freesound filtered to CC0 + original recordings |
| Ambience | 5 long scene beds, 10-15 local loops | original soundscapes built from CC0 sources |
| Music | 4-6 original motifs/cues, including end credits | compose from scratch using open-source tools; do not use unclear sample packs |
| Cinematics | 10 principal sequenced camera beats plus transitions | in-engine authored timeline JSON |
| UI | title/pause/settings/journal/puzzle widgets/credits | CSS + SVG + openly licensed fonts, no rasterized text |

**Verified recommended sources:** https://polyhaven.com/license (CC0), https://ambientcg.com (CC0), https://kenney.nl/support (CC0), https://freesound.org/help/faq/ (filter to CC0), https://github.com/notofonts/bengali (SIL OFL), https://opengameart.org/content/faq (asset-by-asset licensing; select CC0 only for the strict pipeline).

**Prohibited without separate permission:** random Google images, Google Maps/Earth screenshots as textures, game rips, nominally "free" marketplace assets with no resale/redistribution terms, unclear Sketchfab uploads, CC-BY-NC, copyrighted music, proprietary character templates, non-cleared actor voices or likenesses. Avoid BBC Sound Effects in a commercial release unless properly licensed, because their free standard usage is restricted.

**Mandatory provenance record for each imported item:** `asset_id`, source URL, creator, original title, license name and version, download date, source-file SHA-256, modification notes, attribution text if needed, personal likeness/property release if relevant, reviewer, approval status, and in-game file paths. Assets with missing approval are blocked by CI.

## 11. Sound, dialogue, and music

**Audio philosophy:** Sound is a primary storytelling layer. Avoid continuous aggressive score. Rain, distant horn, hanging tin, frogs, wood resonance, and radio hiss carry the tension.

**Audio buses:** Master; Music; Ambience; Foley; SFX; Dialogue; UI. Independent volume sliders, mute, and spoken-dialogue clarity boost; include dynamic range presets `Night`, `Standard`, `Headphones` if practical.

**Spatial model:** 3D positional audio for loud environmental sources (horn, door, radio, ferry creak); 2D stereo layers for weather beds, score, UI, and voiceover where positional clarity is less important. For accessibility, subtitle directional sound cues as text (e.g. `[Ferry horn, across the river]`).

**Scene cue map:**
| Level | Continuous bed | Reactive details | Music moment |
|---|---|---|---|
| Ghat | moderate rain, river wash, distant thunder | plank creaks, bulb buzz, horn | opening 45-70s restrained motif |
| Bazaar | roof-drip, metal rattle, radio interference | shutter knock, wet footsteps, bicycle bell | one 30s revelation swell |
| Embankment | heavy wind, current, collapsing mud | bamboo flex, stone scrape, splash | rhythmic low-end during chase |
| The Lights | softer rainfall, reeds, insects | whisper-like wind, lantern click, distant pulse | near-silence followed by sustained tone |
| Ferry | hull strain, water below floorboards, engine ticking | memory playback, chains, cabin door | central truth cue + distinct epilogue motifs |

**Delivery:** Source masters as WAV (48kHz). Distribute compressed browser-supported formats with format fallback where necessary. Implement audio unlock after user interaction and pause/resume on browser visibility or OS interruption. Never stream mandatory story voice from third-party sites at runtime.

**Dialogue:** Bengali spoken performance as default, Bengali and English subtitles at launch. Lines must have `line_id`, localization key, speaker, start/stop event, audio URI per language, timing tokens if karaoke-style highlighting is later added, and optional visual sound description. Spoken English dubbing is not in MVP.

## 12. UI, UX, localization, accessibility

**Product screens:** Landing/title, pre-play accessibility/graphics prompt, New Game/Continue, chapter transition, in-game subtle HUD, inventory/journal, dialogue subtitle, pause, graphics/audio/control settings, puzzle help, fail/retry overlay, ending selection, credits, legal/licenses, error/offline state.

**HUD:** Context prompts appear only when needed. Objective fades after a few seconds; can be pinned by accessibility setting. Journal includes objective, people, evidence map, and clue review. Important readable text is HTML/CSS for proper Bangla shaping and screen scaling.

**Typography:** Noto Sans Bengali and Noto Sans under SIL OFL. Safe text must remain readable at 1280x720 and at 200% UI scale. No vital subtitles inside non-scalable textures.

**Language:** `bn-BD` and `en` UI/subtitles in MVP. Dialogue default `bn-BD`; subtitle tracks independent of audio. All UI strings externalized to localization tables. Bangla QA by fluent reviewers; typography and punctuation tested in Chrome/Firefox/Safari.

**Accessibility minimum:** Remap keyboard, gamepad, subtitles with speaker labels, subtitle sizes 100/125/150/200%, contrast background, non-color puzzle markings, camera shake toggle, reduced flash/lightning, reduced motion, low-tension chase option, optional three-stage puzzle hints, separate audio volumes, hold-to-skip cinematics, optional pointer alternatives for every puzzle. Include content warnings for darkness, distressing sounds and flood peril; no gratuitous real-world tragedy exploitation.

## 13. Web runtime architecture

**Core build:** Standalone PlayCanvas Engine from NPM + TypeScript + Vite. Use asset-based scene manifests and a small engine-independent domain layer. Avoid editor proprietary project formats as canonical source and do not require a paid hosted service. The deployed game is static assets plus optional nonessential telemetry.

```text
Browser / future mobile WebView
  HTML/CSS Shell: menus, subtitles, save notice, settings
  Application Coordinator: boot, menu, play, pause, game-over, finish
  PlatformAdapter: web / tauri / flutter-host (future)
  InputActions: keyboard / mouse / gamepad / touch (future)
  Game Domain: QuestGraph, FlagStore, Inventory, PuzzleRules, NarrativeDirector
  Presentation: PlayCanvas SceneRenderer, Animation, CameraDirector, AudioMixer, VFX
  Persistence: SaveRepository (IndexedDB; versioned schema)
  Content: episode manifests + localized strings + GLB/KTX2/audio assets
```

**Architectural constraints:**
- Keep story/gameplay rules independent of WebGPU/WebGL implementation and of the mobile wrapper.
- Author locations as manifest-based bundles with deterministic entry/exit checkpoints; no hardcoded global scene array in player controller.
- Data-driven quests, dialogue, cinematic timelines, sound triggers and puzzles. Scene scripts call stable APIs and never directly mutate another scene's private entities.
- Add `schemaVersion` and migration functions to saves and content manifests. Episode IDs and content IDs are globally stable (`aleya.ep01.L01` etc.).
- Lazy-load locations before transitions. Deallocate prior scene meshes/textures after fade where practical; retain shared texture/material cache with reference counts.
- Use `VisibilityChange`, focus, storage quota and context loss recovery. On graphics context loss, display recovery UI, re-create renderer safely and restore latest checkpoint if needed.
- Web app served over HTTPS; all mandatory game assets self-hosted and hashed. No runtime third-party asset hotlinks.
- CSP configured for app; no remote user-created script execution; verify dependencies and licenses in CI.

**Suggested repository:**
```text
aleya/
  apps/web/                 # shell, styles, Vite config, production entry
  packages/game-core/       # quests, saves, player actions, rules (framework-neutral)
  packages/renderer-pc/     # PlayCanvas-specific rendering, camera, VFX, animations
  packages/audio/           # buses, mixers, cue scheduler, subtitle synchronization
  packages/ui/              # localized HTML/CSS screens and widgets
  packages/content-schema/  # zod/json schema, localization IDs, migrations
  content/episodes/ep01/    # level manifests, timelines, puzzles, story files
  assets/source/            # original source assets and evidence, not deployed
  assets/optimized/         # generated GLB/KTX2/audio build inputs
  tools/asset-pipeline/      # conversion, provenance verification, budgets
  tests/unit/ tests/e2e/ tests/perf/
  docs/PRD.md docs/ASSET_LICENSES.csv docs/QA_CHECKLIST.md
```

**Example scene manifest fields:** `id`, `version`, `displayNameKey`, `spawnPoints`, `criticalBundle`, `deferredBundles`, `staticColliders`, `navLanes`, `cameraRails`, `audioZones`, `puzzleIds`, `questNodes`, `checkpointIds`, `lightingPreset`, `supportedQualityProfiles`, `exits`, `memoryBudgetMb`.

**Save schema (minimum):** `schemaVersion`, `gameBuild`, `episodeId`, `sceneId`, `checkpointId`, `playSeconds`, `questFlags`, `puzzleState`, `inventoryItems`, `clueIds`, `endingState`, `settingsVersion`, `savedAt`. Save on new checkpoints, scene transitions, important puzzle completions, browser visibility change (best effort), and quit. Use transactional writes and backup one prior checkpoint. Save logic must never store raw scene entity pointers.

**Web storage caveat:** IndexedDB is local to the origin and can be removed under browser storage policies; give player an `Export Save` / `Import Save` file option or implement later opt-in synchronization. Prevent silent save failure if quota is exhausted.

## 14. Mobile portability design now, native packaging later

**Do now:** Use abstraction for haptics, fullscreen, safe-area insets, touch controls, back button, suspend/resume, audio focus, file import/export, storage location, quality detection and network state. All game content and UI must fit either landscape desktop or mobile landscape with flexible framing. Avoid relying on hover or keyboard-only interactions.

**Do not do now:** claim mobile release readiness without device testing; port PlayCanvas game to Flutter's rendering engine; replace the game with static 2D sprites for mobile.

**Planned mobile approach:** Prototype Tauri 2 on real Android and iOS devices using the same Vite bundle first. Tauri supports mobile apps, but uses operating-system WebViews. Test actual WebGL2, audio unlock, graphics context recovery, GPU memory, and app resume. Flutter with an embedded WebView is an alternative shell if native navigation, app services or team expertise favor Flutter; it does not automatically accelerate the PlayCanvas canvas. Native packaging happens in a later delivery gate.

**Mobile constraints already applied:** touch-safe prompts, never-texture-bound UI text, landscape camera framing, memory-managed scene streaming, optional 30 FPS setting, graphics quality profiles, no mandatory WebGPU, all essential audio available offline if bundled, and no requirement for external live services.

## 15. Performance, bundle and quality targets

These are measurable starting **targets**, subject to profiling with representative scenes and hardware, not performance claims.

| Metric | Initial web target | Test condition |
|---|---|---|
| FPS - midrange dedicated GPU | >= 60 FPS median and >= 45 FPS 1% low on High | 1080p gameplay in Chrome reference machine |
| FPS - integrated graphics | >= 30 FPS sustained on Low at 720p | identified 2022-era iGPU reference machine |
| Frame spikes | no >250ms hitch during active movement, excluding disclosed scene loads | scripted 10-min route |
| First interactive menu | ideally <= 8 seconds on warm 20 Mbps connection | repeatable network throttle |
| First playable scene | <= 25-35 seconds cold load on 20 Mbps | desktop browser inc. cached/offcached reports |
| Initial transfer | <= 35 MB compressed; measure real CDN response | entry shell + first scene critical bundle |
| Full episode download | target <= 350 MB compressed; cap before release | all unique scene asset bundles |
| Peak GPU asset allocation | target < 1 GB on High | inspect browser and engine instrumentation |
| Save durability | >=99.9% clean checkpoint reload in automated stress tests | 1,000 save/load cycles across supported browsers |
| Audio synchronization | narrative subtitle start offset within 150ms where measurable | sampled spoken line QA |
| Crash/blocker rate | zero P0/P1 defects at release; no reproducible save-loss | release QA suite |

**Budget discipline:** Per-level draw-call and vertex budgets set after first representative scene; no guessing universal thresholds. Measure GPU memory and frame time using PlayCanvas stats, browser performance tooling and device matrix. Degrade GPU effects, render scale and texture size in that order before compromising puzzle readability.

**Caching and PWA:** Serve files with content hashes and CDN caching. Optional installable PWA shell in MVP; not required to claim full offline play unless *all* episode assets and storage transitions are tested offline. Update must not corrupt loaded checkpoints or overwrite an active save.

## 16. Production pipeline and open-source tools

| Stage | Open toolchain | Output |
|---|---|---|
| Concept, layout, props | Blender; Krita; Inkscape | blockouts, source BLEND, approved concept sheets |
| Material processing | GIMP; Material Maker; Blender | PBR base/normal/roughness/metalness/AO |
| Mesh optimization | glTF Transform; Meshoptimizer; Blender decimation | quantized/compressed GLB, LODs |
| Texture optimization | Khronos KTX-Software / Basis Universal; ImageMagick | KTX2 textures and mipmaps |
| Character and animation | Blender rigging + animation tools | rigged glTF animations with named clips |
| Sound editing and music | Audacity; Ardour or LMMS; FFmpeg | WAV masters + encoded game assets |
| Code and bundling | TypeScript; Vite; PlayCanvas Engine; npm/pnpm | browser runtime and hashed assets |
| Quality/testing | Vitest; Playwright; browser DevTools; CI | unit/e2e/license/performance reports |
| Publishing | static HTTPS hosting or self-managed object storage/CDN | public production URL with staged releases |

**Import sequence:** Source license approved -> asset source checked into controlled storage -> clean/retopo -> UV and materials -> LOD generation -> glTF validation -> texture compression -> audio encode -> visual fidelity QA -> per-platform budgets -> manifest/credit record -> CI builds -> staged deploy.

**No unlicensed visual substitution:** A realistic photo on the internet is not inherently usable in a game. Rather than hotlinking arbitrary imagery, recreate recognizably Bangladeshi architecture and props with CC0 materials and original geometry. Record original location photography only with appropriate permissions.

## 17. Acceptance criteria by subsystem

| ID | Requirement | Release acceptance test |
|---|---|---|
| F-01 | Finished story | New game to either ending works, ending includes full resolution, credits roll |
| F-02 | Playable level set | L01-L05 reachable in order; no placeholder area visible to player |
| F-03 | Puzzles | All six required puzzles function with pointer, keyboard and gamepad; no unrecoverable states |
| F-04 | Navigation | Player cannot leave playable lanes or become trapped behind world geometry |
| F-05 | Progression | At least 2 meaningful epilogues and deterministic flags; clues survive saves |
| F-06 | Save/continue | Autosave and restore at each checkpoint, versioned storage, export/import save |
| F-07 | Cinematics | Required 10 camera moments trigger once per state; skip never breaks quest flags |
| F-08 | Input | Remapping, gamepad focus/navigation, puzzle parity, pause/resume all pass |
| F-09 | Visual | Every level has custom shot QA pass; no untextured mesh, severe clipping, shader compilation failure |
| F-10 | Sound | Rain, footsteps, event cues, 3D sound, voices, subtitles, and volume buses work in all levels |
| F-11 | Accessibility | Required accessibility toggles change behavior, not just UI; key narrative cues accessible visually |
| F-12 | Localization | All production strings available in Bangla and English; no broken glyph shaping or untranslated critical UI |
| F-13 | Compatibility | Full clear-to-credits playthrough in Chrome/Edge, Firefox, Safari on supported desktop configurations |
| F-14 | Resilience | Handles tab suspend/resume, lost focus, interrupted loading, low storage and network error with user feedback |
| F-15 | Licensing | Automated CI passes 100% approved manifest records; Credits / Licenses lists required notices |
| F-16 | Deployment | HTTPS launch, cache versioning, rollback plan, error page, status logging without exposing save content |
| F-17 | Performance | Meets agreed measured quality targets in published hardware matrix; High/Low settings demonstrably differ |
| F-18 | Privacy | Works without account; no personally identifying telemetry required; third-party assets not requested at runtime |

**Severity policy:** P0 = crash/data loss/security issue; P1 = blocks story or major controls; P2 = visible quality issue with workaround; P3 = cosmetic. Release with zero P0 and P1 defects and documented acceptable P2 issues only.

## 18. Test matrix and validation plan

**Desktop browsers:** latest stable Chrome/Edge (Chromium), Firefox, Safari (macOS). Test Windows and macOS directly; Linux Chromium/Firefox if included as supported platform. Include dedicated GPU and lower-power integrated GPU devices. All tests specify browser, OS, GPU, RAM, resolution, and quality preset.

**Automated tests:** QuestGraph state invariants; puzzle solution/abandon/retry; inventory add/remove; save migrations; localization completeness; content manifest schema; critical asset hashes; no duplicate scene IDs; UI focus/input; start->checkpoint->restart->finish; simulated network loss; renderer resize; audio mute/unmute; license manifest completeness.

**Manual playtests:** 8-12 external players unfamiliar with the project, balanced between Bengali and English subtitle preferences. Record completion time, unintended navigation loss, hint requests, readability, anxiety/discomfort, perceived quality, narrative clarity, and ending comprehension. Get consent before recording any sessions.

**Exit standards:** 90% of testers complete without a developer intervention; 80% correctly explain the ferry incident and its resolution; no player requires an unavailable external guide; average post-session visual quality >=4/5 among testers on recommended hardware; basic controls learned <=5 minutes. Treat thresholds as initial release gates and refine only with documented product review.

## 19. Work packages, delivery plan, team

**Core roles (illustrative small team):** technical/gameplay engineer, technical artist/3D environment artist, animator/character generalist, writer/narrative designer, sound designer/composer, QA/producer. Roles may overlap, but visual art, engineering, audio and QA work cannot be assumed to happen automatically through code generation.

| Milestone | Work package | Completion gate |
|---|---|---|
| M0 / Pre-production | script, reference board, legal rules, tech spikes, asset research, detailed level flow | story approved; WebGL2 reference scene feasible |
| M1 / Systems | project scaffolding, domain core, camera, input, save, UI, manifest/CI | all systems work with graybox scene and tests |
| M2 / Environment pipeline | realistic material/lighting target, optimized assets, scene templates | one fully representative area meets measured frame budget |
| M3 / Content | L01-L05 environments, puzzles P1-P6, threat beats, dialogue, checkpoints | playable end-to-end without placeholders in game logic |
| M4 / Cinematic & audio polish | camera shots, rain/water, sound mix, score, localizations, accessibility | content lock and visual/audio review passed |
| M5 / Hardening | optimization, QA matrix, narrative playtests, license audit, deploy rehearsal | no P0/P1, release gates and rollback tested |
| M6 / Release | production deploy, credits, changelog, support channel, optional crash reports | public URL verified and launch checklist signed |

**Planning envelope:** A skilled small team might plan ~5-7 months for this visual bar; this is a scope-sizing estimate, not a delivery commitment. A solo developer should reduce content substantially or expect longer. Do not invent schedules before staffing and scene fidelity are proven. Most schedule risk is in original believable character assets, Bangladeshi prop creation, cinematic animation and sound mastering.

## 20. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| "Ultra-realistic" interpreted as unlimited 8K textures | High | single hero benchmark, profile first; packaged compression and LODs |
| Lack of authentic CC0 Bangladeshi models | High | original Blender asset kit; reusable architecture and signage modules |
| Mobile WebView variability | High | keep WebGL2 baseline and mobile-ready abstractions; do hardware spike before store plans |
| Licensing contamination | High | approval manifest and CI; restrict to CC0/OFL and explicitly licensed originals |
| Plot unresolved / excessive sequel tease | High | canon truth locked, both endings resolve central mystery |
| Too much gameplay scope | High | no combat, open world, procedural story, or NPC simulation |
| Save loss | High | transactional checkpoints, export/import, error notifications, migration tests |
| Narrative tension inaccessible | Medium | subtitles for sound, adjustable chase tension, hints, motion/flash options |
| Heavy rain harms readability | Medium | composition and obstacle silhouettes prioritized over effects |
| Audio autoplay restrictions | Medium | clear Start interaction to unlock audio; responsive audio resume |
| GPU instability / context loss | Medium | auto low preset and recovery screen; profile browser builds |

## 21. Analytics and release operations

**Default:** Privacy-respecting and fully playable with no analytics SDK. If opt-in analytics is later introduced, record only aggregated event names and durations, not photos, documents or voice input. Game does not require sign-in, ads, cookies for ad tracking, or cloud data processing.

**Suggested opt-in event taxonomy:** `game_start`, `scene_enter`, `puzzle_start`, `hint_used`, `puzzle_complete`, `checkpoint_saved`, `death_retry`, `ending_viewed`, `quality_changed`, `crash_recovered`. All events must be versioned and never be gameplay dependencies.

**Operational readiness:** versioned static deployment, rollback to previous asset manifest, hash-based caching, cache invalidation verification, privacy notice, player support address/page, issue reproduction template, pre-release accessibility statement, known issues list, asset attribution/third-party notices.

## 22. Full-scale expansion architecture

**Episode 2+ model:** Add `ep02` content folder and manifests; reuse QuestGraph, input, renderer, inventory, localization, settings, save migrations and analytics; independently test every episode. Episodes may introduce new puzzles, traversal actions, characters and locations without rebuilding the bootstrap layer.

**Future feature flags:** TouchControlsV2, MobileLocalAssetBundling, CloudSaveOptional, EpisodeSelect, NewGamePlus, AdditionalLocalization, AlternateDialogueAudio, PhotoMode, HigherFidelityScenePack. Keep these dormant and out of MVP feature promises.

**Mobile packaging decision at Phase 2:** Test representative production episode on real Android and iOS with Tauri 2 and, only if needed, Flutter WebView. Evaluate GPU frame time, texture memory, first-frame latency, restore from app suspension, native audio behavior, safe areas, gamepad/touch, app-store policy, download size, and update strategy. Choose by measured results, not framework branding.

**Story expansion principles:** Each new episode tells a complete local story; keep the folklore identity but vary place and mechanic. Reuse the lighting/water/rain/audio technology, not identical puzzle structures. Evolve visual fidelity through replacement asset packs and rendering features while preserving compatible content and saves.

## 23. Definition of Done: release decision

The MVP is release-ready **only if every item below is true**:

- [ ] A player can finish the 60-90 minute intended episode and reach one of two complete epilogues.
- [ ] All five environments, six mandatory puzzles, dialogue, clues, two pursuits and cinematic sequences are present and polished.
- [ ] Settings, pause/continue, save/export/import, accessibility, localization and credits work.
- [ ] Visuals are coherent and realistic, with no gameplay-blocking unreadability or unoptimized source texture leaks.
- [ ] Complete soundscape, voiced Bangla dialogue, English and Bangla subtitles, and mixed music are shipped.
- [ ] Baseline WebGL2 desktop browser experience meets the agreed measured hardware/performance matrix.
- [ ] Accessibility and input parity tests pass.
- [ ] No P0/P1 bugs; all imported assets have verified rights and source records.
- [ ] Versioned production URL, rollback, support and third-party legal notices are ready.
- [ ] The runtime remains engine-layer separated, data-driven and suitable for later Android/iOS wrappers.

**Explicit outcome:** This delivers a self-contained, publicly playable and supportable web game episode, while the codebase, asset pipeline, content manifests and portable input/UI architecture are designed to scale into a multi-episode, eventually mobile-distributed product.

## 24. Technical source references (verified October 2026)

- PlayCanvas Engine license and capabilities: https://playcanvas.com/products/engine
- PlayCanvas standalone (Vite/TypeScript) setup: https://developer.playcanvas.com/user-manual/engine/standalone/
- PlayCanvas graphics and post effects: https://developer.playcanvas.com/user-manual/graphics/ and https://developer.playcanvas.com/user-manual/graphics/posteffects/cameraframe/
- Tauri mobile support and OS WebView architecture: https://v2.tauri.app/ and https://v2.tauri.app/reference/webview-versions/
- Flutter WebView implementation: https://pub.dev/packages/webview_flutter
- Poly Haven licensing: https://polyhaven.com/license
- ambientCG licensing: https://github.com/VenitStudios/AmbientCG/blob/main/LICENSE
- Kenney asset licensing: https://kenney.nl/support
- Freesound audio licensing: https://freesound.org/help/faq/
- OpenGameArt license limitations: https://opengameart.org/content/faq
- Noto Bengali font license: https://github.com/notofonts/bengali
- Browser storage persistence and evictions: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
