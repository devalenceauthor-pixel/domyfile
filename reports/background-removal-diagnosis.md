# Remove Background targeted diagnosis

Date: 2026-08-19

The old browser IMG.LY/ISNet path was exercised before replacement on
representative temporary fixtures. The fixtures were not added to the public
site or persisted as user data.

## Before: old browser path

| Fixture | Observed runtime | Objective signal | Visual finding |
|---|---:|---|---|
| Busy plants photo (`plants-1.jpg`, 987×1481) | 28.2 s | alpha non-zero 88.4%; border alpha pixels 3,355 | Large portions of the shelves/background remained as foreground islands; not acceptable. |
| Five-person portrait (`hair-person.jpg`, 1296×864) | 12.2 s | alpha non-zero 51.8%; border alpha pixels 582 | Basic people separation was usable, but the path did not establish reliable hair/soft-edge quality. |

The failure pattern pointed primarily to the model/mask quality, with cold
browser runtime transfer and CPU inference adding a separate speed problem.
No orientation inversion was found in the old output. Aggressive thresholding
was not attempted because the noisy mask was not a safe postprocessing-only
problem.

## Replacement diagnosis

The selected BiRefNet-lite ONNX checkpoint was evaluated with the same
pre/post contract now in `processor.py`:

1. EXIF-aware RGBA decode and input size/resource checks.
2. RGB conversion and 1024×1024 BILINEAR preprocessing.
3. ImageNet mean/std normalization and NCHW tensor layout.
4. Sigmoid of the single foreground logit plane.
5. BICUBIC alpha resize to the source dimensions.
6. Source PNG alpha multiplication, then only alpha `< 2/255` zeroing.

| Fixture | Runtime on local CPU | Alpha non-zero | Border alpha >2 | Visual finding |
|---|---:|---:|---:|---|
| Plants photo | 19.0 s | 22.18% | 467 | Foreground plants/shelves were retained without the old large background islands. |
| Five-person portrait | 29.74 s | 50.63% | 495 | All five people remained; hair edges were reasonable for this generic model. |
| Car/person photo with shadow | 14.04 s | 21.93% | 0 | Car and person separated cleanly; shadow behavior remains model-dependent. |
| Anime/illustration (`anime-girl-1.jpg`) | 17.27 s | 20.80% | not used as a pass/fail criterion | Subject separated cleanly from the busy illustration background. |
| PNG with source alpha | 30.95 s | 21.92% | not used as a pass/fail criterion | Output alpha never exceeded source alpha in the deliberately half-transparent region. |

Timings are local CPU measurements with a warm Python process after the model
session was initialized; the first plants request also included session
initialization in that process. They are not a production SLA. The container
must be benchmarked again on its actual deployment class before enabling public
traffic. PNG output can be larger than a compressed JPG input because the
result intentionally preserves RGBA pixels.

## Decision and remaining quality limits

BiRefNet-lite is a material quality improvement over the old path and avoids
using thresholding to hide model errors. The result still cannot promise
perfect translucent materials, tightly interleaved foreground/background
detail, or every strand of hair/fur. Those limitations are disclosed in the
route content and container notices. The route remains held from production
deployment until the pinned container is built and the real Worker → Queue →
Container → R2 lifecycle is exercised end-to-end.
