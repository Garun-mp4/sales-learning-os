import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const themeLabels: Record<string, string> = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};

async function chooseTheme(page: Page, theme: string) {
  const label = themeLabels[theme];
  if (!label) throw new Error(`Unsupported theme: ${theme}`);
  await page.locator("[data-theme-trigger]").click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

async function selectFirstHighlightParagraph(page: Page) {
  await page
    .locator("article[data-annotation-content] p")
    .first()
    .evaluate((paragraph) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      if (!nodes.length) throw new Error("No selectable article text");
      const range = document.createRange();
      range.setStart(nodes[0], 0);
      const endNode = nodes.at(-1)!;
      range.setEnd(endNode, endNode.length);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await expect(page.locator("[data-highlight-selection-action]")).toBeEnabled();
}

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
  await selectFirstHighlightParagraph(page);
  await page.locator("[data-highlight-selection-action]").click();
  const quote = await page.locator("[data-highlight-quote]").inputValue();
  await page.locator("[data-highlight-comment]").fill("создано без сети");
  await page.locator("[data-highlight-save]").click();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);
  const highlightId = await page
    .locator("[data-highlight-items] .highlight-item")
    .getAttribute("data-highlight-id");
  expect(highlightId).toBeTruthy();
  await page.reload();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);
  await page.goto("/highlights/");
  const sourceLink = page
    .locator(`[data-highlight-id="${highlightId}"]`)
    .getByRole("link", {
      name: "Обмен ценностью: клиентская задача → решение → результат",
    });
  await expect(sourceLink).toBeVisible();
  await expect(
    page.locator(`[data-highlight-id="${highlightId}"]`),
  ).toContainText("создано без сети");
  await sourceLink.click();
  await expect(page).toHaveURL(new RegExp(`[?&]annotation=${highlightId}`));
  await expect
    .poll(() =>
      page.evaluate(() => CSS.highlights.get("sales-os-highlights")?.size || 0),
    )
    .toBeGreaterThan(0);
  expect(quote.length).toBeGreaterThan(8);

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
      await chooseTheme(page, theme);
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

test("Practice editor and revisit queue stay readable across mobile, tablet and desktop", async ({
  page,
}) => {
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(
    !pagefind.ok(),
    "Responsive screenshots are captured from production builds",
  );
  const output = path.resolve("docs/screenshots/m7-practice-data");
  await mkdir(output, { recursive: true });
  await page.goto("/practice/01-P01/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    await window.SalesOSUserStore.updateState((current) => ({
      ...current,
      revisitQueue: {
        ...current.revisitQueue,
        "01-P01": {
          entryId: "01-P01",
          scheduledAt: Date.now(),
          dueAt: Date.now() + 2 * 86400000,
          prompt:
            "Перед перечитыванием попробуйте вспомнить главное из задания.",
          recallDraft: "",
        },
      },
    }));
  });
  const widths = [320, 390, 768, 1024, 1440];
  for (const route of ["practice/01-P01", "review"]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${route}/`);
      await chooseTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      if (route === "review")
        await expect(page.locator(".revisit-card")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
        await page.screenshot({
          path: path.join(
            output,
            `${route.replaceAll("/", "-")}-${theme}-${width}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
});

test("All audited page families render across the release viewport and theme matrix", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pagefind = await page.request.get("/pagefind/pagefind.js");
  test.skip(!pagefind.ok(), "Screenshots are captured from production builds");

  const output = path.resolve("docs/screenshots/m8-release");
  await mkdir(output, { recursive: true });
  const routes = [
    ["home", "/"],
    ["roadmap", "/roadmap/"],
    ["level-2", "/level/2/"],
    ["module-01", "/module/01-MODULE/"],
    ["module-08", "/module/08-MODULE/"],
    ["lesson-01", "/lesson/01-001/"],
    ["lesson-14", "/lesson/14-003/"],
    ["practice-index", "/practice/"],
    ["practice-18", "/practice/18-P01/"],
    ["sources", "/sources/"],
    ["source-B01", "/source/B01/"],
    ["bookmarks", "/bookmarks/"],
    ["settings", "/settings/"],
    ["final-project", "/final-project/"],
    ["search", "/search/?q=возражения"],
    ["library", "/library/"],
    ["glossary", "/library/glossary/"],
    ["cases", "/library/cases/"],
    ["templates", "/library/templates/"],
    ["editorial-review", "/editorial-review/"],
    ["review", "/review/"],
  ] as const;
  const widths = [320, 390, 768, 1024, 1440];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await chooseTheme(page, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("#toast")).not.toHaveClass(/on/);
    await page.evaluate(async () => {
      await window.SalesOSUserStore.ready;
      await window.SalesOSUserStore.replaceAll(
        {
          format: "sales-os-v3",
          version: 3,
          lessonStatuses: {},
          practiceStatuses: {},
          bookmarks: [],
          practiceDrafts: {},
          practiceAttempts: {},
          revisitQueue: {},
          revisitHistory: [],
          noteMergeSources: {},
          lastExport: null,
          lastVisited: null,
          legacyImported: false,
        },
        {},
      );
    });

    for (const [name, route] of routes) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.evaluate(() => document.fonts.ready);

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
        }));
        expect(
          dimensions.document,
          `${route} ${theme} ${width}px`,
        ).toBeLessThanOrEqual(dimensions.viewport);
        await page.screenshot({
          path: path.join(output, `${name}-${theme}-${width}.png`),
          fullPage: false,
          animations: "disabled",
        });
      }
    }
  }
  expect(pageErrors).toEqual([]);
});
