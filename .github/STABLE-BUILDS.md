# Set up hosted stable-signed Android builds

Design: not applicable. No app behavior, version or publication policy changes.

The **Hosted stable-signed APK** workflow is manual and accepts only this repository's `main`. It checks the exact dispatched commit and expected committed Android version, runs lint/typecheck/tests/local-data production build and unsigned Android assembly on a secret-free runner, then waits for your `stable-signing` approval. A separate fresh runner signs that exact immutable same-run artifact ID with Android `apksigner`. Only that signing step receives the four credentials. No npm/Gradle process runs with them. Neither job restores or saves dependency caches. The candidate expires after one day; the final APK/checksum/provenance expire after seven days. Runs serialize and do not cancel an in-progress stable build.

## 1. Create and protect the environment first

Open [smart-paper-front Settings → Environments](https://github.com/AliArefi1993/smart-paper-front/settings/environments), choose **New environment**, name it exactly **stable-signing**, then configure:

- **Required reviewers:** add `AliArefi1993` and save protection rules.
- Leave **Prevent self-review** unchecked while you are the sole maintainer, so you can approve a run you initiated.
- Disable **Allow administrators to bypass configured protection rules** and save.
- **Deployment branches and tags:** choose **Selected branches and tags**, add a **Branch** rule whose name is exactly `main`. Do not add tags or wildcard branches.

Confirm those rules before adding secrets. Do not use repository-wide secrets: they would weaken the environment boundary. If required-reviewer or branch controls are unavailable, stop setup and resolve the GitHub plan/settings issue. Public repositories support these controls on current GitHub plans. GitHub automatically creates an unprotected empty environment when a workflow references a nonexistent name, so merely seeing `stable-signing` in a run is not proof of protection. See [GitHub environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## 2. Add the existing stable signing identity yourself

On your Mac, open Terminal and run these commands yourself (the agent does not read or upload your key):

```bash
cd /Users/aliarefi/Documents/programming/personal-project/smart-paper-team/smart-paper-front
base64 -i android/smart-paper-release.jks | pbcopy
```

This puts the encoded existing keystore on your clipboard without printing it. Base64 is an encoding of the private key, so treat the clipboard value as a secret. Under **stable-signing → Environment secrets → Add secret**, add:

| Exact environment secret name | Value you enter privately |
| --- | --- |
| `SMART_PAPER_UPLOAD_KEYSTORE_BASE64` | Paste the clipboard contents from the command above |
| `SMART_PAPER_UPLOAD_STORE_PASSWORD` | Existing `storePassword` value from your ignored local `android/keystore.properties` |
| `SMART_PAPER_UPLOAD_KEY_ALIAS` | Existing `keyAlias` value from that file |
| `SMART_PAPER_UPLOAD_KEY_PASSWORD` | Existing `keyPassword` value from that file |

Read those three values locally yourself. Do not paste them, the `.jks`, the properties file, or the base64 key into chat, an issue, a commit or a log. `storeFile` identifies the existing local `.jks`; the workflow decodes it into a private runner-temp directory and needs no `STORE_FILE` secret. Do not generate a replacement key. After adding secrets, clear the clipboard yourself with `printf '' | pbcopy`.

The verifier hard-pins the current public stable certificate SHA256:

```text
59912e191b4588996b4f3641c9b3609e77fa75aa6695be789ece1a0325faf2a5
```

The temporary key file has mode `0600` in a mode `0700` runner-temp directory, is deleted after signing even on ordinary errors, has an additional `always()` cleanup step, and is outside all artifact paths. A forcibly terminated runner is ephemeral. Sensitive signing-tool output is captured and never printed on failure.

## 3. Run and approve the reviewed commit

Open [Actions → Hosted stable-signed APK](https://github.com/AliArefi1993/smart-paper-front/actions/workflows/stable-build.yml), choose **Run workflow**, select **main**, and enter the `versionCode` and `versionName` already committed in `android/app/build.gradle`. The workflow refuses values that differ; it does not bump versions. For the initial setup test on current main, enter **26** and **2026.10.9** and treat the result as signing/build validation only. Do not replace the already published 2026.10.9 APK or republish its release/tag.

The secret-free **Check main and build unsigned candidate** job runs first. After it succeeds, open the pending **Approve exact source and sign stable APK** job, use **Review deployments**, select `stable-signing` and approve only after checking the run's exact source SHA, expected version and passing checks. Review changes to the workflow and signing/validation helpers at that exact source SHA before approving access to your key. Approval authorizes this build, not production deployment or publication. If main advances while the run waits, this run still uses its original immutable source commit. Source SHA identifies the reviewed base revision; provenance also records the generated Capacitor files and ephemeral wrapper checksum injection used by CI.

When both jobs pass, download the final **smart-paper-stable-…** artifact. Do not use **stable-unsigned-…** for installation/publication. Extract the final archive, then verify on your Mac:

```bash
shasum -a 256 -c SHA256SUMS
```

Check `provenance.json` for the exact source SHA, Android version, same-run candidate ID/archive digest, unsigned and final APK SHA256, stable certificate digest and run URL. The workflow also verifies stable app ID/labels, non-debuggable status, one cryptographically valid signer, every packaged web asset and every unsigned APK entry against the signed APK. Provenance is diagnostic evidence from the approved workflow, not a separate cryptographic attestation. Independently confirm the published APK's certificate/identity under the team release checks.

## 4. Keep the existing publication process

This workflow produces a signed artifact only. It does not create a release, change app versions, push, tag, merge, deploy, or use a cross-repository token. The team repository's committed-APK tag publisher remains unchanged.

For a new release, first commit a version higher than the latest shipped `versionCode` under the normal release workflow, then build that main commit remotely. Download and verify the exact hosted final APK; preserve its bytes and checksum. Follow the team `docs/release-workflow.md` to commit that APK and release record into the team repository and publish the authorized release tag. Record the hosted source SHA/run/candidate/final checksums in the release record. Do not silently rebuild locally for publication after validating a hosted artifact. Existing installed stable data and signing upgrade continuity are preserved by the unchanged app ID and pinned certificate.

## Validation and failures

Missing credentials, malformed key data, wrong passwords, wrong stable certificate, unexpected package/version/debug flag, source/run mismatch or altered assets/payload fail before final artifact upload. Failed frontend tests prevent candidate creation and the signing job. Signing failures report a generic safe annotation, so inspect the environment secret names and your local values privately; never enable shell tracing or print credential-bearing tool output.

Static workflow validation uses real `actionlint` (expression contexts included), Bash/Python syntax and fixtures for missing credentials, source/version/run mismatch, certificate mismatch, altered assets and cleanup. Real hosted stable signing remains unverified until you provision the protected environment/secrets and complete an approved successful run. Fork/environment protection, cancellation and account billing/storage settings still need maintainer evidence. The proven secret-free verification workflow remains the normal PR pipeline; future signing runs never consume its artifacts or caches. For local fallback, retain the existing stable release Docker script and the team's signing/release procedure.

Official tool references: [apksigner and environment password inputs](https://developer.android.com/tools/apksigner), [immutable artifact-ID download](https://github.com/actions/download-artifact), and [GitHub workflow contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts). `download-artifact` is pinned to official [v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2); checkout/setup-node/setup-java/upload-artifact reuse the reviewed exact pins in the verification workflow.
