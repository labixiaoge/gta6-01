// Sunhaven Bay — entry program for the make.fun gta6-01 bounty (Node 22,
// standard library only). It hands the game in: copy this repository's game/
// and screenshots/ into the output directory and write /output/dossier.json
// with buildDossier from the vendored make.fun library, exactly as the kit's
// starter does. The game itself is plain static files under game/ — three.js
// vendored as game/vendor/three.module.min.js, the rest our own source — so
// the program does no build step and needs no network.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countEntries(dir) {
  let files = 0, bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = countEntries(p);
      files += sub.files; bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

const game = countEntries(join(out, 'game'));
const shots = readdirSync(join(out, 'screenshots')).filter((n) => !n.startsWith('.'));
// Pre-flight: warn loudly instead of silently handing in an entry the gate
// would refuse (too many/large game files, too many/large screenshots).
if (game.files > 993) console.error('WARNING: game/ has ' + game.files + ' entries, over the 993 cap.');
if (game.bytes > 50331648) console.error('WARNING: game/ is ' + game.bytes + ' bytes, over the 48 MiB cap.');
if (shots.length > 4) console.error('WARNING: ' + shots.length + ' screenshots, over the 4 cap.');
for (const s of shots) {
  const size = statSync(join(out, 'screenshots', s)).size;
  if (size > 262144) console.error('WARNING: screenshot ' + s + ' is ' + size + ' bytes, over the 256 KiB cap.');
}
console.log(
  'Sunhaven Bay entry written to ' + out + ': ' + game.files + ' game files (' +
  game.bytes + ' bytes), ' + shots.length + ' screenshots (' + shots.join(', ') +
  '), dossier.json ' + statSync(join(out, 'dossier.json')).size + ' bytes.',
);
