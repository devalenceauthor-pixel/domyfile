# HEIC/HEIF decoder spike

Date: 2026-08-18

## Decision

Use `heic-to@1.5.2` through the shared Image Engine's HEIC adapter.

The package passed the browser spike against two existing HEIC fixtures and
three representative iPhone 12 Pro HEIC samples. It decoded each file in a
Chromium browser, preserved the decoded 3024 × 4032 portrait dimensions of the
iPhone samples (including a sample with an `irot` orientation box), and
produced a non-empty JPEG with a valid JPEG start-of-image signature. The
decoder is loaded only when the HEIC route processes a file; it is not part of
the initial route module's static imports.

## Candidate comparison

| Candidate | Version | License | Browser result | Assessment |
|---|---:|---|---|---|
| `heic-to` | 1.5.2 | LGPL-3.0 | 5/5 fixtures passed; valid JPEG output; iPhone dimensions preserved | Selected. Current upstream wrapper, worker-backed decode, explicit HEIC detection, and a small adapter surface. |
| `heic2any` | 0.0.4 | MIT | 5/5 fixtures passed; valid JPEG output; iPhone dimensions preserved | Not selected. The browser build is smaller, but the package is old and exposes a less explicit detection/maintenance surface. |
| `libheif-js` | 1.19.8 | LGPL-3.0 | 5/5 fixtures passed; valid JPEG output; iPhone dimensions preserved | Not selected. Low-level API requires DoMyFile to own more decode, canvas, cleanup, validation, and orientation integration. |
| `@jsquash/heic` | — | — | No npm package was available under that name during the spike | Not a candidate for this release. |

## Measured package cost

Measured from the published npm tarballs used in the spike:

- `heic-to@1.5.2` browser bundle: 2,996,525 bytes raw / 730,043 bytes gzip.
- `heic2any@0.0.4` browser bundle: 1,351,840 bytes raw / 338,307 bytes gzip.
- `libheif-js@1.19.8` browser bundle: 1,461,926 bytes raw / 517,657 bytes gzip.

The selected package's cost is acceptable for a route-specific, lazy-loaded
decoder. It is not loaded for standard Image, PDF, Audio, or deferred Video
routes.

## Browser fixtures and results

The reproducible harness is `scripts/heic-candidate-spike.mjs`. It runs in
Chromium and checks detection where exposed, conversion, MIME type, JPEG
signature, decoded dimensions, duration, and browser heap telemetry where the
browser exposes it.

Fixtures used:

- `1.heic` and `10.heic`, 1440 × 960 HEIC fixtures from the upstream `heic2any`
  demo.
- `greyhounds-looking-for-a-table.heic`, `classic-car.heic`, and
  `old-safe-wall.heic`, portrait iPhone 12 Pro samples published by
  [HEIC Digital](https://heic.digital/samples/), each 3024 × 4032 after decode.

All three candidates converted all five fixtures in Chromium. The selected
`heic-to` run produced `image/jpeg` blobs with JPEG SOI bytes `FF D8` and
dimensions `1440 × 960` for the landscape fixtures and `3024 × 4032` for all
three iPhone fixtures. The iPhone sample containing an `irot` box retained the
correct portrait dimensions, which covers the orientation path exercised by
the sample.

The selected upstream implementation uses one reusable worker and frees decoded
images and the decoder context after each conversion. Its worker object URL is
created once per page and is reused for sequential jobs; it is released with
the page, while DoMyFile revokes every per-job output object URL after
`Process another`. The application adapter adds
its own cancellation checks, input signature validation, output signature
validation, and browser image validation. Repeated-job coverage is included in
the HEIC E2E smoke test; the representative iPhone samples used by the spike
remain external test inputs, while the small upstream demo fixture used by the
offline E2E test is documented in `tests/fixtures/heic/README.md`.

## Compatibility and limits

- Processing is browser-only. User file bytes are passed to the local decoder;
  no upload or persistence path is introduced.
- The adapter validates an ISO-BMFF `ftyp` box and HEIC/HEIF brands rather than
  trusting a filename or browser-reported MIME type.
- Output is required to be a non-empty, decodable JPEG and retains decoded
  dimensions unless the user selects a different image operation (the HEIC
  route exposes no resize/crop operation).
- Re-encoding intentionally does not promise preservation of private HEIC
  metadata. This is consistent with the shared raster Image Engine.
- Large phone photos still require substantial browser memory while decoding.
  The route reports a clear processing error when the browser cannot complete
  the job; it does not fall back to a fake result.

## Redistribution and compliance

`heic-to@1.5.2` is published under LGPL-3.0 and bundles the libheif-based
decoder. The production output includes a versioned notice and source-offer
asset at `public/runtime/heic-to-1.5.2/`. The exact package version, upstream
source, and license are recorded there and linked from the site footer.

Primary upstream references:

- [heic-to README](https://github.com/hoppergee/heic-to/blob/main/README.md)
- [heic-to package metadata](https://github.com/hoppergee/heic-to/blob/main/package.json)
- [libheif upstream](https://github.com/strukturag/libheif)
