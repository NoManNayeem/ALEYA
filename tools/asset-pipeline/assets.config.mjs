// Asset families shipped in the MVP. Each maps to the source file that generates it
// (procedural, original) or to the third-party file shipped. Used to (re)build docs/ASSET_LICENSES.csv.
export const ASSETS = [
  { id: 'tex.procedural', title: 'Procedural PBR textures (wood, tin, mud, concrete, brick, plaster, shutter, bamboo, cloth, hull paint, water ripples, signage)', file: 'packages/renderer-pc/src/textures.ts' },
  { id: 'mat.library', title: 'PBR material families (55 ids)', file: 'packages/renderer-pc/src/materials.ts' },
  { id: 'mesh.prefabs', title: 'Bangladesh delta prop and architecture kit (procedural geometry)', file: 'packages/renderer-pc/src/prefabs.ts' },
  { id: 'mesh.characters', title: 'Asha, Karim and River Watcher stand-in rigs', file: 'packages/renderer-pc/src/characters.ts' },
  { id: 'vfx.weather', title: 'Rain, splash and lightning effects', file: 'packages/renderer-pc/src/weather.ts' },
  { id: 'audio.synth', title: 'Procedural ambience beds, emitters, SFX, voice placeholders and score', file: 'packages/audio/src/engine.ts' },
  { id: 'text.episode', title: 'Episode 1 script, dialogue and localization (bn-BD, en)', file: 'content/episodes/ep01/dialogue.json' },
  { id: 'ui.icons', title: 'Favicon and UI glyph artwork', file: 'apps/web/public/favicon.svg' },
  {
    id: 'src.makehuman',
    title: 'MakeHuman base mesh, default skeleton, skin weights, macro targets, eye helpers (source, not shipped)',
    file: 'assets/source/makehuman/3dobjs/base.obj',
    thirdParty: { url: 'https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data', creator: 'MakeHuman project (Data Collection AB, Joel Palmius, Jonas Hauquier; originally Manuel Bastioni)', license: 'CC0-1.0', attribution: 'Characters derived from CC0 MakeHuman assets (attribution not required; given as courtesy)' },
  },
  { id: 'char.asha', title: 'Asha (skinned GLB, derived from CC0 MakeHuman assets)', file: 'assets/optimized/characters/asha.glb' },
  { id: 'char.karim', title: 'Karim (skinned GLB, derived from CC0 MakeHuman assets)', file: 'assets/optimized/characters/karim.glb' },
  { id: 'char.watcher', title: 'River Watcher (skinned GLB, derived from CC0 MakeHuman assets)', file: 'assets/optimized/characters/watcher.glb' },
  { id: 'tool.characters', title: 'Character build pipeline (targets, rig reduction, tailoring, GLB export)', file: 'tools/asset-pipeline/build_characters.py' },
  { id: 'anim.human', title: 'Procedural skeletal animation for the human rig', file: 'packages/renderer-pc/src/human.ts' },
  {
    id: 'font.noto-sans',
    title: 'Noto Sans',
    file: 'node_modules/@fontsource/noto-sans/LICENSE',
    thirdParty: { url: 'https://github.com/notofonts/latin-greek-cyrillic', creator: 'Google / Noto project', license: 'OFL-1.1', attribution: 'Noto Sans © Google LLC, SIL Open Font License 1.1' },
  },
  {
    id: 'font.noto-sans-bengali',
    title: 'Noto Sans Bengali',
    file: 'node_modules/@fontsource/noto-sans-bengali/LICENSE',
    thirdParty: { url: 'https://github.com/notofonts/bengali', creator: 'Google / Noto project', license: 'OFL-1.1', attribution: 'Noto Sans Bengali © Google LLC, SIL Open Font License 1.1' },
  },
];

export const ALLOWED_ASSET_LICENSES = ['CC0-1.0', 'OFL-1.1'];
