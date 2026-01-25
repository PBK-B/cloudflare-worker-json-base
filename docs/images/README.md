# Console Screenshots

This directory contains actual screenshots of the WebUI Console taken with Playwright.

## Screenshots (Resolution: 1400x900)

| File | Description | Size |
|------|-------------|------|
| `console-login.png` | Login page with API key input | 24 KB |
| `console-dashboard.png` | Dashboard after login showing stats | 61 KB |
| `console-data.png` | Data management page | 91 KB |

## Generate Screenshots

```bash
# Start development servers
npm run dev &
npm run webui &

# Take all screenshots at once
node scripts/take-screenshots.js
```
