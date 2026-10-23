# Disposable storage fixture provenance

On October 23, 2026, PR #9's first connected-release run failed before integration tests because Docker Hub denied the pinned `minio/minio` pull. Anonymous Registry V2 checks, including the advertised Bearer challenge, also denied the exact official Quay server and client tags. Changing only the registry would not establish a usable fixture.

MinIO's [community README](https://github.com/minio/minio/blob/master/README.md) describes its source-only distribution. The development/CI Compose stack therefore builds `tools/ci/storage.Dockerfile` from official immutable source commits:

| Fixture | Official release | Resolved commit | Source archive SHA-256 |
| --- | --- | --- | --- |
| Server | [Security/CVE RELEASE.2025-10-15T17-29-55Z](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) | `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` | `45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841` |
| Client | [RELEASE.2025-08-13T08-35-41Z](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z) | `7394ce0dd2a80935aded936b09fa12cbb3cb8096` | `95cd293c7119f16921a6dc515a1fb74a2227f19fd994b9c8b770a154e802ac44` |

Both source archives returned HTTP 200 and were hashed locally. Docker verifies their checksums during the build. Go uses the committed module checksums, the official public module proxy and checksum database, and the installed toolchain rather than downloading a toolchain from a source directive.

The official Docker Library manifests for `golang:1.26.10-alpine3.24` and `alpine:3.24` returned HTTP 200 with Linux amd64 and arm64 platforms. Their immutable multiarch digests are pinned in the Dockerfile. [Go's release feed](https://go.dev/dl/?mode=json) listed Go 1.26.10 as a current stable release when checked. The runtime copies the CA bundle, retains the upstream license, runs as UID/GID 10001 and disables MinIO self-updates. The small fixture context contains no application environment files or credentials.

The first cold build requires time to compile the official source. CI bounds that step to 15 minutes and the complete integration job to 40 minutes. It explicitly generates Prisma Client before direct integration execution, applies the migrations, and includes the gated schema and migration suites alongside database/storage/distributed-quota integration tests. Existing bucket privacy, message isolation and image validation tests are preserved.

These are disposable local-development and CI fixtures. The upstream community repositories are archived; this is not an endorsement of running them as a production storage service. The hosted website continues to require its separately configured private S3-compatible service. Existing local named volumes may have ownership from the former root image; preserve needed data before performing a deliberate volume ownership migration. CI starts disposable volumes and removes them after the run.

Local Docker execution was unavailable during preparation. Registry/source verification and static configuration inspection do not establish that either image built or the integration job passed. The next GitHub run must supply that evidence before the connected release is accepted.
