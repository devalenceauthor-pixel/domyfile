# DoMyFile server fallback plane

This Worker and Container are only for `PDF-01` Compress PDF, `VID-01`
Compress Video, `DOC-04` DOCX to PDF, and `DOC-05` PDF to DOCX in the current
public release. The `IMG-12` Remove Background implementation remains in the
source and release inventory, but is held and must not receive public traffic
until its separate native release gate is complete. Existing browser tools do
not use this plane.

## Flow

```text
Worker gateway → private R2 input → Queue → isolated Container
→ allowlisted native/model engine → private R2 output → short-lived download → cleanup
```

The queue carries an opaque job ID and allowlisted options, never file bytes.
The container runs as a non-root user with a pinned image and fixed engine
commands. The Worker validates declared size, MIME, magic bytes, output size,
output magic, and the engine result before returning a download.

## Deployment prerequisites

1. Create the private R2 bucket named by `TEMP_FILES` and configure a lifecycle
   expiration for the `jobs/` prefix as a backstop (one day or less is
   appropriate for the 15-minute application TTL).
2. Create the job, dead-letter, and cleanup Queues named in
   `wrangler.jsonc`.
3. Set `GATEWAY_PUBLIC_URL` to the deployed Worker URL and set the secret
   `INTERNAL_HMAC_SECRET`. Do not use the placeholder URL in production.
4. Retain the exact container source archives, hashes, license texts, and
   corresponding-source records with the release artifact.
5. Complete the LibreOffice/Debian package and bundled-font notice review,
   together with commercial codec/patent review for the H.264 input capability,
   before public production traffic is enabled.

The R2 bucket must not be public and no `r2.dev` URL is used for job objects.

## Cleanup and privacy

Input objects are removed after a validated successful job. Output objects are
removed after download; failure, cancellation, expiry, and queue cleanup paths
delete both objects and purge non-content job state. The R2 lifecycle rule is a
backstop for crashes or delayed queue delivery.

The Worker/container code does not log filenames, file bytes, extracted text,
frames, object content, native command output, or private metadata. Uploaded
content is not sent to analytics, training, profiling, or third-party
conversion services. DOCX to PDF uses the pinned headless LibreOffice Writer
profile. PDF to DOCX uses LibreOffice PDF import, requires selectable text, and
does not run OCR or promise exact recovery of positioned layout. Remove
Background uses the pinned BiRefNet-lite ONNX checkpoint and CPU ONNX Runtime;
the selected image is not sent to a third-party API.

Engine details and benchmark evidence are in:

- `reports/background-removal-native-release-gate.md`
- `reports/pdf-compression-server.md`
- `reports/video-compression-server.md`
- `server/fallback-worker/container/LICENSE-STATUS.md`
