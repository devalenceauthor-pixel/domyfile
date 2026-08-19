# Remove Background native release-gate report

**Date:** 2026-08-19
**Decision:** **HOLD**
**Scope:** `IMG-12` Remove Background server/container path only. No public
traffic was deployed.

## Final local artifact

The final locally built image is:

- tag: `domyfile/remove-background:release-gate-20260819-r5`
- local manifest digest: `sha256:1691195b8ca13578ff4bc8e5a7028717360930e965516e78de026ec72cfb2dc2`
- image size: `439,202,829` bytes (`418.86 MiB`, Docker virtual size)
- startup command: `python /app/processor.py`
- runtime user: `dmf` (`uid=10001`, non-root)
- resource class exercised locally: `2 vCPU`, `8 GiB` memory, `16 GB` disk target

The base image is Python `3.12.11-slim-bookworm` pinned by digest. The largest
layers are LibreOffice (`~378 MB`), Python/native runtime dependencies
(`~250 MB`), and the BiRefNet model (`~224 MB`). The image was not pushed.

The runtime image contains no compiler/build toolchain. `/app` and
`/opt/models` are not writable by the runtime user; only `/tmp/domyfile` is
intended as a writable workspace.

## Runtime and model pinning

- Python: `3.12.11`, pinned base digest in `container/Dockerfile`
- ONNX Runtime CPU: `1.20.1`
- BiRefNet-lite repository commit:
  `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`
- model file: `onnx/model.onnx`
- model bytes: `224,005,088`
- model SHA-256:
  `5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`
- Hugging Face Xet content identifier is recorded separately from the byte
  SHA-256 in the model-status and license notices.

Direct and resolved Python dependencies are pinned in
`server/fallback-worker/container/requirements.txt`. The final image's
`pip check` passed and its SBOM lists the pinned versions, including the ONNX
Runtime and pikepdf transitive dependency sets.

## Container smoke and quality

The actual r4/r5 container path was started with `--memory=8g --cpus=2` and its
`/health` endpoint returned `{"ok":true}`. This is a liveness endpoint; model
loading remains lazy and there is no separate model-readiness endpoint. Valid
JPG and PNG requests returned RGBA PNGs that passed image verification.
Corrupt, unsupported, oversized, and dimension-limit inputs returned typed
errors:

| Check | Result |
|---|---|
| Clean object JPG | 200, valid transparent PNG |
| Source-alpha PNG | 200, valid RGBA PNG with source alpha preserved |
| Corrupt JPG | 422 `CORRUPT_FILE` |
| Unsupported GIF | 422 `UNSUPPORTED_FORMAT` |
| Input over 40 MB | 413 `RESOURCE_LIMIT` |
| Dimension over 6000 px | 413 `RESOURCE_LIMIT` |

Deployment-class outputs were visually inspected on a checkerboard for clean
object, portrait/hair, busy photographic background, textured illustration,
and source-alpha fixtures. No large background islands or mask inversion were
observed. Hair and soft edges remain reasonable with mild edge softness in
difficult regions. The model can still retain ambiguous glow/shadow detail or
make close interleaved foreground/background decisions; this is not a
guarantee of perfect matting.

## Local lifecycle and cleanup verification

A targeted Worker test exercised the real Worker module with private in-memory
R2, Queue, Durable Object, and Container stubs. It passed 4/4 tests:

- success: input deleted after validated ready state; output deleted after
  download;
- processor failure: input and output deleted;
- simulated container timeout: normal queue failure propagated, DLQ path
  produced `SERVER_UNAVAILABLE` and deleted input;
- corrupt input: rejected before processing and source deleted;
- cancel: object deletion and container destruction invoked;
- expiry/abandoned job: input/output deleted and job state purged.

This verifies Worker cleanup logic locally, but it is not proof of Cloudflare
R2/Queue/Container behavior. The account has no deployed `domyfile-fallback`
Worker, no `domyfile-fallback-temp` R2 bucket, and no configured fallback
Queues. Container listing is denied because the account does not have the
Workers Paid/Containers entitlement. `.dev.vars` is absent and the gateway
URL remains the deployment placeholder. Consequently the real
Worker → Queue → R2 → Container lifecycle, signed access, object deletion,
expiry backstop, and failure/cancel behavior are **not staging-verified**.

## Limits and privacy

The current IMG-12 limits are:

- 40 MB input;
- 50 megapixels and 6000×6000 maximum dimensions;
- 80 MB output;
- 180 CPU seconds and 240 wall seconds;
- one active background job per container;
- 10 requests per IP per 60 seconds at the Worker;
- job queue concurrency 2 and maximum container instances 2;
- 900-second application TTL, with an R2 lifecycle backstop required at
  deployment.

The processor uses fixed tool IDs and fixed processing code; no user command
or shell argument is accepted. Local callback tests used internal tokens and
opaque job paths. Source/output data was not logged, no signed URL or secret
was logged, and the final container emitted no application logs during valid
or invalid smoke requests. The actual private R2 policy and short-lived
download must still be verified in staging.

## Performance

Measured on the actual r5 image with the 2-vCPU/8-GiB container limit and a
local callback gateway:

- container start to `/health`: `2.618 s`;
- Python import: `1.752 s` in a separate exact-image probe;
- model session initialization: `5.973 s` after import in that probe;
- first full job (clean object): `57.639 s`;
- subsequent full jobs: `45.583–79.770 s`, median `60.422 s`;
- queue wait and real R2/network time: not measured because staging resources
  are unavailable.

All five representative fixtures completed successfully within the 240-second
wall limit, but the observed CPU inference path is not a reasonable interactive
SLA. The current product should communicate a long-running server job state;
this performance remains a production-readiness concern.

## Security and image scan

Docker SBOM generation passed and confirmed the pinned Python package set. The
image has a non-root user, read-only application/model paths, no build tools,
no baked application secrets, no `@imgly` production references, and no
network-enabled native processing profile beyond the fixed callback contract.

No vulnerability conclusion is available: Docker Scout refused to run without
Docker ID authentication, and `trivy`, `syft`, `grype`, and `cosign` are not
installed in the environment. A release-class critical/high CVE scan remains
required before production.

## License and notices

ONNX Runtime `1.20.1` is recorded as MIT. The BiRefNet-lite model card states
MIT and its repository commit, byte SHA-256, and separate Xet identifier are
recorded. The container notices now include the resolved Python dependencies
and existing FFmpeg, codec, LibreOffice, font, pikepdf/qpdf, Pillow, and pypdf
notices. The former IMG.LY/AGPL package is absent from `package.json`, the
lockfile, and the production container.

These are factual engineering notices, not legal approval. Corresponding
source retention, LibreOffice/Debian notices, and codec/patent/commercial
review remain release obligations.

## Verification run

Passed:

- actual Docker image build with model checksum verification;
- actual container health and processing smoke;
- final r5 five-fixture deployment-class benchmark and visual spot check;
- final runtime `pip check`, model hash, Python syntax check, and read-only
  path checks;
- targeted Worker lifecycle/cleanup tests: 4/4;
- targeted shared fallback client and Remove Background input-contract tests:
  8/8 total across 3 files;
- fallback Worker TypeScript check;
- project lint;
- project typecheck: 0 errors, 0 warnings, 0 hints;
- production build: 65 static pages.

Intentionally not run: PDF, Word, Upscaler, other Image, Audio, Video, full
E2E, historical SEO, and broad regression suites.

## Release decision

**HOLD.** Local implementation and container smoke are materially verified,
but production readiness is blocked by:

1. no staging Worker/Queue/private R2/Container deployment to verify the real
   lifecycle and cleanup backstop;
2. no authenticated critical/high image vulnerability scan;
3. deployment-class CPU timing commonly around one minute, without a measured
   staging network/queue SLA;
4. remaining legal/commercial review obligations for the native image stack.

The public route must not be treated as production-ready or exposed to public
production traffic until these gates are completed.
