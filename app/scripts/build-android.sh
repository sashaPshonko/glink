#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# JDK из Android Studio (предпочтительно)
if [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
elif [ -d "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

# Android SDK
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [ -z "${ANDROID_SDK_ROOT:-}" ] && [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

if [ ! -d "android" ]; then
  echo "→ генерирую android/ (expo prebuild)"
  bash scripts/fetch-cert.sh
  npx expo prebuild --platform android --no-install
fi

if [ ! -x "android/gradlew" ]; then
  echo "ERROR: нет android/gradlew — сначала: npx expo prebuild --platform android"
  exit 1
fi

if [ -z "${JAVA_HOME:-}" ] || ! command -v "$JAVA_HOME/bin/java" >/dev/null 2>&1; then
  echo "ERROR: нужна Java 17+."
  echo "Установи Android Studio и открой один раз, или:"
  echo "  brew install --cask android-studio"
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "ERROR: Android SDK не найден."
  echo "1. Открой Android Studio"
  echo "2. More Actions → SDK Manager → установи Android SDK"
  echo "3. Запусти этот скрипт снова"
  exit 1
fi

echo "→ JAVA_HOME=$JAVA_HOME"
echo "→ ANDROID_HOME=$ANDROID_HOME"
echo "→ собираю release APK (JS внутри, Metro не нужен)…"

cd android
./gradlew assembleRelease --no-daemon

APK="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  OUT="../glink.apk"
  cp "$APK" "$OUT"
  echo ""
  echo "✓ APK готов: $(cd .. && pwd)/glink.apk"
  echo "  Скинь на телефон и установи."
else
  echo "ERROR: APK не найден"
  exit 1
fi
