# CDL Backing Course

A browser game that teaches the CDL basic control skills. Four levels, easiest first:

1. Straight Back
2. Offset Back
3. Wide Dock (90° into a 20-foot alley)
4. Alley Dock (12 feet wide, 3-foot stop box)

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
