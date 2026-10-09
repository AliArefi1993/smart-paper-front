#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/ci-stable-apk.py preflight
python3 - <<'PY'
from pathlib import Path
p = Path('android/gradle/wrapper/gradle-wrapper.properties')
text = p.read_text()
assert r'distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-all.zip' in text.splitlines(), 'Unexpected Gradle distribution'
lines = [line for line in text.splitlines() if not line.startswith('distributionSha256Sum=')]
p.write_text('\n'.join(lines) + '\ndistributionSha256Sum=ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c\n')
PY
cd android
./gradlew --no-daemon --max-workers=2 --console=plain assembleRelease
test -f app/build/outputs/apk/release/app-release-unsigned.apk
