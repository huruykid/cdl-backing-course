# CDL Backing Course

A browser game that teaches the CDL basic control skills. Six levels, easiest first.

Core control drills:

1. Forward Stop
2. Straight Back
3. Forward Offset
4. Reverse Offset

Docking challenges:

5. Wide Dock (90° into a 20-foot alley)
6. Alley Dock (12 feet wide, 3-foot stop box)

Lane sizes and point values are the game's own practice settings. They have not been verified against an official test manual.

Four camera views (overhead, orbiting yard, driver's window, driver's seat with mirrors), a turn-by-turn coach, and an examiner-style score sheet.

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

## Landing and first drive

The root page introduces the game, shows actual in-cab gameplay, explains the six-drill progression and answers common questions. Returning players can enter their saved drills directly.

First-time players choose their experience and sound preference, review keyboard or touch controls, then enter an eight-action guided drive. Checkpoints stop the rig and release held controls before the next instruction. Contextual hints are available, and tutorial completion is stored separately from skipping setup. A briefing explains the goal before each scored drill begins.

- `src/landing.html`: landing markup and embedded gameplay image.
- `src/landing.css`: responsive landing styles.
- `cdl.setup.v2`: remembers completed or explicitly skipped setup.
- `cdl.tutorial.v2`: records actual first-drive completion.

The landing remains available if 3D initialization fails; entering the yard shows a recovery message. Progress is local to the browser and does not sync across devices.

## Graphics

`src/graphics.js` adds original procedural truck detail, physical materials, sky
reflections, dock signage, pavement wear, contact shadows, instrument gauges and
cosmetic cab suspension. All model geometry and textures are generated locally;
there are no downloaded model assets or additional runtime libraries.

**Yard** gives an orbitable three-quarter view. Drag the scene to rotate it.
V cycles Top, Yard, Window and Seat. Mirrors render the live scene. Physics and
collision dimensions are unchanged. Wheels rotate according to elapsed time.

Mobile/coarse-pointer devices start with a smaller shadow map and pixel ratio.
Sustained slow frames lower rendering resolution automatically. Static boxes are
batched with instancing to reduce draw calls; live wheels remain independent.
