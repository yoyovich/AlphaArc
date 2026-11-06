#!/bin/bash
# Ten distinct browser configurations, all against local intercepted fixtures.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -d iOS/scripts/browser-tests/node_modules/playwright ]; then
  echo 'Install dependencies first: npm ci --ignore-scripts --prefix iOS/scripts/browser-tests' >&2
  exit 1
fi
report_dir="${SAIL_TEST_REPORT_DIR:-iOS/.build/browser-checks}"
mkdir -p "$report_dir"
status=0
for test_browser in chromium webkit; do
  for test_case in desktop-light desktop-dark phone-light phone-dark phone-landscape-ru; do
    test_mobile=0
    test_landscape=0
    test_locale=en-US
    test_color_scheme=light
    case "$test_case" in
      desktop-dark) test_color_scheme=dark ;;
      phone-light) test_mobile=1 ;;
      phone-dark) test_mobile=1; test_color_scheme=dark ;;
      phone-landscape-ru) test_mobile=1; test_landscape=1; test_color_scheme=dark; test_locale=ru-RU ;;
    esac
    log="$report_dir/$test_browser-$test_case.log"
    if SAIL_TEST_BROWSER="$test_browser" SAIL_TEST_MOBILE="$test_mobile" \
      SAIL_TEST_LANDSCAPE="$test_landscape" SAIL_TEST_COLOR_SCHEME="$test_color_scheme" \
      SAIL_TEST_LOCALE="$test_locale" npm test --prefix iOS/scripts/browser-tests >"$log" 2>&1; then
      echo "PASS: $test_browser / $test_case"
    else
      echo "FAIL: $test_browser / $test_case" >&2
      cat "$log" >&2
      status=1
    fi
  done
done
exit "$status"
