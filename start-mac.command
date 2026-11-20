#!/bin/bash
# Double-click to start FreshLoop on macOS or Linux.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, then run this again."
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing FreshLoop for the first time. This takes about a minute..."
  npm install || { read -r -p "Install failed. Press Enter to close."; exit 1; }
fi
echo
echo "Starting FreshLoop at http://localhost:5173 (keep this window open)"
( sleep 6; (open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null) ) &
npm run dev
