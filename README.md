# Level Devil

A browser-based rage platformer inspired by **Level Devil** — minimalist look, perfectly planned traps, and obvious ragebait.

![Level Devil](https://img.shields.io/badge/play-in%20browser-8a3ffc)
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

On mobile, on-screen touch controls appear automatically: move arrows on the left, jump and restart on the right.

## Features

- 10 handcrafted levels with collapse floors, pop spikes, falling blocks, crushers, fleeing doors, homing floor gaps, fake doors, and inverted controls
- Minimalist paper-white aesthetic with blood stains, screen shake, and particle juice
- Procedural Web Audio sound effects
- Death counter + level unlock progress (saved in `localStorage`)
- Mobile support with clean on-screen touch controls

## Tech

Pure HTML, CSS, and JavaScript — no build step, no dependencies.

## License

MIT — see [LICENSE](LICENSE).

This is a fan recreation for learning and fun. Not affiliated with the original Level Devil game.
