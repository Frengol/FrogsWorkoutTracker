#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${PROJECT_ROOT}/android"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
ADB_BIN="${ADB_BIN:-$(command -v adb || true)}"
JAVA_BIN="${JAVA_BIN:-$(command -v java || true)}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"

if [[ -z "${ANDROID_SDK_ROOT}" ]]; then
  for candidate in "${HOME}/Android/Sdk" "/var/home/${USER}/Android/Sdk"; do
    if [[ -d "${candidate}" ]]; then
      ANDROID_SDK_ROOT="${candidate}"
      break
    fi
  done
fi

GRADLE_WRAPPER="${ANDROID_DIR}/gradlew"
STUDIO_BIN="${STUDIO_BIN:-${HOME}/.local/opt/android-studio/bin/studio}"
STUDIO_JBR_DIR="${HOME}/.local/opt/android-studio/jbr"

echo "Android Studio environment check"
echo

check_binary() {
  local label="$1"
  local path="$2"

  if [[ -n "${path}" && -x "${path}" ]]; then
    echo "[ok] ${label}: ${path}"
  else
    echo "[missing] ${label}"
  fi
}

check_dir() {
  local label="$1"
  local path="$2"

  if [[ -n "${path}" && -d "${path}" ]]; then
    echo "[ok] ${label}: ${path}"
  else
    echo "[missing] ${label}"
  fi
}

check_binary "node" "${NODE_BIN}"
check_binary "npm" "${NPM_BIN}"
check_binary "adb" "${ADB_BIN}"
check_binary "java" "${JAVA_BIN}"
check_dir "Android SDK" "${ANDROID_SDK_ROOT}"
check_binary "Gradle wrapper" "${GRADLE_WRAPPER}"
check_binary "Android Studio" "${STUDIO_BIN}"
check_dir "Android Studio JBR" "${STUDIO_JBR_DIR}"

echo
echo "Expected Android Studio import target:"
echo "  ${ANDROID_DIR}"

echo
echo "Recommended IDE settings:"
echo "  - Open the android/ folder, not the repo root"
echo "  - Gradle JDK: Android Studio JBR or JDK 17"
echo "  - Gradle: Use Gradle wrapper"
echo "  - Android SDK: ${ANDROID_SDK_ROOT:-<set this in the IDE>}"

if [[ -n "${NODE_BIN}" ]]; then
  echo
  echo "Node version: $("${NODE_BIN}" -v)"
fi

if [[ -n "${NPM_BIN}" ]]; then
  echo "npm version: $("${NPM_BIN}" -v)"
fi

if [[ -n "${JAVA_BIN}" ]]; then
  echo "Java version:"
  "${JAVA_BIN}" -version 2>&1 | sed 's/^/  /'
fi

if [[ -n "${ADB_BIN}" ]]; then
  echo
  echo "adb version:"
  "${ADB_BIN}" version | sed 's/^/  /'
fi
