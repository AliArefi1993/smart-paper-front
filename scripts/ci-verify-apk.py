#!/usr/bin/env python3
"""Fail closed on verification APK identity, signature, version and copied web assets."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


class VerificationError(ValueError):
    """A deliberate validation failure whose message is safe for CI annotations."""


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def verify(apk, out, gradle_config, tools):
    badging = run(str(tools / 'aapt'), 'dump', 'badging', str(apk))
    package = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging, re.M)
    require(package is not None, 'APK package/version missing')
    app_id, version_code, version_name = package.groups()
    config = gradle_config.read_text()
    expected_code = re.search(r'\bversionCode\s+(\d+)', config).group(1)
    expected_name = re.search(r'\bversionName\s+"([^"]+)"', config).group(1) + '-verification'
    require(app_id == 'com.aliarefi.smartpaper.verification', 'APK must use isolated verification app ID')
    require((version_code, version_name) == (expected_code, expected_name), 'APK version differs from checked-out source')
    require('application-debuggable' in badging, 'APK is not a debug build')
    require("application-label:'Smart Paper Verification'" in badging, 'APK application label is not verification')
    # SDK aapt emits two spaces before label; spacing is not part of the identity.
    require(re.search(r"^launchable-activity:\s+name='com\.aliarefi\.smartpaper\.MainActivity'\s+label='Smart Paper Verification'", badging, re.M), 'APK launcher activity/label differs')
    certificates = run(str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk))
    digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)$', certificates, re.M)
    require(len(digests) == 1, 'Expected exactly one APK signer')
    require(re.search(r'^Signer #1 certificate DN: .*CN=Android Debug', certificates, re.M), 'Expected ephemeral Android debug certificate')
    # Match the APK to this runner's generated public certificate, never a stable key.
    certificate = subprocess.check_output([
        'keytool', '-exportcert', '-keystore', str(Path.home() / '.android/debug.keystore'),
        '-alias', 'androiddebugkey', '-storepass', 'android',
    ], stderr=subprocess.PIPE)
    require(hashlib.sha256(certificate).hexdigest() == digests[0].lower(), 'APK signer differs from runner debug certificate')
    files = sorted(path for path in out.rglob('*') if path.is_file())
    require((out / 'index.html').is_file() and any(path.suffix == '.js' for path in files), 'Static local-data web build is missing')
    require(all(not path.is_symlink() for path in files), 'Unexpected web asset symlink')
    with zipfile.ZipFile(apk) as archive:
        require(len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate APK archive entries')
        for path in files:
            packaged_path = 'assets/public/' + path.relative_to(out).as_posix()
            require(archive.read(packaged_path) == path.read_bytes(), f'Packaged web asset differs: {packaged_path}')
    return {
        'application_id': app_id,
        'version_code': int(version_code),
        'version_name': version_name,
        'debuggable': True,
        'certificate_sha256': digests[0].lower(),
        'web_assets_compared': len(files),
    }


def main():
    repo = Path(__file__).resolve().parent.parent
    os.chdir(repo)
    require(os.environ.get('NEXT_PUBLIC_DATA_MODE') == 'local', 'Expected local-data build environment')
    source_sha = run('git', 'rev-parse', 'HEAD')
    require(source_sha == os.environ['VERIFICATION_EVENT_SHA'], 'Checkout revision differs from event revision')
    apk = repo / 'android/app/build/outputs/apk/debug/app-debug.apk'
    tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
    details = verify(apk, repo / 'out', repo / 'android/app/build.gradle', tools)
    destination = repo / 'verification-artifact'
    require(not destination.exists(), 'Artifact directory already exists')
    destination.mkdir()
    filename = 'smart-paper-verification.apk'
    shutil.copyfile(apk, destination / filename)
    checksum = hashlib.sha256((destination / filename).read_bytes()).hexdigest()
    (destination / 'SHA256SUMS').write_text(f'{checksum}  {filename}\n')
    provenance = {
        'purpose': 'Verification only; ephemeral debug signature; never a stable release',
        'installation': 'Separate app/data from stable Smart Paper; cannot upgrade stable app',
        'trust': 'PR artifacts/metadata are untrusted; not release attestations',
        'repository': os.environ['GITHUB_REPOSITORY'],
        'source_sha': source_sha,
        'event_sha': os.environ['VERIFICATION_EVENT_SHA'],
        'pr_head_sha': os.environ.get('VERIFICATION_PR_HEAD_SHA') or None,
        'event': os.environ['GITHUB_EVENT_NAME'],
        'ref': os.environ['GITHUB_REF'],
        'run_id': os.environ['GITHUB_RUN_ID'],
        'run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'run_url': f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        'node': run('node', '--version'),
        'java': run('java', '--version').splitlines()[0],
        'gradle': '8.14.3',
        'android_sdk': 36,
        'android_build_tools': '36.0.0',
        'data_mode': 'local',
        'checks': ['lint', 'typescript', 'tests', 'local-data production build', 'capacitor sync', 'assembleDebug', 'APK verification'],
        'apk_sha256': checksum,
        **details,
    }
    (destination / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'Verified {filename}: {checksum}; {details["web_assets_compared"]} matching web assets')


def report_failure(error):
    if isinstance(error, VerificationError):
        message = str(error)
    elif isinstance(error, subprocess.CalledProcessError):
        message = f'Verification tool {Path(error.cmd[0]).name} exited with code {error.returncode}'
    else:
        message = f'Verification failed ({type(error).__name__}); required metadata, assets or tool unavailable'
    # Never include captured tool output, signing material, or environment values.
    message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error file=scripts/ci-verify-apk.py,title=APK verification failed::{message}', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report_failure(error)
        sys.exit(1)
