# ADR-009: Focused Word conversions and local background removal

**Status:** Superseded for Remove Background by ADR-011; retained as historical record
**Date:** 2026-08-19

## Context

This records the original narrow browser implementation decision for the first
Word routes and Remove Background. The later quality review in ADR-010 expanded
the Word scope, and ADR-011 replaced the Remove Background browser path after a
targeted quality/licensing review. This ADR remains a historical record of the
former implementation and its release gate.

## Decision

Ship three focused browser routes:

- DOCX to TXT with lazy Mammoth extraction;
- DOCX to HTML with lazy Mammoth semantic conversion and external file access
  disabled;
- TXT to DOCX with lazy `docx` generation using one paragraph per source line.

Ship Remove Background as a single-image browser route using the lazy
`@imgly/background-removal` runtime with the quantized ISNet model, CPU/WASM
execution, and worker proxy. The output is fixed to a validated transparent
PNG. The route shows original and checkerboard result previews, reports model
loading, and states that edge quality can vary for hair, fur, translucent
objects, shadows, and busy backgrounds.

## Alternatives rejected or deferred at the time

- DOCX to PDF and PDF to DOCX were initially deferred because reliable browser
  layout fidelity and round-trip semantics were not established by the browser
  stack. ADR-010 replaces that temporary deferral with a native fallback
  decision.
- Merge DOCX, Compress DOCX, and Metadata Cleaner were initially deferred while
  their bounded ZIP/package contracts were being implemented and fixture-tested.
- A portrait-only or larger model was not selected because the route claims
  general supported raster input and needs a practical browser baseline. A
  future model may replace ISNet only with a new quality, size, compatibility,
  and license review.
- A paid/external background-removal API and a new native service are outside
  the product boundary.

## License and release gate

The selected runtime package is AGPL-3.0. Its bundled/declared ONNX Runtime
Web dependency is MIT, and the ISNet model notice is recorded as MIT in the
runtime's third-party notice. These are distinct library/runtime/model
obligations. This ADR does not grant legal clearance: the product owner must
review AGPL compatibility and distribution obligations before production
release. If that review cannot approve the package, the route must be held or
replaced rather than shipped with an uncertain license claim.

Mammoth is BSD-2-Clause and `docx` is MIT. Exact resolved versions and package
notices are pinned in the lockfile and summarized on the Open Source page.

## Consequences

- Static category and homepage HTML remains free of parser/model payloads;
  dynamic imports load only after a user starts a relevant tool.
- Word conversion is intentionally content-focused, not layout-preserving.
- Background removal has a meaningful first-use download and CPU/memory cost;
  the UI must disclose this and clean all object URLs after reset or unload.
- New targeted fixtures cover validation, output signatures/content, filenames,
  reset/download behavior, and representative background-removal inputs. Full
  existing media/PDF/image regression suites remain out of scope for this
  change.
