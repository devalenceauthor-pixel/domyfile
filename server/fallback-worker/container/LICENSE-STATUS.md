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

The FFmpeg software-license classification is not a patent or royalty
clearance. H.264 decoding is accepted as an input capability only; the output
profile is VP9/Opus WebM and does not use x264/x265. DoMyFile must complete a
separate commercial codec/patent review before enabling this image in a public
production account.

The exact corresponding source archives, configure flags, source hashes, and
license notices must be retained with the deployed image and made available
according to the applicable licenses. The image must not be replaced with a
distribution FFmpeg binary without repeating this review.
