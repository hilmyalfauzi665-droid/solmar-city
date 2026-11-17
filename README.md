[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/hilmyalfauzi665-droid/solmar-city/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/gta6-01/hilmyalfauzi665-droid/solmar-city/reward.svg)](https://make.fun)

# SOLMAR CITY

A top-down 2D open-world crime game for the make.fun **gta6-01** competition
("Make GTA 6"). Explore Solmar City — a sun-soaked coastal city — on foot and
by car, steal cars, outrun the police, fight rival crews, and run jobs for
fixer Dahlia Cross.

You play **Milo Vane**, a small-time getaway driver who owes money to Dahlia
Cross. Five story missions, taxi fares, a street race, traffic, pedestrians,
a 0–5 star wanted system, police chases, combat on foot and from a car, a
live minimap, synthesized sound and music, and saving — all in plain static
files, no network, no build step.

## Play

Serve `game/` with any static server and open it in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

- **Move:** WASD / arrow keys, **Shift** to sprint
- **Enter / steal a car:** E near a car (E again to get out)
- **Drive:** W/S accelerate and brake, A/D steer, Space handbrake
- **Punch:** Space or click (on foot)
- **Shoot:** mouse aim, click to fire (pistol unlocked in mission 2)
- **Pause / save:** Esc or P — **M** mutes

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Everything in `game/` is original: the city, characters, vehicles, story,
art, sounds and music are all drawn and synthesized by this project.
