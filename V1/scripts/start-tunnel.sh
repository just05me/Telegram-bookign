#!/usr/bin/env bash
# Starts ngrok tunnel for the webapp (port 3000), launches the webapp and bot server
# with FRONTEND_URL automatically set to the ngrok HTTPS URL.
#
# Usage:
#   npm run tunnel
#
# Requires NGROK_AUTHTOKEN to be set in your .env file.
# Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load NGROK_AUTHTOKEN from .env if not already in environment
if [ -z "$NGROK_AUTHTOKEN" ] && [ -f "$ROOT_DIR/.env" ]; then
  NGROK_AUTHTOKEN=$(grep -E '^NGROK_AUTHTOKEN=' "$ROOT_DIR/.env" | cut -d'=' -f2- | tr -d '"'"'" | tr -d "'")
fi

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo ""
  echo "ERROR: NGROK_AUTHTOKEN is not set."
  echo ""
  echo "1. Sign up (free) at https://dashboard.ngrok.com/signup"
  echo "2. Copy your token from https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "3. Add to root .env file:  NGROK_AUTHTOKEN=\"your_token_here\""
  echo ""
  exit 1
fi

# Find or install ngrok
NGROK_BIN="${HOME}/.local/bin/ngrok"
if ! command -v "$NGROK_BIN" &>/dev/null; then
  if command -v ngrok &>/dev/null; then
    NGROK_BIN="ngrok"
  else
    echo "ngrok not found, installing..."
    curl -s https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz | tar xz -C /tmp
    mkdir -p "${HOME}/.local/bin"
    mv /tmp/ngrok "${HOME}/.local/bin/ngrok"
    NGROK_BIN="${HOME}/.local/bin/ngrok"
  fi
fi

# Configure ngrok auth token
mkdir -p "${HOME}/.config/ngrok"
"$NGROK_BIN" config add-authtoken "$NGROK_AUTHTOKEN" 2>/dev/null || true

echo "Starting ngrok tunnel on port 3000..."
"$NGROK_BIN" http 3000 --log=stdout --log-format=json > /tmp/ngrok_tunnel.log 2>&1 &
NGROK_PID=$!

# Wait for tunnel to be ready by polling the ngrok API
TUNNEL_URL=""
for i in $(seq 1 15); do
  sleep 1
  API_OUTPUT=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null || true)
  # Extract HTTPS tunnel URL using grep/sed (no Python dependency)
  TUNNEL_URL=$(echo "$API_OUTPUT" | grep -o '"public_url":"https://[^"]*"' | grep -v '":80' | cut -d'"' -f4 | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not get ngrok URL after 15 seconds."
  echo "Check /tmp/ngrok_tunnel.log for details."
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "  ngrok tunnel active: $TUNNEL_URL"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Bot will use: FRONTEND_URL=$TUNNEL_URL"
echo "Webapp will use: NEXT_PUBLIC_API_URL=$TUNNEL_URL"
echo ""
echo "Configure BotFather (if not done yet):"
echo "  @BotFather → /setmenubutton → URL: $TUNNEL_URL"
echo ""
echo "Ports:"
echo "  ngrok → $TUNNEL_URL → webapp :3000"
echo "  webapp rewrites /api/* → server :3001"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Start server with FRONTEND_URL pointing to ngrok
export FRONTEND_URL="$TUNNEL_URL"
cd "$ROOT_DIR" && npm run dev:server &
SERVER_PID=$!

# Start webapp with NEXT_PUBLIC_API_URL pointing to ngrok
export NEXT_PUBLIC_API_URL="$TUNNEL_URL"
cd "$ROOT_DIR" && npm run dev:webapp &
WEBAPP_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $WEBAPP_PID 2>/dev/null
  kill $SERVER_PID 2>/dev/null
  kill $NGROK_PID 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Wait for any child to exit
wait
