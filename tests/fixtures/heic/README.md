# HEIC browser fixtures

`sample-1.heic` is the small HEIC fixture from the upstream `heic2any` demo,
used to keep the offline browser smoke test deterministic:

<https://github.com/alexcorvi/heic2any/tree/master/demo>

The `heic2any` project is MIT-licensed. The fixture is used only as test input;
the production decoder is `heic-to@1.5.2`, documented in
`reports/heic-decoder-spike.md` and `public/runtime/heic-to-1.5.2/`.

`synthetic.heic` is an intentionally invalid HEIF-shaped negative fixture. It
has an HEIC `ftyp` brand but no HEIF image item and is used to ensure decoder
failures stay errors rather than becoming success states.
