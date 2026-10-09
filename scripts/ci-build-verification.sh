#!/usr/bin/env bash
set -euo pipefail

# This helper is restricted to an ephemeral hosted runner checkout.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || {
  echo 'Verification build requires a GitHub-hosted Linux CI checkout.' >&2
  exit 1
}
cd "$(dirname "$0")/.."
if [[ -e android/keystore.properties ]] ||
   find android -type f \( -name '*.jks' -o -name '*.keystore' -o -name '*.p12' \) -print -quit | grep -q .; then
  echo 'Refusing verification build with local signing material present.' >&2
  exit 1
fi
for signing_var in SMART_PAPER_UPLOAD_STORE_FILE SMART_PAPER_UPLOAD_STORE_PASSWORD SMART_PAPER_UPLOAD_KEY_ALIAS SMART_PAPER_UPLOAD_KEY_PASSWORD; do
  if [[ -n "${!signing_var:-}" ]]; then
    echo 'Refusing verification build with release-signing environment present.' >&2
    exit 1
  fi
done
[[ "$NEXT_PUBLIC_DATA_MODE" == local ]]
test -f out/index.html

# Public Android debug credentials; this fresh key is never cached or uploaded.
[[ "$VERIFICATION_KEYSTORE_PATH" == "$RUNNER_TEMP/smart-paper-verification-debug.keystore" ]]
test ! -e "$VERIFICATION_KEYSTORE_PATH"
keytool -genkeypair -noprompt -keystore "$VERIFICATION_KEYSTORE_PATH" \
  -storetype JKS -storepass android -keypass android -alias androiddebugkey \
  -dname 'CN=Android Debug,O=Android,C=US' -keyalg RSA -keysize 2048 -validity 10000

# Add the official checksum only in this ephemeral checkout's wrapper configuration.
# Gradle checks newly downloaded distribution archives against this value.
python3 - <<'PY'
from pathlib import Path
p = Path('android/gradle/wrapper/gradle-wrapper.properties')
text = p.read_text()
expected_url = r'distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-all.zip'
assert expected_url in text.splitlines(), 'Unexpected Gradle distribution'
lines = [line for line in text.splitlines() if not line.startswith('distributionSha256Sum=')]
p.write_text('\n'.join(lines) + '\ndistributionSha256Sum=ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c\n')
PY

test ! -e android/app/src/debug/AndroidManifest.xml
mkdir -p android/app/src/debug
cat > android/app/src/debug/AndroidManifest.xml <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
    <application android:label="Smart Paper Verification" tools:replace="android:label">
        <activity android:name="com.aliarefi.smartpaper.MainActivity"
                  android:label="Smart Paper Verification" tools:replace="android:label" />
    </application>
</manifest>
XML
verification_init=$(mktemp "$RUNNER_TEMP/smart-paper-verification.XXXXXX.gradle")
trap 'rm -f "$verification_init"' EXIT
cat > "$verification_init" <<'GRADLE'
gradle.beforeProject { project ->
    project.pluginManager.withPlugin('com.android.application') {
        project.android.buildTypes.debug.applicationIdSuffix = '.verification'
        project.android.buildTypes.debug.versionNameSuffix = '-verification'
        project.android.signingConfigs.debug.storeFile = project.file(System.getenv('VERIFICATION_KEYSTORE_PATH'))
        project.android.signingConfigs.debug.storePassword = 'android'
        project.android.signingConfigs.debug.keyAlias = 'androiddebugkey'
        project.android.signingConfigs.debug.keyPassword = 'android'
    }
}
GRADLE
cd android
./gradlew --no-daemon --max-workers=2 --console=plain -I "$verification_init" assembleDebug
