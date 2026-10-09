#!/usr/bin/env python3
"""Sign only a validated same-run candidate; never execute npm or Gradle with secrets."""
import base64
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys

REPO = Path(__file__).resolve().parent.parent
SECRET_NAMES = (
    'SMART_PAPER_UPLOAD_KEYSTORE_BASE64', 'SMART_PAPER_UPLOAD_STORE_PASSWORD',
    'SMART_PAPER_UPLOAD_KEY_ALIAS', 'SMART_PAPER_UPLOAD_KEY_PASSWORD',
)


def signing_directory():
    return Path(os.environ['RUNNER_TEMP']) / 'smart-paper-stable-signing'


def cleanup():
    directory = signing_directory()
    if directory.is_symlink():
        raise ValueError('Unexpected signing directory symlink')
    if directory.exists():
        shutil.rmtree(directory)


def sign():
    if not all(os.environ.get(name) for name in SECRET_NAMES):
        raise ValueError('Missing protected environment signing secrets')
    # Recheck identity/checksums with credential values removed from the preflight.
    secrets = {name: os.environ.pop(name) for name in SECRET_NAMES}
    try:
        spec = importlib.util.spec_from_file_location('stable_validation', REPO / 'scripts/ci-stable-apk.py')
        validation = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validation)
        validation.validate()
        encoded = ''.join(secrets['SMART_PAPER_UPLOAD_KEYSTORE_BASE64'].split())
        key = base64.b64decode(encoded, validate=True)
        if not key:
            raise ValueError('Empty signing key')
        directory = signing_directory()
        directory.mkdir(mode=0o700)
        key_path = directory / 'stable.jks'
        with key_path.open('xb') as file:
            os.chmod(key_path, 0o600)
            file.write(key)
        artifact = REPO / 'stable-artifact'
        if artifact.exists():
            raise ValueError('Signed artifact directory already exists')
        artifact.mkdir()
        tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
        # Candidate is already aligned by AGP; validate alignment before signing.
        subprocess.run([str(tools / 'zipalign'), '-c', '-P', '16', '4', str(REPO / 'stable-candidate/unsigned.apk')], check=True, capture_output=True)
        env = os.environ.copy()
        env['SMART_PAPER_UPLOAD_STORE_PASSWORD'] = secrets['SMART_PAPER_UPLOAD_STORE_PASSWORD']
        env['SMART_PAPER_UPLOAD_KEY_PASSWORD'] = secrets['SMART_PAPER_UPLOAD_KEY_PASSWORD']
        subprocess.run([
            str(tools / 'apksigner'), 'sign', '--ks', str(key_path),
            '--ks-key-alias', secrets['SMART_PAPER_UPLOAD_KEY_ALIAS'],
            '--ks-pass', 'env:SMART_PAPER_UPLOAD_STORE_PASSWORD',
            '--key-pass', 'env:SMART_PAPER_UPLOAD_KEY_PASSWORD',
            '--v4-signing-enabled', 'false', '--out', str(artifact / 'smart-paper-stable.apk'),
            str(REPO / 'stable-candidate/unsigned.apk'),
        ], check=True, capture_output=True, env=env)
        print('Stable signing completed; public certificate verification follows')
    finally:
        secrets.clear()
        cleanup()


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--cleanup']:
            cleanup()
        elif not sys.argv[1:]:
            sign()
        else:
            raise ValueError('Unsupported invocation')
    except Exception:
        # Secret-bearing tool output and exception details must never reach logs.
        print('::error file=scripts/ci-sign-stable.py,title=Stable signing failed::Signing failed; check protected environment secrets and approved candidate. No sensitive tool output disclosed.', file=sys.stderr)
        sys.exit(1)
