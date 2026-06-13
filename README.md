# FableDevil

A clean little browser rage-platformer — minimalist look, perfectly planned traps, dark/light themes, and obvious ragebait. **FableDevil** is the prettier, meaner sequel to the classic "is the floor lying to me?" formula.

![Play in browser](https://img.shields.io/badge/play-in%20browser-ffb24d)
![License](https://img.shields.io/badge/license-MIT-blue)

## Play

Open `index.html` in a browser, or serve the folder locally:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Move |
| ↑ / W / Space | Jump |
| R | Restart level |
| M | Mute |
| T | Toggle dark/light theme |
| F | Toggle fullscreen |

On mobile the game goes fullscreen with floating, translucent touch controls: move arrows on the left, jump + restart on the right. Theme, sound, and fullscreen toggles live in the top-right corner.

## Features

- **30 handcrafted levels** with a smooth difficulty curve and a fresh mechanic introduced every few stages
- **13 trap types:** collapsing floors, pop spikes, falling blocks, crushers, crumbling platforms, homing floor gaps, fake doors, inverted controls, plus newer concepts — **moving platforms, conveyor belts, springs, spinning saws, telegraphed lasers, teleporters, buttons + gates, blinking platforms, pendulums, and turrets**
- **Dark & light themes** with a one-tap toggle (remembers your choice, respects system preference)
- **Mobile-first fullscreen** layout that scales to any screen with safe-area-aware floating controls
- Clean, juicy presentation: easing, screen shake, particles, blood stains, a circular scene-wipe transition, and a non-purple amber palette
- Procedural Web Audio sound effects
- Death counter + level unlock progress (saved in `localStorage`)

## Tech

Pure HTML, CSS, and JavaScript on a 2D `<canvas>` — no build step, no framework. The only dependency is `@vercel/analytics`, loaded over an import map. Theming is a single runtime palette object on the canvas side plus CSS `data-theme` variables for the DOM.

## License

MIT — see [LICENSE](LICENSE).

This is a fan recreation for learning and fun. Not affiliated with any original game.
