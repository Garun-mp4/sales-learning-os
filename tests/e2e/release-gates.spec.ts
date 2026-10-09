import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const offlineManifestPath = path.resolve("dist/assets/offline-files.json");
const offlineManifest = existsSync(offlineManifestPath)
  ? (JSON.parse(readFileSync(offlineManifestPath, "utf8")) as {
      resources: Array<{ url: string }>;
    })
  : null;

test("Production homepage avoids the React and full-search runtimes", async ({
  page,
}) => {
  test.skip(!offlineManifest, "Production asset manifest is not built");
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  await page.goto("/");
  await expect(page.locator(".stat-grid [data-global-theory]")).toHaveText(
    "0 / 336",
  );
  await expect(page.locator(".stat-grid [data-global-practice]")).toHaveText(
    "0 / 72",
  );
  await expect(
    page.locator(".stat-grid [data-global-progress]"),
  ).toHaveAttribute("aria-valuenow", "0");
  await expect
    .poll(() =>
      requests.some((url) => url.endsWith("/assets/client-index.json")),
    )
    .toBe(true);
  expect(
    requests.some((url) => url.endsWith("/assets/search-index.json")),
  ).toBe(false);
  expect(
    requests.filter((url) =>
      /\/_astro\/(?:client|react|ProgressWidget)\.[^/]+\.js$/.test(url),
    ),
  ).toEqual([]);
  const description = page.locator('meta[name="description"]');
  await expect(description).toHaveAttribute("content", /336 уроков/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Обзор · Sales OS",
  );
  const loadMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const sameOriginResources = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.startsWith(location.origin));
    return {
      transferBytes:
        (navigation?.transferSize || 0) +
        sameOriginResources.reduce(
          (total, entry) =>
            total + (entry as PerformanceResourceTiming).transferSize,
          0,
        ),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
      loadEventMs: Math.round(navigation?.loadEventEnd || 0),
    };
  });
  console.log(
    `[M8] Homepage local-preview transfer=${loadMetrics.transferBytes} bytes; DOMContentLoaded=${loadMetrics.domContentLoadedMs}ms; load=${loadMetrics.loadEventMs}ms`,
  );
});

test("Every generated production route responds and has one primary heading", async ({
  page,
}) => {
  test.skip(!offlineManifest, "Production asset manifest is not built");
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(
    !pagefind.ok(),
    "Route sweep runs against the built production output",
  );
  const routes = [
    ...new Set(
      offlineManifest!.resources
        .map(({ url }) =>
          url === "404.html"
            ? "/404.html"
            : url.startsWith("/")
              ? url
              : `/${url}`,
        )
        .filter(
          (url) => url === "/" || url.endsWith("/") || url === "/404.html",
        ),
    ),
  ];
  expect(routes.length).toBeGreaterThan(450);
  const failures: string[] = [];
  const batchSize = 16;
  for (let offset = 0; offset < routes.length; offset += batchSize) {
    const batch = routes.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (route) => {
        const response = await page.request.get(route);
        if (response.status() !== 200)
          return `${route}: HTTP ${response.status()}`;
        const markup = await response.text();
        const headings = markup.match(/<h1\b/gi)?.length ?? 0;
        if (headings !== 1) return `${route}: ${headings} h1 elements`;
        return null;
      }),
    );
    failures.push(
      ...results.filter((failure): failure is string => failure !== null),
    );
  }
  expect(failures, `${routes.length} generated routes`).toEqual([]);
});

test("Utility routes stay out of public indexing", async ({ page }) => {
  for (const route of ["/settings/", "/bookmarks/", "/review/", "/search/"]) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

test("Public routes have production canonical and matching Open Graph URLs", async ({
  page,
}) => {
  const siteUrl = process.env.SITE_URL || "https://sl-os.vercel.app";
  for (const route of [
    "/",
    "/roadmap/",
    "/lesson/01-001/",
    "/final-project/",
  ]) {
    await page.goto(route);
    const canonical = new URL(route, siteUrl).href;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonical,
    );
  }
});

test("Core routes reflow at 200 percent zoom equivalent without horizontal overflow", async ({
  page,
}) => {
  test.skip(!offlineManifest, "Requires a built preview");
  for (const route of ["/", "/practice/01-P01/", "/review/", "/settings/"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route);
    await page.setViewportSize({ width: 640, height: 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.document,
      `${route} at 200% reflow width`,
    ).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});
