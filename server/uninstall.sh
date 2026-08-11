#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/bin"
PGAP_DIR="${HOME}/.pgautopilot"
BIN_NAME="pgautopilot"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}PGAutoPilot — Uninstall${NC}"
echo ""

SHELL_RC=""
case "$SHELL" in
  */zsh) SHELL_RC="$HOME/.zshrc" ;;
  */bash) SHELL_RC="$HOME/.bashrc" ;;
  *) SHELL_RC="$HOME/.profile" ;;
esac

if [ ! -d "$PGAP_DIR" ] && [ ! -f "$INSTALL_DIR/$BIN_NAME" ]; then
  echo -e "${YELLOW}PGAutoPilot is not installed.${NC}"
  if [ -f "$SHELL_RC" ] && grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "But leftover PATH entry found — cleaning up."
  else
    echo "Nothing to uninstall."
    exit 0
  fi
fi

LAUNCHER="$INSTALL_DIR/$BIN_NAME"

if [ -f "$LAUNCHER" ]; then
  echo "Removing launcher: $LAUNCHER"
  rm -f "$LAUNCHER"
fi

if [ -d "$PGAP_DIR" ]; then
  echo "Removing installation directory: $PGAP_DIR"
  rm -rf "$PGAP_DIR"
fi

if [ -f "$SHELL_RC" ] && grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
  echo "Removing $INSTALL_DIR from PATH in $SHELL_RC ..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/export PATH=\"$INSTALL_DIR:\$PATH\"/d" "$SHELL_RC" 2>/dev/null || true
  else
    sed -i "/export PATH=\"$INSTALL_DIR:\$PATH\"/d" "$SHELL_RC" 2>/dev/null || true
  fi
  echo -e "${GREEN}Cleaned up PATH entry in $SHELL_RC.${NC}"
fi

echo ""
echo -e "${GREEN}PGAutoPilot has been uninstalled successfully.${NC}"
echo ""
echo "If you manually added $INSTALL_DIR to your PATH,"
echo "remove it from your shell RC file manually."
echo ""
echo -e "${YELLOW}Restart your terminal or run: source $SHELL_RC${NC}"
