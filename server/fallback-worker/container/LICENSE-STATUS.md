# Native fallback engine license status

This image is intentionally built without `--enable-gpl`, without
`--enable-nonfree`, and without x264 or x265. The enabled native profile is:

| Component | Pinned version | Role | License classification |
|---|---:|---|---|
| FFmpeg | 8.1.2 | demux, probe, VP9/Opus encode | LGPL 2.1-or-later build |
| libvpx | 1.15.2 | VP9 encoder | BSD-3-Clause |
| libopus | 1.5.2 | Opus encoder | BSD-3-Clause |
| pikepdf | 10.11.0 | PDF structure/image optimization | MPL-2.0 |
| qpdf (pikepdf dependency) | pinned by pikepdf wheel | PDF serialization | Apache-2.0 / optional Artistic-2.0 notice |
| Pillow | 12.3.0 | pikepdf image bridge | HPND/PIL license |
| pypdf | 6.16.1 | independent PDF output validation | BSD-3-Clause |
| coloredlogs | 15.0.1 | ONNX Runtime logging dependency | MIT |
| flatbuffers | 25.12.19 | ONNX Runtime serialization dependency | Apache-2.0 |
| humanfriendly | 10.0 | coloredlogs dependency | MIT |
| lxml | 6.1.1 | pikepdf XML/parser dependency | BSD-3-Clause |
| mpmath | 1.3.0 | SymPy numeric dependency | BSD-3-Clause |
| packaging | 26.3 | Python dependency metadata | Apache-2.0 / BSD-2-Clause |
| protobuf | 7.35.1 | ONNX Runtime serialization dependency | BSD-3-Clause |
| sympy | 1.14.0 | ONNX Runtime symbolic math dependency | BSD-3-Clause |
| LibreOffice Writer/Draw (Debian bookworm packages) | 7.4.7-1+deb12u14 | DOCX↔PDF native conversion | MPL-2.0 plus separately inventoried bundled third-party code |
| Liberation/DejaVu fonts | Debian package versions | deterministic headless document layout fallback | SIL OFL-1.1 / bundled font notices |
| onnxruntime | 1.20.1 | CPU inference runtime for Remove Background | MIT |
| BiRefNet-lite ONNX checkpoint | repository commit `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`; file SHA-256 `5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`; Hugging Face Xet content identifier `917a4cd3931af9b7855c779fc4627ac742ebfa29b26f06ddee70d2ca567805df` | generic foreground segmentation/matting mask | MIT as stated by the pinned model card; checkpoint provenance is tracked separately |

The FFmpeg software-license classification is not a patent or royalty
clearance. H.264 decoding is accepted as an input capability only; the output
profile is VP9/Opus WebM and does not use x264/x265. DoMyFile must complete a
separate commercial codec/patent review before enabling this image in a public
production account.

The exact corresponding source archives, configure flags, source hashes, and
license notices must be retained with the deployed image and made available
according to the applicable licenses. The image must not be replaced with a
distribution FFmpeg binary without repeating this review.

LibreOffice is included only in the document-conversion profile. Its native
DOCX-to-PDF path is intended to preserve Word document pagination, text, tables,
and embedded media substantially better than a browser HTML snapshot. PDF-to-
DOCX uses LibreOffice's PDF import and is limited to PDFs with selectable text;
it does not provide OCR or guarantee exact recovery of positioned layout. The
Debian package copyright inventory and LibreOffice license text must be kept
with the release artifact. This is a software-license inventory, not a claim
that every input document's embedded font or media license is cleared.

Remove Background uses a fixed BiRefNet-lite ONNX checkpoint baked into the
container; it does not call a third-party inference API. The model is loaded
once per warm container and runs through the pinned CPU ONNX Runtime. The
checkpoint license and exact SHA are recorded independently of the runtime
license. The model produces a continuous alpha mask; the processor removes
only numerically invisible alpha values and retains soft edge coverage. This
does not guarantee perfect hair, translucent material, shadows, or tightly
interleaved foreground/background detail.
