import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("Production Pagefind filters the shared course corpus", async ({
  page,
}) => {
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(!pagefind.ok(), "Requires an Astro production build with Pagefind");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/search/");
  await page.locator("[data-search-module]").selectOption("01");
  await page.locator("[data-search-level]").selectOption("required");
  await page.locator("[data-search-kind]").selectOption("practice");
  const practices = page.locator("[data-search-results] a[href*='/practice/']");
  await expect(practices.first()).toBeVisible();
  const practiceUrls = await practices.evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
  );
  expect(practiceUrls.length).toBeGreaterThan(0);
  expect(
    practiceUrls.every((url) => /\/practice\/01-P\d{2}\/$/.test(url || "")),
  ).toBe(true);

  await page.locator("[data-search-level]").selectOption("extra");
  await page.locator("[data-search-module]").selectOption("extra");
  await page.locator("[data-search-kind]").selectOption("source");
  const sources = page.locator("[data-search-results] a[href*='/source/']");
  await expect(sources.first()).toBeVisible();
  const sourceUrls = await sources.evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
  );
  expect(sourceUrls.length).toBeGreaterThan(0);
  expect(
    sourceUrls.every((url) => /\/source\/[A-Z]\d{2}\/$/.test(url || "")),
  ).toBe(true);

  await page.locator("[data-search-kind]").selectOption("final_project");
  await expect(
    page.locator("[data-search-results] a[href*='/final-project/']"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("The complete production pack installs and supports offline lessons and search", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(!pagefind.ok(), "Requires an Astro production build with Pagefind");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/settings/");
  await expect(page.locator("[data-offline-install]")).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    }
  });
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 150_000 },
  );
  const installed = await page.evaluate(async () => {
    const manifest = await fetch("/assets/offline-files.json").then(
      (response) => response.json(),
    );
    const cache = await caches.open(`sales-os-offline-${manifest.version}`);
    const markerResponse = await cache.match(
      new URL("__sales-os-offline-ready__", location.origin).href,
    );
    const marker = await markerResponse?.json();
    return { manifest, marker, cached: (await cache.keys()).length - 1 };
  });
  expect(installed.manifest.resources.length).toBeGreaterThan(1000);
  expect(installed.cached).toBe(installed.manifest.resources.length);
  expect(installed.marker.resourceCount).toBe(
    installed.manifest.resources.length,
  );

  await context.setOffline(true);
  await page.goto("/lesson/01-001/");
  await expect(page.locator("article[data-pagefind-body]")).toContainText(
    "Обмен ценностью",
  );
  await page
    .locator("textarea[data-note]")
    .fill("полный офлайн пакет подтверждён");
  await page.waitForTimeout(650);
  await page.goto("/search/");
  await page
    .locator("[data-search-input]")
    .fill("полный офлайн пакет подтверждён");
  await page.locator("[data-search-private]").check();
  await expect(page.locator(".search-private-result a")).toContainText(
    "полный офлайн пакет подтверждён",
  );
  await page.locator("[data-search-input]").fill("обмен ценностью");
  await expect(page.locator("[data-search-results] a").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Search and settings remain responsive in both themes", async ({
  page,
}) => {
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(
    !pagefind.ok(),
    "Screenshots are captured from production preview builds",
  );

  const output = path.resolve("docs/screenshots/m6-search-offline");
  await mkdir(output, { recursive: true });
  const widths = [320, 390, 768, 1024, 1440];

  for (const route of ["search", "settings"]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${route}/`);
      await page.locator("[data-theme-select]").first().selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("#toast")).not.toHaveClass(/on/);
      await page.evaluate(() => document.fonts.ready);

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
        await page.screenshot({
          path: path.join(output, `${route}-${theme}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
});
