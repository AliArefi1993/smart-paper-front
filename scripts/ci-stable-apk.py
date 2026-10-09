#!/usr/bin/env python3
"""Validate and transfer the exact main APK between secret-free build and signing jobs."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

STABLE_CERTIFICATE = '59912e191b4588996b4f3641c9b3609e77fa75aa6695be789ece1a0325faf2a5'
REPOSITORY = 'AliArefi1993/smart-paper-front'
REPO = Path(__file__).resolve().parent.parent
CANDIDATE = REPO / 'stable-candidate'
ARTIFACT = REPO / 'stable-artifact'


class ValidationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def context():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_OS') == 'Linux', 'Hosted Linux Actions context required')
    require(os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch', 'Manual dispatch required')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Only main may build or sign stable APKs')
    require(os.environ.get('GITHUB_REPOSITORY') == REPOSITORY, 'Unexpected repository')
    require(os.environ.get('NEXT_PUBLIC_DATA_MODE') == 'local', 'Expected local-data build mode')
    source_sha = run('git', 'rev-parse', 'HEAD')
    require(source_sha == os.environ.get('EXPECTED_SOURCE_SHA'), 'Checkout SHA differs from dispatched source')
    config = (REPO / 'android/app/build.gradle').read_text()
    code = re.search(r'\bversionCode\s+(\d+)', config)
    name = re.search(r'\bversionName\s+"([^"]+)"', config)
    require(code is not None and name is not None, 'Source Android version missing')
    require(code.group(1) == os.environ.get('EXPECTED_VERSION_CODE') and name.group(1) == os.environ.get('EXPECTED_VERSION_NAME'), 'Dispatch version differs from committed source')
    return {'source_sha': source_sha, 'version_code': int(code.group(1)), 'version_name': name.group(1)}


def preflight():
    details = context()
    require(not (REPO / 'android/keystore.properties').exists(), 'Local signing properties must be absent from hosted checkout')
    require(not any(path.is_file() for pattern in ('*.jks', '*.keystore', '*.p12') for path in (REPO / 'android').rglob(pattern)), 'Local signing key must be absent from hosted checkout')
    require(not any(os.environ.get(name) for name in (
        'SMART_PAPER_UPLOAD_STORE_FILE', 'SMART_PAPER_UPLOAD_KEYSTORE_BASE64',
        'SMART_PAPER_UPLOAD_STORE_PASSWORD', 'SMART_PAPER_UPLOAD_KEY_ALIAS', 'SMART_PAPER_UPLOAD_KEY_PASSWORD',
    )), 'Signing credentials must be absent during source checks and builds')
    return details


def verify_apk(apk, web, expected, signed):
    tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
    badging = run(str(tools / 'aapt'), 'dump', 'badging', str(apk))
    package = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging, re.M)
    require(package is not None, 'APK package/version missing')
    app_id, version_code, version_name = package.groups()
    require(app_id == 'com.aliarefi.smartpaper', 'APK must retain stable application ID')
    require(int(version_code) == expected['version_code'] and version_name == expected['version_name'], 'APK version differs from dispatched source')
    require('application-debuggable' not in badging, 'Stable APK must not be debuggable')
    require("application-label:'Smart Paper'" in badging, 'Unexpected stable application label')
    require(re.search(r"^launchable-activity:\s+name='com\.aliarefi\.smartpaper\.MainActivity'\s+label='Smart Paper'", badging, re.M), 'Unexpected stable launcher identity/label')
    signature = subprocess.run([str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)], capture_output=True, text=True)
    if signed:
        require(signature.returncode == 0, 'APK signature verification failed')
        digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)$', signature.stdout, re.M)
        require(len(digests) == 1 and digests[0].lower() == STABLE_CERTIFICATE, 'APK does not match the pinned stable signing certificate')
    else:
        require(signature.returncode != 0, 'Build candidate must be unsigned before protected signing')
    files = sorted(path for path in web.rglob('*') if path.is_file())
    require((web / 'index.html').is_file() and any(path.suffix == '.js' for path in files), 'Static local-data web build missing')
    require(all(not path.is_symlink() for path in files), 'Unexpected web asset symlink')
    with zipfile.ZipFile(apk) as archive:
        require(len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate APK archive entries')
        expected_assets = {'assets/public/' + path.relative_to(web).as_posix() for path in files}
        extra_assets = {name for name in archive.namelist() if name.startswith('assets/public/') and not name.endswith('/')} - expected_assets
        require(extra_assets <= {'assets/public/cordova.js', 'assets/public/cordova_plugins.js'}, 'Unexpected additional packaged web assets')
        require(all(archive.read(name) == b'' for name in extra_assets), 'Unexpected generated Cordova bridge content')
        for path in files:
            packaged = 'assets/public/' + path.relative_to(web).as_posix()
            require(archive.read(packaged) == path.read_bytes(), 'Packaged static web assets differ from validated build')
    return {'application_id': app_id, 'debuggable': False, 'web_assets_compared': len(files)}


def prepare():
    expected = preflight()
    apk = REPO / 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
    details = verify_apk(apk, REPO / 'out', expected, signed=False)
    require(not CANDIDATE.exists(), 'Candidate directory already exists')
    CANDIDATE.mkdir()
    shutil.copyfile(apk, CANDIDATE / 'unsigned.apk')
    shutil.copytree(REPO / 'out', CANDIDATE / 'web-build')
    metadata = {
        **expected, **details,
        'repository': REPOSITORY, 'run_id': os.environ['GITHUB_RUN_ID'],
        'builder_run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'unsigned_apk_sha256': sha256(CANDIDATE / 'unsigned.apk'),
        'node': run('node', '--version'), 'java': run('java', '--version').splitlines()[0],
        'gradle': '8.14.3', 'android_sdk': 36, 'android_build_tools': '36.0.0',
        'data_mode': 'local',
        'ci_transformations': ['NEXT_PUBLIC_DATA_MODE=local static export', 'Capacitor sync generated Android assets/config', 'official Gradle wrapper checksum injected into ephemeral checkout'],
        'checks': ['lint', 'typescript', 'tests', 'local-data production build', 'capacitor sync', 'assembleRelease unsigned', 'unsigned APK/assets verification'],
    }
    (CANDIDATE / 'build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Validated unsigned candidate collected; no signing material present')


def validate():
    expected = preflight()
    metadata = json.loads((CANDIDATE / 'build.json').read_text())
    require(all(metadata.get(key) == value for key, value in expected.items()), 'Candidate source/version metadata differs from dispatched source')
    require(metadata.get('repository') == REPOSITORY and metadata.get('run_id') == os.environ.get('GITHUB_RUN_ID'), 'Candidate belongs to another repository/run')
    require(metadata.get('data_mode') == 'local', 'Candidate data mode differs')
    require(sha256(CANDIDATE / 'unsigned.apk') == metadata.get('unsigned_apk_sha256'), 'Candidate unsigned APK checksum differs')
    verify_apk(CANDIDATE / 'unsigned.apk', CANDIDATE / 'web-build', expected, signed=False)
    return metadata


def verify():
    metadata = validate()
    apk = ARTIFACT / 'smart-paper-stable.apk'
    details = verify_apk(apk, CANDIDATE / 'web-build', metadata, signed=True)
    # Signing may add certificate records but must not change any candidate entry.
    with zipfile.ZipFile(CANDIDATE / 'unsigned.apk') as unsigned, zipfile.ZipFile(apk) as signed:
        require(all(signed.read(name) == unsigned.read(name) for name in unsigned.namelist()), 'Signing changed unsigned APK payload')
        extra_entries = set(signed.namelist()) - set(unsigned.namelist())
        require(all(re.fullmatch(r'META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))', name) for name in extra_entries), 'Signing introduced non-signature payload entries')
    checksum = sha256(apk)
    (ARTIFACT / 'SHA256SUMS').write_text(f'{checksum}  smart-paper-stable.apk\n')
    provenance = {
        **metadata, **details, 'certificate_sha256': STABLE_CERTIFICATE,
        'apk_sha256': checksum, 'candidate_artifact_id': os.environ['STABLE_CANDIDATE_ARTIFACT_ID'],
        'candidate_archive_sha256': os.environ['STABLE_CANDIDATE_ARTIFACT_DIGEST'],
        'signing_run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'run_url': f"{os.environ['GITHUB_SERVER_URL']}/{REPOSITORY}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        'purpose': 'Protected manual stable-signed build; publication remains a separate maintainer release decision',
        'checks': metadata['checks'] + ['pinned stable signature', 'stable identity/version/nondebug', 'signed APK/assets/payload verification'],
    }
    (ARTIFACT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'Verified stable APK checksum: {checksum}')


if __name__ == '__main__':
    os.chdir(REPO)
    try:
        {'preflight': preflight, 'prepare': prepare, 'validate': validate, 'verify': verify}[sys.argv[1]]()
    except Exception as error:
        message = str(error) if isinstance(error, ValidationError) else f'Stable validation failed ({type(error).__name__}); no tool output disclosed'
        message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print(f'::error file=scripts/ci-stable-apk.py,title=Stable APK validation failed::{message}', file=sys.stderr)
        sys.exit(1)
