<<<<<<< HEAD
# polymarket-assistant
=======
# Polymarket Strategy Assistant

A Chrome Extension that helps users make smarter decisions on Polymarket prediction markets.

## Features

### Base Rate Display (P0)
- Automatically detects speaker-related markets on Polymarket
- Shows historical Base Rate from local JSON data
- Calculates probability gap (your probability vs market pricing)
- Provides trading recommendations (Overpriced/Underpriced)

### Strategy Filter (P0)
- Filter toolbar on Polymarket homepage
- Filter by: Market Gap ≥15%, Speaker Markets, High Liquidity
- Highlights matching markets

### Risk Dashboard (P1)
- Displays on wallet/portfolio page
- Shows position sizes with risk warnings
- Alerts when position >5% or total exposure >15%

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" button
4. Select the `polymarket-assistant` folder
5. The extension should now be installed and active

## Usage

### Base Rate Display
1. Navigate to any Polymarket market page
2. If the market contains a tracked speaker/keyword, the widget will automatically appear
3. View the Base Rate analysis and probability gap
4. Follow the trading recommendation

### Strategy Filter
1. Navigate to Polymarket homepage
2. Use the filter toolbar to select criteria
3. Click "Apply" to filter markets
4. Matching markets will be highlighted

### Risk Dashboard
1. Navigate to your Polymarket portfolio/wallet page
2. View your positions and risk exposure
3. Watch for warning alerts

## Data

The extension uses local JSON data files:
- `data/speakers.json` - Speaker and keyword historical data
- `data/config.json` - Configuration settings

## Development

The extension is built with:
- Manifest V3
- Content Scripts for page injection
- Shadow DOM for style isolation
- Chrome Storage for settings

## Version

1.0.0
>>>>>>> 6e2da1e (init)
