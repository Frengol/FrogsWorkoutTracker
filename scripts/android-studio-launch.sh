#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_PROJECT_DIR="${PROJECT_ROOT}/android"

STUDIO_BIN="${STUDIO_BIN:-${HOME}/.local/opt/android-studio/bin/studio}"
STUDIO_JBR_DIR="${HOME}/.local/opt/android-studio/jbr"
NODE_HOME_DEFAULT="${HOME}/.nvm/versions/node/v20.20.1"

if [[ ! -x "${STUDIO_BIN}" ]]; then
  echo "Android Studio binary not found at ${STUDIO_BIN}" >&2
  exit 1
fi

if [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "${HOME}/Android/Sdk" ]]; then
    export ANDROID_SDK_ROOT="${HOME}/Android/Sdk"
  elif [[ -d "/var/home/${USER}/Android/Sdk" ]]; then
    export ANDROID_SDK_ROOT="/var/home/${USER}/Android/Sdk"
  fi
fi

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
export JAVA_HOME="${JAVA_HOME:-${STUDIO_JBR_DIR}}"

if [[ -d "${NODE_HOME_DEFAULT}/bin" ]]; then
  export PATH="${NODE_HOME_DEFAULT}/bin:${PATH}"
fi

if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${PATH}"
fi

export PATH="${JAVA_HOME}/bin:${PATH}"

echo "Launching Android Studio with:"
echo "  PROJECT=${ANDROID_PROJECT_DIR}"
echo "  ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-unset}"
echo "  JAVA_HOME=${JAVA_HOME}"
echo "  NODE=$(command -v node || echo unset)"

exec "${STUDIO_BIN}" "${ANDROID_PROJECT_DIR}"
