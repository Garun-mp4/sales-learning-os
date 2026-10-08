# Brand assets

The original user-supplied images are `Sales OS Stepped Logo.png` and
`faviicon.png` in the project root. They remain unchanged. `npm run
prepare:brand` uses Pillow from `requirements-dev.txt` to produce the cropped,
proportion-preserving light and dark logo files, compact marks, tab favicons,
and square PWA icons under `public/assets/brand/`.

Astro, the standalone Python build, the mobile header, desktop sidebar, and the
retained `legacy-index.html` source all use those same derived files. The
legacy prototype is deliberately not included in either published build.
Offline URL manifests include the brand and font resources.

Geist Sans and Geist Mono variable WOFF2 files are bundled locally from
`geist@1.7.2`, published by Vercel from the
[official Geist repository](https://github.com/vercel/geist-font). The fonts
include Cyrillic glyphs and are covered by the SIL Open Font License; the
license text is retained at `public/assets/fonts/LICENSE.txt`. Hosting them
locally keeps the app usable offline and avoids third-party font requests.
