#!/usr/bin/env bash

set -euo pipefail

APK_PATH="${1:-android/app/build/outputs/apk/release/app-release.apk}"
PACKAGE_NAME="${FROG_ANDROID_PACKAGE:-com.frogworkouttracker.app}"
MAIN_ACTIVITY="${FROG_ANDROID_ACTIVITY:-com.frogworkouttracker.app/.MainActivity}"
WAIT_SECONDS="${FROG_SMOKE_WAIT_SECONDS:-8}"
OUTPUT_DIR="${FROG_SMOKE_OUTPUT_DIR:-.tmp/android-smoke}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is required for device smoke tests." >&2
  exit 1
fi

if [[ ! -f "${APK_PATH}" ]]; then
  echo "Release APK not found at ${APK_PATH}" >&2
  exit 1
fi

DEVICE_SERIAL="${ANDROID_SERIAL:-$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"

if [[ -z "${DEVICE_SERIAL}" ]]; then
  echo "No Android device detected. Connect a device or start an emulator before running the smoke test." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

LOG_FILE="${OUTPUT_DIR}/logcat-${TIMESTAMP}.txt"
FILTERED_LOG_FILE="${OUTPUT_DIR}/startup-${TIMESTAMP}.txt"

echo "Using device: ${DEVICE_SERIAL}"
echo "Installing APK: ${APK_PATH}"

adb -s "${DEVICE_SERIAL}" logcat -c
adb -s "${DEVICE_SERIAL}" shell am force-stop "${PACKAGE_NAME}" >/dev/null 2>&1 || true
adb -s "${DEVICE_SERIAL}" install -r "${APK_PATH}"
adb -s "${DEVICE_SERIAL}" shell am start -n "${MAIN_ACTIVITY}" >/dev/null

sleep "${WAIT_SECONDS}"

adb -s "${DEVICE_SERIAL}" logcat -d -v time > "${LOG_FILE}"
grep -E "FATAL EXCEPTION|Unable to load script| ANR | E/AndroidRuntime| E/ReactNativeJS|Process ${PACKAGE_NAME} .* has died" "${LOG_FILE}" > "${FILTERED_LOG_FILE}" || true

APP_PID="$(adb -s "${DEVICE_SERIAL}" shell pidof "${PACKAGE_NAME}" 2>/dev/null | tr -d '\r')"

if [[ -s "${FILTERED_LOG_FILE}" ]]; then
  echo "Potential startup failure detected. Relevant log excerpt:" >&2
  cat "${FILTERED_LOG_FILE}" >&2
  exit 1
fi

if [[ -z "${APP_PID}" ]]; then
  echo "The app process is not running after launch. Check ${LOG_FILE} for details." >&2
  exit 1
fi

echo "Smoke test passed. App process is alive with pid ${APP_PID}."
echo "Full log: ${LOG_FILE}"
