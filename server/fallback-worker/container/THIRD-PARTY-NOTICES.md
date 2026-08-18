# Third-party notices

The container uses the following pinned components. The deployment artifact
must retain the upstream license texts and corresponding sources for the exact
versions installed in the image.

- FFmpeg 8.1.2 — LGPL 2.1-or-later build. Source: https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz
- libvpx 1.15.2 — BSD-3-Clause. Source: https://github.com/webmproject/libvpx/archive/refs/tags/v1.15.2.tar.gz
- libopus 1.5.2 — BSD-3-Clause. Source: https://github.com/xiph/opus/releases/tag/v1.5.2
- pikepdf 10.11.0 — MPL-2.0. Source: https://github.com/pikepdf/pikepdf/tree/v10.11.0
- qpdf — Apache-2.0 with the project’s optional Artistic-2.0 notice. It is
  distributed as the pikepdf wheel dependency and must be recorded from the
  resolved wheel metadata.
- Pillow 12.3.0 — HPND/PIL license. Source: https://github.com/python-pillow/Pillow/tree/12.3.0
- pypdf 6.16.1 — BSD-3-Clause. Source: https://github.com/py-pdf/pypdf/tree/6.16.1

The release job must copy the full license files into the final compliance
bundle. This short inventory is not a substitute for those full texts.
