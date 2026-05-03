#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-release}"
APK_PATH="${2:-}"

if [[ -z "${APK_PATH}" ]]; then
  case "${MODE}" in
    release)
      APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
      ;;
    debug)
      APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
      ;;
    *)
      echo "Usage: $0 <release|debug> [apk-path]" >&2
      exit 2
      ;;
  esac
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to inspect APK contents." >&2
  exit 1
fi

if [[ ! -f "${APK_PATH}" ]]; then
  echo "APK not found at ${APK_PATH}" >&2
  exit 1
fi

BUNDLE_PATH="assets/index.android.bundle"
HAS_BUNDLE="no"

if unzip -l "${APK_PATH}" | grep -q "${BUNDLE_PATH}"; then
  HAS_BUNDLE="yes"
fi

echo "APK: ${APK_PATH}"
echo "Mode: ${MODE}"
echo "Contains ${BUNDLE_PATH}: ${HAS_BUNDLE}"

case "${MODE}" in
  release)
    if [[ "${HAS_BUNDLE}" != "yes" ]]; then
      echo "ERROR: release APK is missing ${BUNDLE_PATH} and is not standalone." >&2
      exit 1
    fi
    echo "OK: release APK is bundled and suitable for standalone device testing."
    ;;
  debug)
    echo "INFO: debug APK is a development artifact and must not be used as a standalone manual test build."
    echo "Use 'npm run android:run' with Metro for debug development."
    echo "If using a physical device over USB, also run: adb reverse tcp:8081 tcp:8081"
    ;;
esac
