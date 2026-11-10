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
