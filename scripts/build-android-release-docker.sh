#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$repo_root/android/keystore.properties" ]; then
  echo "Missing android/keystore.properties. Copy android/keystore.properties.example and fill in the local signing values." >&2
  exit 1
fi

docker run --rm \
  -e NEXT_PUBLIC_DATA_MODE=local \
  -v "$repo_root":/app \
  -v smart-paper-front-node-modules:/app/node_modules \
  -w /app \
  node:24-alpine \
  sh -lc 'npm run build && npx cap sync android'

docker run --rm \
  --platform linux/amd64 \
  --dns 8.8.8.8 \
  --dns 1.1.1.1 \
  -e GRADLE_OPTS='-Djava.net.preferIPv4Stack=true -Dsun.net.inetaddr.ttl=60' \
  -v "$repo_root":/app \
  -v smart-paper-front-node-modules:/app/node_modules \
  -v smart-paper-front-gradle:/root/.gradle \
  -v smart-paper-front-android-sdk:/opt/android-sdk \
  -w /app/android \
  eclipse-temurin:21-jdk \
  sh -lc 'export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; ./gradlew assembleRelease'
