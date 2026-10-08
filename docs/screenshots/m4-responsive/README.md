# M4 responsive screenshot matrix

Captured from the static Astro preview build on 2026-10-09: 50 real Chromium views, five representative page templates, five viewport widths, both explicit color themes. Each image uses `{template}--{theme}--{width}.png`; viewport height is 844px through 390px and 900px otherwise. The capture asserts the active theme, bundled Geist Cyrillic font, loaded brand image, successful route response, zero document-level horizontal overflow, no dev toolbar, and zero uncaught page errors.

| Template | Route | Widths |
|---|---|---|
| home | `/` | `320px`, `390px`, `768px`, `1024px`, `1440px` |
| module | `/module/01-MODULE/` | `320px`, `390px`, `768px`, `1024px`, `1440px` |
| lesson | `/lesson/01-001/` | `320px`, `390px`, `768px`, `1024px`, `1440px` |
| practice | `/practice/` | `320px`, `390px`, `768px`, `1024px`, `1440px` |
| settings | `/settings/` | `320px`, `390px`, `768px`, `1024px`, `1440px` |

Long-page content remains additionally covered by the responsive and route tests.
