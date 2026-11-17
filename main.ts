// SOLMAR CITY — the hand-in program for the make.fun gta6-01 competition.
// Node 22, standard library only. It takes this repository's game/ and
// screenshots/ folders and copies them into the output directory, then writes
// dossier.json there with the vendored make.fun library (buildDossier). The
// output directory is /output in the grader; outside it, the environment
// variable MAKEFUN_OUTPUT_DIR stands in for it, so you can run it locally:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game itself is plain static files (game/index.html plus its ES modules)
// that a desktop browser loads with no network request and no build step.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: the text cap shapes the dossier's bytes, and the
// rest refuse an entry the scorer would refuse (more than 4 screenshots or
// one over 256 KiB; more than 993 files in game/ or 48 MiB of game files in
// all; a path under game/ over 1000 bytes). game/ shares /output's own
// 1000-entry cap with screenshots/ and dossier.json, so there is headroom.
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
