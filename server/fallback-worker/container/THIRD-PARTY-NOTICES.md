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
- coloredlogs 15.0.1 — MIT. Source: https://github.com/xolox/python-coloredlogs/tree/15.0.1
- flatbuffers 25.12.19 — Apache-2.0. Source: https://github.com/google/flatbuffers/tree/v25.12.19
- humanfriendly 10.0 — MIT. Source: https://github.com/xolox/python-humanfriendly/tree/10.0
- lxml 6.1.1 — BSD-3-Clause. Source: https://github.com/lxml/lxml/tree/lxml-6.1.1
- mpmath 1.3.0 — BSD-3-Clause. Source: https://github.com/mpmath/mpmath/tree/1.3.0
- packaging 26.3 — Apache-2.0 / BSD-2-Clause. Source: https://github.com/pypa/packaging/tree/26.3
- protobuf 7.35.1 — BSD-3-Clause. Source: https://github.com/protocolbuffers/protobuf/releases/tag/v7.35.1
- sympy 1.14.0 — BSD-3-Clause. Source: https://github.com/sympy/sympy/tree/sympy-1.14.0
- LibreOffice 7.4.7-1+deb12u14 (Debian bookworm `libreoffice-core-nogui`,
  `libreoffice-writer-nogui`, and `libreoffice-draw-nogui`) — MPL-2.0 with
  additional bundled third-party notices. Source package and copyright file:
  https://packages.debian.org/bookworm/libreoffice-writer-nogui
- Liberation Fonts — SIL Open Font License 1.1. Source:
  https://github.com/liberationfonts/liberation-fonts
- DejaVu Fonts — Bitstream Vera and DejaVu font license notices. Source:
  https://dejavu-fonts.github.io/License.html
- onnxruntime 1.20.1 — MIT. Source:
  https://github.com/microsoft/onnxruntime/tree/v1.20.1
- BiRefNet-lite ONNX checkpoint — MIT according to the pinned model card;
  repository commit `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`, file SHA-256
  `5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`.
  Hugging Face Xet content identifier:
  `917a4cd3931af9b7855c779fc4627ac742ebfa29b26f06ddee70d2ca567805df`.
  Source: https://huggingface.co/onnx-community/BiRefNet_lite-ONNX

The release job must copy the full license files into the final compliance
bundle. This short inventory is not a substitute for those full texts.
