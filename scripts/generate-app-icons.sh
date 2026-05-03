#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="${ROOT_DIR}/app_icon_v1.png"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required to generate app icons." >&2
  exit 1
fi

if [[ ! -f "${SOURCE_ICON}" ]]; then
  echo "Source icon not found at ${SOURCE_ICON}" >&2
  exit 1
fi

ASSETS_DIR="${ROOT_DIR}/assets/images"
IOS_ICON_DIR="${ROOT_DIR}/ios/FrogWorkoutTracker/Images.xcassets/AppIcon.appiconset"
IOS_SPLASH_DIR="${ROOT_DIR}/ios/FrogWorkoutTracker/Images.xcassets/SplashScreenLogo.imageset"
ANDROID_RES_DIR="${ROOT_DIR}/android/app/src/main/res"

mkdir -p "${ASSETS_DIR}" "${IOS_ICON_DIR}" "${IOS_SPLASH_DIR}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

CIRCLE_MASK="${TMP_DIR}/circle-mask.png"
SOLID_BG="${TMP_DIR}/adaptive-bg.png"
CIRCLED_ICON="${TMP_DIR}/circled-icon.png"
FOREGROUND_ICON="${TMP_DIR}/foreground-icon.png"
MONO_ICON="${TMP_DIR}/mono-icon.png"

magick -size 1024x1024 xc:none -fill white -draw "circle 512,512 512,16" "${CIRCLE_MASK}"
magick "${SOURCE_ICON}" "${CIRCLE_MASK}" -alpha off -compose CopyOpacity -composite "${CIRCLED_ICON}"
magick -size 1024x1024 xc:"#0F1C2C" "${SOLID_BG}"
magick "${CIRCLED_ICON}" -resize 432x432 -background none -gravity center -extent 512x512 "${FOREGROUND_ICON}"
magick "${CIRCLED_ICON}" -resize 432x432 -background none -gravity center -extent 432x432 -fill white -colorize 100 "${MONO_ICON}"

# Shared Expo/Web assets
magick "${SOURCE_ICON}" -resize 1024x1024 "${ASSETS_DIR}/icon.png"
magick "${FOREGROUND_ICON}" "${ASSETS_DIR}/android-icon-foreground.png"
magick "${SOLID_BG}" -resize 432x432 "${ASSETS_DIR}/android-icon-background.png"
magick "${MONO_ICON}" "${ASSETS_DIR}/android-icon-monochrome.png"
magick "${SOURCE_ICON}" -resize 1024x1024 "${ASSETS_DIR}/splash-icon.png"
magick "${SOURCE_ICON}" -resize 48x48 "${ASSETS_DIR}/favicon.png"

# iOS generated assets
magick "${SOURCE_ICON}" -resize 1024x1024 "${IOS_ICON_DIR}/App-Icon-1024x1024@1x.png"
magick "${SOURCE_ICON}" -resize 200x200 "${IOS_SPLASH_DIR}/image.png"
magick "${SOURCE_ICON}" -resize 400x400 "${IOS_SPLASH_DIR}/image@2x.png"
magick "${SOURCE_ICON}" -resize 600x600 "${IOS_SPLASH_DIR}/image@3x.png"

# Android legacy launcher icons
declare -A LEGACY_SIZES=(
  [mdpi]=48
  [hdpi]=72
  [xhdpi]=96
  [xxhdpi]=144
  [xxxhdpi]=192
)

declare -A FOREGROUND_SIZES=(
  [mdpi]=108
  [hdpi]=162
  [xhdpi]=216
  [xxhdpi]=324
  [xxxhdpi]=432
)

declare -A SPLASH_SIZES=(
  [mdpi]=288
  [hdpi]=432
  [xhdpi]=576
  [xxhdpi]=864
  [xxxhdpi]=1152
)

for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  magick "${SOURCE_ICON}" -resize "${LEGACY_SIZES[$density]}x${LEGACY_SIZES[$density]}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher.webp"
  magick "${SOURCE_ICON}" -resize "${LEGACY_SIZES[$density]}x${LEGACY_SIZES[$density]}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_round.webp"
  magick "${FOREGROUND_ICON}" -resize "${FOREGROUND_SIZES[$density]}x${FOREGROUND_SIZES[$density]}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_foreground.webp"
  magick "${SOLID_BG}" -resize "${FOREGROUND_SIZES[$density]}x${FOREGROUND_SIZES[$density]}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_background.webp"
  magick "${MONO_ICON}" -resize "${FOREGROUND_SIZES[$density]}x${FOREGROUND_SIZES[$density]}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_monochrome.webp"
  magick "${SOURCE_ICON}" -resize "${SPLASH_SIZES[$density]}x${SPLASH_SIZES[$density]}" "${ANDROID_RES_DIR}/drawable-${density}/splashscreen_logo.png"
done

echo "Generated app icons and splash assets from ${SOURCE_ICON}"
