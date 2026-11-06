#!/bin/bash
# Offline checks everywhere; add --ios on a Mac to require the build and simulator suite too.
set -euo pipefail
cd "$(dirname "$0")/../.."

run_ios=0
run_web=0
for argument in "$@"; do
  case "$argument" in
    --ios) run_ios=1 ;;
    --web) run_web=1 ;;
    --all) run_ios=1; run_web=1 ;;
    *) echo 'usage: iOS/scripts/verify.sh [--ios] [--web] [--all]' >&2; exit 2 ;;
  esac
done

python3 iOS/scripts/validate-resources.py
python3 -m unittest discover -s iOS/scripts/tests -v

for tool in shellcheck actionlint; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "verify.sh: install $tool to complete lint checks" >&2
    exit 1
  fi
done
shellcheck iOS/scripts/*.sh
actionlint

git diff --check

if [ "$run_web" = 1 ]; then
  if [ ! -d iOS/scripts/browser-tests/node_modules/playwright ]; then
    echo 'verify.sh: first run npm ci --prefix iOS/scripts/browser-tests and install Playwright Chromium and WebKit' >&2
    exit 1
  fi
  iOS/scripts/test-browser-matrix.sh
else
  echo 'SKIP: browser-engine behavior tests; run verify.sh --web after installing test browsers'
fi
if [ "$run_ios" = 1 ]; then
  if [ "$(uname -s)" != Darwin ]; then
    echo 'verify.sh: --ios requires macOS, Xcode 26.5+, XcodeGen and an iOS 26+ simulator' >&2
    exit 1
  fi
  for tool in xcodebuild xcrun xcodegen; do
    command -v "$tool" >/dev/null 2>&1 || { echo "verify.sh: missing $tool" >&2; exit 1; }
  done
  iOS/scripts/build.sh
  iOS/scripts/test.sh
else
  echo 'SKIP: iOS build, Swift tests and simulator checks; run verify.sh --ios on a configured Mac'
fi
