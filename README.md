# Polymarket Strategy Assistant

A Chrome extension that helps users make data-driven decisions on Polymarket prediction markets.

## Features

- Base Rate analysis for speaker/keyword markets
- Strategy recommendations from probability gap and momentum
- Risk calculator with Kelly sizing and expected value
- Market pulse, position tracker, and alert utilities in popup

## Tech Stack

- Chrome Extension Manifest V3
- Plain JavaScript + CSS
- `esbuild` for bundling and minification

## Development

### 1. Install dependencies

```bash
npm install
```

### 2. Build extension

```bash
npm run build
```

Build output goes to `dist/`.

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/Users/aias/Work/github/polymarket-assistant/dist`

## Project Structure

```text
polymarket-assistant/
├── background/
├── content/
├── data/
├── icons/
├── popup/
├── scripts/
│   └── build.mjs
├── manifest.json
└── package.json
```

## Notes

- Source files remain in root feature folders (`background/`, `content/`, `popup/`).
- Do not load source root directly in Chrome for normal development flow. Build first, then load `dist/`.
