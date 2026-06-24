# WPM Trainer

A clean, **zero-dependency** typing-speed trainer that runs entirely in the browser — built to
measurably improve real words-per-minute, not just test it.

🔗 **Live demo:** _[enable GitHub Pages → URL goes here]_

## Features
- **Live test** — Easy/Medium/Hard text, 15/30/60s, with **net WPM, accuracy, errors** updating as you type
- **Per-character error highlighting** + blinking caret
- **Finger keyboard** — color-coded by finger; the **next key glows** and tells you which finger to use (trains touch typing)
- **Weak-key drills** — records every key you mistype and generates a drill targeting *your* worst keys
- **Progress tracking** — best, average, streak, and a sparkline with your goal line (all saved locally)
- **Custom text** + a celebratory confetti when you beat your goal

## Tech
- **Vanilla HTML/CSS/JavaScript** — no frameworks, no build step, no dependencies
- `localStorage` for progress + weak-key history · `IntersectionObserver`-free, pure DOM
- Single self-contained file → works offline, deploys anywhere static

## Run it
- **Locally:** open `index.html` in any browser.
- **Deploy:** push to GitHub and enable **Pages** — it's static, so it just works.

## Privacy
Everything runs client-side; your stats live only in your browser's `localStorage`.

## License
MIT © Rolly Calma ([Ghraven](https://github.com/Ghraven))
