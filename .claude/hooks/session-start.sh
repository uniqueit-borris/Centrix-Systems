#!/bin/bash
set -euo pipefail

# This project is a static HTML/CSS/JS site with no package manager,
# build step, linter, or test framework. This hook just does a fast
# sanity check that the JS is syntactically valid before the session starts.

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if command -v node >/dev/null 2>&1; then
  node --check "$CLAUDE_PROJECT_DIR/app.js"
fi
