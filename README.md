# CDL Backing Course

A browser game that teaches the CDL basic control skills. Six levels, easiest first.

The current skills test:

1. Forward Stop
2. Straight Back
3. Forward Offset
4. Reverse Offset

The older test, still used at some sites:

5. Wide Dock (90° into a 20-foot alley)
6. Alley Dock (12 feet wide, 3-foot stop box)

Lane sizes and point values are the game's own practice settings. The official ones are not published.

Three camera views (overhead, driver's window, driver's seat with mirrors), a turn-by-turn coach, and an examiner-style score sheet.

## Run it

Open `index.html` in a browser. There is nothing to install. The 3D engine (three.js r128) loads from a CDN.

## Files

- `index.html` is the built game. This is the only file a host needs to serve.
- `src/core.js` holds the truck physics, the level layouts, and the coach's steering logic.
- `src/ui.js` holds the 3D scene, cameras, controls, menu, and scoring.
- `src/head.html` holds the page markup and styles.
- `build.sh` joins the three source files into `index.html`.

## Change something

Edit a file in `src/`, then rebuild:

```
sh build.sh
```

Success looks like an updated `index.html` and no error output.

## Player experience

- Interactive eight-step controls tutorial, with a restart that resets all steps.
- Optional synthesized engine, reverse, warning and success sounds. Use **Sound on**; no audio files are downloaded.
- Practice results, specific next-attempt feedback, saved stars and course progress.
- **Watch replay** after an attempt. Scrub the recording, change cameras, or use 1×/2× playback. Replays stay in memory and retain up to approximately 20 minutes; they never alter scores.
- **Pause** or Escape stops the simulation and timer. Switching tabs also pauses. Resume explicitly when ready.
- Keyboard: arrows to drive/steer, C to center, Space to finish, V for camera, G to get out, R to restart, Escape to pause. Buttons retain native Space/Enter activation.
- Touch: hold a pedal, press higher for more throttle, and drag the wheel. Get out only while stopped.

The scoring is for this game, not a certified exam. A pass requires reaching the yellow target, completing a driving attempt, and scoring no more than six points. Coached passes earn one star; solo passes earn two, or three with at most one point. Rules, geometry and training transfer still need review by a qualified CDL instructor before marketing this as test preparation.

## Checks

Run `node --test tests/game.test.cjs`, then `sh build.sh`. The regression suite drives the real simulation through all six coached drills and checks scoring, replay restoration, tutorial reset, pause and input cleanup.

`src/experience.js` contains audio, recording/playback and pause state. The generated `index.html` must be committed with source edits.
