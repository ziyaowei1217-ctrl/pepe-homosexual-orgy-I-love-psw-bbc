# syntax=docker/dockerfile:1.7

# Disposable development/CI S3 fixtures. The former Docker Hub images and
# official Quay tags no longer permit anonymous pulls. Build the official
# source commits instead; this image is never used by the hosted API service.
FROM golang:1.26.10-alpine3.24@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS toolchain
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org

FROM toolchain AS minio-build
WORKDIR /src/minio
# Official Security/CVE RELEASE.2025-10-15T17-29-55Z.
ADD --checksum=sha256:45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841 https://codeload.github.com/minio/minio/tar.gz/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a /tmp/minio.tar.gz
RUN tar -xzf /tmp/minio.tar.gz --strip-components=1 && mkdir -p /out && \
    go build -mod=readonly -trimpath -ldflags="-s -w -buildid=" -o /out/minio .

FROM toolchain AS mc-build
WORKDIR /src/mc
# Official RELEASE.2025-08-13T08-35-41Z (annotated tag resolved to its commit).
ADD --checksum=sha256:95cd293c7119f16921a6dc515a1fb74a2227f19fd994b9c8b770a154e802ac44 https://codeload.github.com/minio/mc/tar.gz/7394ce0dd2a80935aded936b09fa12cbb3cb8096 /tmp/mc.tar.gz
RUN tar -xzf /tmp/mc.tar.gz --strip-components=1 && mkdir -p /out && \
    go build -mod=readonly -trimpath -ldflags="-s -w -buildid=" -o /out/mc .

FROM alpine:3.24@sha256:71e9b7bae160ba167fa17414401b94cbcdaf3c32feeab9298bd794a2a0614c35 AS runtime
COPY --from=toolchain /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN addgroup -S -g 10001 storage && \
    adduser -S -D -u 10001 -G storage -h /home/storage storage && \
    mkdir /data && chown storage:storage /data
ENV HOME=/home/storage MINIO_UPDATE=off
WORKDIR /home/storage
USER 10001:10001

FROM runtime AS minio
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" \
      org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z"
COPY --from=minio-build /out/minio /usr/local/bin/minio
COPY --from=minio-build /src/minio/LICENSE /licenses/minio.LICENSE
EXPOSE 9000 9001
ENTRYPOINT ["minio"]

FROM runtime AS mc
LABEL org.opencontainers.image.source="https://github.com/minio/mc" \
      org.opencontainers.image.revision="7394ce0dd2a80935aded936b09fa12cbb3cb8096" \
      org.opencontainers.image.version="RELEASE.2025-08-13T08-35-41Z"
COPY --from=mc-build /out/mc /usr/local/bin/mc
COPY --from=mc-build /src/mc/LICENSE /licenses/mc.LICENSE
ENTRYPOINT ["mc"]
