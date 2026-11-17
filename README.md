# Sunhaven Bay — Open-World Crime Game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/labixiaoge/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/labixiaoge/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

## About

Sunhaven Bay is an original open-world crime game built for the make.fun
GTA 6 bounty. You are **Marco Reyes**, fresh out of prison and broke in the
sun-soaked port city of Sunhaven Bay. Your old friend **Lena Cruz** runs a
garage on Harbor Row — and she has work for you.

Steal cars, outrun the Sunhaven PD, run five story jobs for the Harbor Crew,
and earn your way from the streets to the top of the bay. The city is yours
to explore on foot and by car: traffic flows down the grid streets,
pedestrians stroll the sidewalks, and every crime you commit raises your
wanted level until the police come looking for you.

## What's in the game

- **A city to explore** — downtown towers, a harbor, a beach with palms and
  umbrellas, a marina and a hideout alley, all built in three.js.
- **On foot and by car** — sprint through the streets, steal any car on the
  road (press E), and drive it with arcade handling, brake lights and a horn.
- **Traffic and pedestrians** — cars cruise the grid and stop for each other;
  pedestrians wander, flee from gunfire and cars, and a few tourists stop to
  take in the sights.
- **Wanted level and police** — 0–5 stars. Stealing, shooting and hitting
  pedestrians raise the heat; patrol cars chase and ram you, foot cops join
  at 3 stars, and getting busted costs you a fine.
- **Missions and a story** — five connected jobs with dialogue from Lena,
  map markers, a pulsing beacon, hold-to-grab vaults, guard fights and a
  speed bonus for finishing inside the par time.
- **Combat** — a pistol with tracers, muzzle flash, impact sparks and a
  reload; guards and cops shoot back.
- **HUD with a minimap** — health and armor bars, cash, clock, wanted stars,
  speedometer, mission banner and a round minimap with police blips and the
  mission marker.
- **Start screen and saving** — new game / continue from localStorage, pause
  menu with run stats, and progress (cash, missions, kills, cars stolen,
  best wanted level) saved between sessions.
- **Sound, all synthesized** — engine hum, wailing sirens, gunshots, a
  two-tone horn, tire screeches and a lazy bassline loop, made live with
  WebAudio. No audio files, no network requests.

## How to play

```
WASD / Arrows — move & drive      SHIFT — sprint
E — steal / enter / exit car      SPACE — brake / handbrake
Mouse click — shoot               R — reload
H — honk                          N — mute
M — mission list                  P / ESC — pause
```

Stealing cars and shooting raises your wanted level. Lose the cops or hide
at the garage.

## Play it

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome:

```
node serve.ts
```

then open http://localhost:8080. The game loads nothing over the network:
every script, texture and sound is a file under `game/` or generated in code.

## Originality

Sunhaven Bay, its people, its story, its vehicles and its art are all
invented for this game. Nothing is taken from Rockstar Games' Grand Theft
Auto series or any other commercial game.
