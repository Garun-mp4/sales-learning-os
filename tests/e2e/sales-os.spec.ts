import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

declare global {
  interface Window {
    __backupBlob?: Blob;
    __downloadName?: string;
    __importStarted?: boolean;
  }
}
type CourseIndexEntry = {
  id: string;
  module: string;
  kind: string;
  level: string;
};
const courseIndex = JSON.parse(
  readFileSync(
    new URL("../../src/generated/client-index.json", import.meta.url),
    "utf8",
  ),
) as { entries: Record<string, CourseIndexEntry> };
test("Roadmap shows exactly 22 modules", async ({ page }) => {
  await page.goto("/roadmap/");
  await expect(page.locator("a.card")).toHaveCount(22);
});
test("Module isolation and direct lesson navigation", async ({ page }) => {
  await page.goto("/module/01-MODULE/");
  await expect(page.locator(".pagehead h1")).toContainText("Природа");
  await expect(page.locator("article.module-reading")).toContainText(
    "Концептуальная основа",
  );
  await expect(
    page.locator("article.module-reading h2#порядок-изучения"),
  ).toHaveCount(0);
  await expect(page.locator(".stack > a.item").first()).toHaveAttribute(
    "href",
    /01-/,
  );
  await page.goto("/lesson/01-001/");
  await expect(page.locator("article.article")).toContainText(
    "Обмен ценностью",
  );
});
test("Learning continuation distinguishes last visited from the next core item", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-return-card]")).toBeHidden();
  await expect(page.locator("[data-program-title]")).toContainText(
    "Обмен ценностью",
  );
  await expect(page.locator("[data-continue]")).toHaveAttribute(
    "href",
    "/lesson/01-001/",
  );

  await page.goto("/practice/22-P01/");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.SalesOSUserStore.getState()).lastVisited,
      ),
    )
    .toBe("22-P01");
  await page.goto("/");
  await expect(page.locator("[data-return-card]")).toBeVisible();
  await expect(page.locator("[data-return]")).toHaveAttribute(
    "href",
    "/practice/22-P01/",
  );
  await expect(page.locator("[data-return-title]")).toContainText("Playbook");
  await expect(page.locator("[data-continue]")).toHaveAttribute(
    "href",
    "/lesson/01-001/",
  );
});
test("Program moves from required lessons to practice and then to the next module", async ({
  page,
}) => {
  const requiredModuleLessons = Object.values(courseIndex.entries)
    .filter(
      (entry) =>
        entry.module === "01" &&
        entry.kind === "theory" &&
        entry.level === "required",
    )
    .map((entry) => entry.id);
  const requiredModulePractice = Object.values(courseIndex.entries)
    .filter(
      (entry) =>
        entry.module === "01" &&
        entry.kind === "practice" &&
        entry.level === "required",
    )
    .map((entry) => entry.id);
  await page.addInitScript((lessonIds) => {
    localStorage.setItem(
      "sales-os-v2",
      JSON.stringify({
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: Object.fromEntries(
          lessonIds.map((id) => [id, "theory_completed"]),
        ),
        practiceStatuses: {},
        bookmarks: [],
        lastVisited: null,
        legacyImported: false,
      }),
    );
  }, requiredModuleLessons);
  await page.goto("/");
  await expect(page.locator("[data-continue]")).toHaveAttribute(
    "href",
    "/practice/01-P01/",
  );
  await expect(page.locator("[data-program-description]")).toContainText(
    "упражнениями",
  );

  const nextState = {
    format: "sales-os-v2",
    version: 2,
    lessonStatuses: Object.fromEntries(
      requiredModuleLessons.map((id) => [id, "theory_completed"]),
    ),
    practiceStatuses: Object.fromEntries(
      requiredModulePractice.map((id) => [id, "self_reviewed"]),
    ),
    bookmarks: [],
    lastVisited: null,
    legacyImported: false,
  };
  await page.evaluate(async (value) => {
    await window.SalesOSUserStore.replaceAll(value, {});
  }, nextState);
  await page.reload();
  await expect(page.locator("[data-continue]")).toHaveAttribute(
    "href",
    "/lesson/02-001/",
  );

  const completeState = {
    ...nextState,
    lessonStatuses: Object.fromEntries(
      Object.values(courseIndex.entries)
        .filter(
          (entry) => entry.kind === "theory" && entry.level === "required",
        )
        .map((entry) => [entry.id, "theory_completed"]),
    ),
    practiceStatuses: Object.fromEntries(
      Object.values(courseIndex.entries)
        .filter(
          (entry) => entry.kind === "practice" && entry.level === "required",
        )
        .map((entry) => [entry.id, "self_reviewed"]),
    ),
  };
  await page.evaluate(async (value) => {
    await window.SalesOSUserStore.replaceAll(value, {});
  }, completeState);
  await page.reload();
  await expect(page.locator("[data-program-title]")).toHaveText(
    "Основной маршрут завершён",
  );
  await expect(page.locator("[data-continue]")).toHaveAttribute(
    "href",
    "/final-project/",
  );
  await page.goto("/lesson/01-012/");
  await expect(page.locator(".pagehead")).toContainText("Продвинутое изучение");
});
test("Course libraries are navigable, indexed in fallback search and copyable", async ({
  page,
}) => {
  await page.route("**/pagefind/pagefind.js", (route) => route.abort());
  await page.goto("/search/");
  await page.locator("[data-search-input]").fill("MEDDPICC");
  await expect(
    page.locator('[data-search-results] a[href="/library/glossary/"]'),
  ).toBeVisible();

  await page.goto("/library/templates/");
  await expect(page.locator("article[data-template-copy]")).toContainText(
    "Первое деловое сообщение",
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", {
      name: "Скопировать текст «Первое деловое сообщение»",
    })
    .click();
  await expect(page.locator("#toast")).toContainText("Текст скопирован");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Здравствуйте!");
});
test("Theme, progress and notes persist", async ({ page }) => {
  await page.goto("/lesson/01-001/");
  await page.locator("[data-theme-trigger]").click();
  await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
  await page
    .locator("[data-status-control]")
    .first()
    .selectOption("theory_completed");
  await page.locator("textarea[data-note]").fill("Проверочная запись");
  await page.waitForTimeout(650);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-status-control]").first()).toHaveValue(
    "theory_completed",
  );
  await expect(page.locator("textarea[data-note]")).toHaveValue(
    "Проверочная запись",
  );
});
test("Theme menu supports keyboard selection, Escape and Tab", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.locator("[data-theme-trigger]");
  const menu = page.getByRole("menu", { name: "Выбор цветовой темы" });

  await trigger.press("ArrowDown");
  await expect(menu).toBeVisible();
  const systemOption = page.getByRole("menuitemradio", { name: "Системная" });
  const lightOption = page.getByRole("menuitemradio", { name: "Светлая" });
  await expect(systemOption).toBeFocused();
  await systemOption.press("ArrowDown");
  await expect(lightOption).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(trigger).toHaveAttribute("aria-label", "Цветовая тема: Светлая");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.goto("/settings/");
  const settingsTheme = page.locator(".settings-row [data-theme-select]");
  await expect(settingsTheme).toHaveValue("light");
  await settingsTheme.selectOption("dark");
  await expect(trigger).toHaveAttribute("aria-label", "Цветовая тема: Тёмная");

  await trigger.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Тёмная" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(page.locator('a[aria-label="Настройки"]')).toBeFocused();
});
test("Mobile has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/module/08-MODULE/");
  expect(
    await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
  ).toBe(true);
  await page.locator("[data-menu-toggle]").click();
  await expect(page.locator("body")).toHaveClass(/menu-open/);
});
test("Mobile navigation behaves as a focus-managed drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice/");
  const toggle = page.locator("[data-menu-toggle]");
  const drawer = page.locator("#side-navigation");
  const background = page.locator("[data-drawer-background]");

  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  expect(
    await drawer.evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  await toggle.click();
  await expect(drawer).toHaveAttribute("role", "dialog");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  expect(
    await page
      .locator("body")
      .evaluate((element) => (element as HTMLElement).style.overflow),
  ).toBe("hidden");
  expect(
    await background.evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  expect(
    await drawer.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);

  for (let i = 0; i < 35; i++) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/menu-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    await background.evaluate((element) => (element as HTMLElement).inert),
  ).toBe(false);
  expect(
    await page
      .locator("body")
      .evaluate((element) => (element as HTMLElement).style.overflow),
  ).not.toBe("hidden");
  expect(
    await page.evaluate(
      () =>
        document.activeElement === document.querySelector("[data-menu-toggle]"),
    ),
  ).toBe(true);

  await toggle.click();
  await page.locator(".mobile-shade").click({ position: { x: 350, y: 120 } });
  await expect(page.locator("body")).not.toHaveClass(/menu-open/);
  expect(
    await page.evaluate(
      () =>
        document.activeElement === document.querySelector("[data-menu-toggle]"),
    ),
  ).toBe(true);
});
test("Desktop navigation stays keyboard reachable in route order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/practice/");
  const skip = page.locator(".skip");
  const brand = page.locator("#side-navigation .brand-lockup");
  const overview = page.locator('#side-navigation a.nav-item[href="/"]');
  const roadmap = page.locator('#side-navigation a[href="/roadmap/"]');
  const practice = page.locator('#side-navigation a[href="/practice/"]');

  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(brand).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(overview).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(roadmap).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(practice).toBeFocused();
  await expect(practice).toHaveAttribute("aria-current", "page");
});
test("Route context, breadcrumbs and final project links are clear", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  await expect(
    page.locator('#side-navigation a[aria-current="page"]'),
  ).toHaveAttribute("href", "/roadmap/");
  await expect(
    page.locator('#side-navigation a[href="/"][aria-current]'),
  ).toHaveCount(0);
  await expect(page.locator(".breadcrumb")).toHaveAttribute(
    "aria-label",
    "Хлебные крошки",
  );
  await expect(page.locator('.breadcrumb [aria-current="page"]')).toHaveText(
    "01-001",
  );
  await expect(
    page.locator('#side-navigation .nav-sub a[aria-current="location"]'),
  ).toHaveCount(1);

  await page.goto("/practice/");
  await expect(
    page.locator('#side-navigation a[aria-current="page"]'),
  ).toHaveAttribute("href", "/practice/");
  await expect(
    page.locator('.project-callout a[href="/final-project/"]'),
  ).toBeVisible();
  await page.goto("/roadmap/");
  await expect(
    page.locator('.project-callout a[href="/final-project/"]'),
  ).toBeVisible();
  await page.goto("/final-project/");
  await expect(page.locator('.breadcrumb a[href="/practice/"]')).toHaveText(
    "Практика",
  );
});
test("Tablet icon navigation exposes an accessible visible label", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/practice/");
  const practiceLink = page.locator('#side-navigation a[href="/practice/"]');
  await expect(practiceLink).toHaveAttribute("aria-label", "Практика");
  await expect(practiceLink).toHaveAttribute("aria-current", "page");
  await practiceLink.hover();
  const tooltipContent = await practiceLink.evaluate(
    (element) => getComputedStyle(element, "::after").content,
  );
  expect(tooltipContent).toBe('"Практика"');
  await expect
    .poll(() =>
      practiceLink.evaluate(
        (element) => getComputedStyle(element, "::after").opacity,
      ),
    )
    .toBe("1");
});
test("Progress is exposed with current progressbar values", async ({
  page,
}) => {
  await page.goto("/");
  const progress = page.locator('.stat-grid [role="progressbar"]');
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.evaluate(async () => {
    const index = (await fetch("/assets/client-index.json").then((r) =>
      r.json(),
    )) as { entries: Record<string, { kind: string }> };
    const ids = Object.entries(index.entries)
      .filter(([, entry]) => entry.kind === "theory")
      .slice(0, 41)
      .map(([id]) => id);
    const state = await window.SalesOSUserStore.getState();
    await window.SalesOSUserStore.replaceAll(
      {
        ...state,
        lessonStatuses: Object.fromEntries(
          ids.map((id) => [id, "theory_completed"]),
        ),
      },
      {},
    );
  });
  await expect(progress).toHaveAttribute("aria-valuenow", "10");
  await expect(progress).toHaveAttribute("aria-valuetext", "10%");
});
test("Practice filters explain and recover from an empty result", async ({
  page,
}) => {
  await page.goto("/practice/");
  const emptyPair = await page
    .locator("[data-filter-item]")
    .first()
    .evaluate(() => {
      const rows = [
        ...document.querySelectorAll<HTMLElement>("[data-filter-item]"),
      ];
      const modules = [
        ...document.querySelectorAll<HTMLSelectElement>(
          '[data-filter="module"] option',
        ),
      ]
        .map((option) => option.value)
        .filter(Boolean);
      for (const module of modules) {
        for (const level of ["required", "advanced"]) {
          if (
            !rows.some(
              (row) =>
                row.dataset.mod === module && row.dataset.level === level,
            )
          )
            return { module, level };
        }
      }
      return null;
    });
  expect(emptyPair).not.toBeNull();
  await page.locator('[data-filter="module"]').selectOption(emptyPair!.module);
  await page.locator('[data-filter="level"]').selectOption(emptyPair!.level);
  await expect(page.locator("[data-filter-count]")).toHaveText("0");
  await expect(page.locator("[data-filter-empty]")).toBeVisible();
  await page.locator("[data-filter-reset]").click();
  await expect(page.locator("[data-filter-count]")).toHaveText("72");
  await expect(page.locator("[data-filter-empty]")).toBeHidden();
});
test.describe("Direct search request recovery", () => {
  // A controlling worker bypasses page.route; offline behavior has separate real-worker coverage.
  test.use({ serviceWorkers: "block" });
  test("Search distinguishes no results from a recoverable load error", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let searchIndexRequests = 0;
    let failFirstRequest = true;
    await page.route("**/*", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/pagefind/pagefind.js")) return route.abort();
      if (pathname.endsWith("/assets/search-index.json")) {
        searchIndexRequests++;
        if (failFirstRequest) {
          failFirstRequest = false;
          return route.fulfill({ status: 503, body: "unavailable" });
        }
      }
      return route.continue();
    });
    await page.goto("/search/");
    const results = page.locator("[data-search-results]");
    await expect(results.locator('[role="alert"]')).toContainText(
      "Не удалось загрузить индекс поиска",
    );
    expect(searchIndexRequests).toBe(1);
    await results.locator("[data-search-retry]").click();
    await expect(results.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.locator("[data-search-status]")).toContainText(
      "Введите запрос, выберите фильтр",
    );
    expect(pageErrors).toEqual([]);
    await page.locator("[data-search-input]").fill("zzzz-sales-os-no-match");
    await expect(page.locator("[data-search-status]")).toContainText(
      "Совпадений в материалах нет.",
    );
    await expect(results.locator('[role="alert"]')).toHaveCount(0);
  });
});

test("Search shows real documents", async ({ page }) => {
  await page.goto("/search/?q=возражения");
  await expect(page.locator("[data-search-results] a").first()).toBeVisible();
  await expect(page).toHaveURL(/\/search\/$/);
});
test("Search filters cover modules, sources and the final project", async ({
  page,
}) => {
  await page.route("**/pagefind/pagefind.js", (route) => route.abort());
  await page.goto("/search/");
  await page.locator("[data-search-level]").selectOption("required");
  await page.locator("[data-search-module]").selectOption("01");
  await page.locator("[data-search-kind]").selectOption("practice");
  const practices = page.locator("[data-search-results] a[href*='/practice/']");
  await expect(practices.first()).toBeVisible();
  const practiceUrls = await practices.evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
  );
  expect(
    practiceUrls.every((url) => /\/practice\/01-P\d{2}\/$/.test(url || "")),
  ).toBe(true);

  await page.locator("[data-search-level]").selectOption("extra");
  await page.locator("[data-search-module]").selectOption("extra");
  await page.locator("[data-search-kind]").selectOption("final_project");
  await expect(
    page.locator("[data-search-results] a[href='/final-project/']"),
  ).toBeVisible();

  await page.locator("[data-search-kind]").selectOption("source");
  await page
    .locator("[data-search-input]")
    .fill("Sales Enablement Certification");
  await expect(
    page.locator("[data-search-results] a[href='/source/C07/']"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/search\/$/);
});
test("Personal notes and bookmarks are searchable only in the local browser", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/pagefind/pagefind.js", (route) => route.abort());
  await page.goto("/lesson/01-001/");
  await page
    .locator("textarea[data-note]")
    .fill("закрытая заметка клиента Северный маяк");
  await page.locator("[data-bookmark]").click();
  await page.waitForTimeout(650);
  await page.goto("/search/");
  await page.locator("[data-search-input]").fill("Северный маяк");
  await expect(page.locator("[data-search-results] a")).toHaveCount(0);
  await page.locator("[data-search-private]").check();
  const localResult = page.locator(".search-private-result a");
  await expect(localResult).toContainText(
    "закрытая заметка клиента Северный маяк",
  );
  await expect(page).toHaveURL(/\/search\/$/);
  expect(
    requests.some((url) => decodeURIComponent(url).includes("Северный маяк")),
  ).toBe(false);

  await page.locator("[data-search-input]").fill("Обмен ценностью");
  await expect(page.locator(".search-private-result a")).toContainText(
    "закладка",
  );
});
test("Bookmarks distinguish a recoverable index error from an empty list", async ({
  page,
}) => {
  let indexRequests = 0;
  await page.route("**/assets/client-index.json", (route) => {
    indexRequests++;
    if (indexRequests === 1)
      return route.fulfill({ status: 503, body: "unavailable" });
    return route.continue();
  });
  await page.goto("/bookmarks/");
  const bookmarks = page.locator("[data-bookmark-results]");
  const alert = bookmarks.locator('[role="alert"]');
  await expect(alert).toContainText("Не удалось загрузить закладки");
  expect(indexRequests).toBe(1);
  await alert.getByRole("button", { name: "Повторить" }).click();
  await expect(alert).toHaveCount(0);
  await expect(bookmarks.locator(".empty-state h2")).toHaveText(
    "Пока нет закладок",
  );
  await expect(bookmarks.locator("[data-bookmark-status]")).toBeHidden();
  await expect(
    bookmarks.getByRole("link", { name: "Открыть программу" }),
  ).toHaveAttribute("href", "/roadmap/");
  await expect(bookmarks.locator("[data-bookmark-list] a.item")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("[data-theme-trigger]").click();
  await page
    .getByRole("menuitemradio", { name: "Тёмная", exact: true })
    .click();
  await expect(page.locator("#toast")).not.toHaveClass(/on/);
  await page.screenshot({
    path: "docs/screenshots/visual-audit-2026-10-09/bookmarks-dark-1440.png",
    animations: "disabled",
  });
});

test("Two tabs merge independent progress and bookmark updates", async ({
  page,
}) => {
  const second = await page.context().newPage();
  await Promise.all([
    page.goto("/lesson/01-001/"),
    second.goto("/practice/01-P01/"),
  ]);
  await Promise.all([
    page
      .locator("[data-status-control]")
      .first()
      .selectOption("theory_completed"),
    second.locator("[data-status-control]").first().selectOption("completed"),
  ]);
  await Promise.all([
    page.locator("[data-bookmark]").click(),
    second.locator("[data-bookmark]").click(),
  ]);

  const expected = {
    lessonStatuses: { "01-001": "theory_completed" },
    practiceStatuses: { "01-P01": "completed" },
  };
  await expect
    .poll(() => page.evaluate(async () => window.SalesOSUserStore.getState()))
    .toMatchObject(expected);
  await expect
    .poll(() => second.evaluate(async () => window.SalesOSUserStore.getState()))
    .toMatchObject(expected);
  for (const tab of [page, second]) {
    await expect
      .poll(() => tab.evaluate(async () => window.SalesOSUserStore.getState()))
      .toMatchObject({
        bookmarks: expect.arrayContaining(["01-001", "01-P01"]),
      });
  }
  await expect(page.locator("[data-bookmark]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(second.locator("[data-bookmark]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await second.reload();
  await expect(second.locator("[data-status-control]").first()).toHaveValue(
    "completed",
  );
  await expect(second.locator("[data-bookmark]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await second.goto("/");
  const progressValues = second.locator(
    '[aria-label="Прогресс обучения"] .value',
  );
  await expect(progressValues.nth(0)).toHaveText("1 / 336");
  await expect(progressValues.nth(1)).toHaveText("1 / 72");
});

test("Concurrent edits to one note keep both versions until the user resolves them", async ({
  page,
}) => {
  const second = await page.context().newPage();
  await Promise.all([
    page.goto("/lesson/01-001/"),
    second.goto("/lesson/01-001/"),
  ]);
  await Promise.all([
    page.evaluate(async () => {
      await window.SalesOSUserStore.ready;
      await window.SalesOSUserStore.getNote("01-001");
    }),
    second.evaluate(async () => {
      await window.SalesOSUserStore.ready;
      await window.SalesOSUserStore.getNote("01-001");
    }),
  ]);
  await page.locator("textarea[data-note]").fill("Версия из первой вкладки");
  await second
    .locator("textarea[data-note]")
    .fill("Мой текст из второй вкладки");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.locator("[data-save-hint]")).toContainText(
    "Сохранено на этом устройстве",
  );
  await expect(second.locator(".note-conflict")).toBeVisible();
  await expect(second.locator("textarea[data-note]")).toHaveValue(
    "Мой текст из второй вкладки",
  );

  await second
    .getByRole("button", { name: "Сохранить мой текст вместо этой версии" })
    .click();
  await expect(second.locator("[data-save-hint]")).toContainText(
    "Сохранено на этом устройстве",
  );
  await expect(page.locator("textarea[data-note]")).toHaveValue(
    "Мой текст из второй вкладки",
  );
});

test("A stale localStorage note cannot replace the newer IndexedDB record", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    await window.SalesOSUserStore.replaceAll(
      {
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: { "01-001": "mastered" },
        practiceStatuses: {},
        bookmarks: [],
        lastVisited: null,
        legacyImported: false,
      },
      { "01-001": "Актуальная запись IndexedDB" },
    );
    localStorage.setItem(
      "sales-os-v2",
      JSON.stringify({
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: {},
        practiceStatuses: {},
        bookmarks: [],
        lastVisited: null,
      }),
    );
    localStorage.setItem("sales-os-note-01-001", "Устаревшая копия");
  });

  const second = await page.context().newPage();
  await second.goto("/lesson/01-001/");
  await expect(second.locator("textarea[data-note]")).toHaveValue(
    "Актуальная запись IndexedDB",
  );
  await expect(second.locator("[data-status-control]").first()).toHaveValue(
    "mastered",
  );
});

test("An IndexedDB v1 text note is upgraded without losing its content", async ({
  page,
}) => {
  await page.goto("/assets/brand/favicon-light.png");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("sales-os-personal", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("notes");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("notes", "readwrite");
          transaction.objectStore("notes").put("Старая заметка IDB", "01-001");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
  );

  await page.goto("/lesson/01-001/");
  await expect(page.locator('textarea[data-note="01-001"]')).toHaveValue(
    "Старая заметка IDB",
  );
  const note = await page.evaluate(() =>
    window.SalesOSUserStore.getNote("01-001"),
  );
  expect(note.record.text).toBe("Старая заметка IDB");
  expect(note.record.revision).toBe(0);
});

test("The new brand assets and bundled Cyrillic fonts are served locally", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const assets = await page.evaluate(async () => {
    const urls = [
      "/assets/brand/logo-light.png",
      "/assets/brand/logo-dark.png",
      "/assets/brand/favicon-light.png",
      "/assets/brand/favicon-dark.png",
      "/assets/fonts/Geist-Variable.woff2",
      "/assets/fonts/GeistMono-Variable.woff2",
    ];
    return Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url);
        return { url, ok: response.ok };
      }),
    );
  });
  expect(assets.filter((asset) => !asset.ok)).toEqual([]);
  const favicon = async () =>
    page.evaluate(async () => {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      const media = dark
        ? "(prefers-color-scheme: dark)"
        : "(prefers-color-scheme: light)";
      const link = document.querySelector<HTMLLinkElement>(
        `link[rel="icon"][media="${media}"]`,
      );
      if (!link) throw new Error(`Missing ${media} favicon`);
      const image = new Image();
      image.src = link.href;
      await image.decode();
      return { href: link.getAttribute("href"), width: image.naturalWidth };
    });
  expect(await favicon()).toEqual({
    href: "/assets/brand/favicon-light.png",
    width: 32,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await favicon()).toEqual({
    href: "/assets/brand/favicon-dark.png",
    width: 32,
  });
  await page.evaluate(async () => {
    await document.fonts.load('400 16px "Geist"', "Продажи, Ёж");
    await document.fonts.load('400 16px "Geist Mono"', "Сделка, Ёж");
  });
  expect(
    await page.evaluate(() =>
      document.fonts.check('400 16px "Geist"', "Продажи, Ёж"),
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".side-top .brand-logo-light")
      .evaluate((image) => (image as HTMLImageElement).naturalWidth > 0),
  ).toBe(true);
  await expect(
    page.locator('.topbar a[href="/settings/"] .icon'),
  ).toHaveAttribute("data-icon", "settings");
  await expect(
    page.locator('.topbar a[href="/settings/"] .icon circle'),
  ).toHaveAttribute("cx", "12");
  await page.locator("[data-theme-trigger]").click();
  await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
  await expect(page.locator("[data-theme-color]")).toHaveAttribute(
    "content",
    "#000000",
  );
  await expect(
    page.locator(":root[data-theme='dark'] .side-top .brand-logo-dark"),
  ).toBeVisible();
});

test("Blocked storage remains readable and makes the temporary-save limitation explicit", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) =>
    pageErrors.push(error.stack ?? error.message),
  );
  await page.addInitScript(() => {
    const browserToolsStorage = {
      getItem(key: string) {
        if (key.startsWith("astro:")) return null;
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      setItem(key: string, _value: string) {
        if (key.startsWith("astro:")) return;
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      removeItem(key: string) {
        if (key.startsWith("astro:")) return;
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      key() {
        return null;
      },
      get length() {
        return 0;
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => browserToolsStorage,
    });
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("IndexedDB is blocked", "SecurityError");
      },
    });
  });
  await page.goto("/lesson/01-001/");
  await expect(page.locator("#storage-warning")).toContainText(
    "в этой вкладке",
  );

  await page
    .locator("[data-status-control]")
    .first()
    .selectOption("theory_completed");
  await expect(page.locator("#toast")).toContainText("временной памяти");
  await page.locator("textarea[data-note]").fill("Ответ для резервной копии");
  await expect(page.locator(".note-recovery")).toBeVisible();
  await expect(page.locator("textarea[data-note]")).toHaveValue(
    "Ответ для резервной копии",
  );

  await page.evaluate(() => {
    URL.createObjectURL = (blob) => {
      if (!(blob instanceof Blob))
        throw new TypeError("Expected a Blob backup");
      window.__backupBlob = blob;
      return "blob:sales-os-test";
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      window.__downloadName = this.download;
    };
  });
  await page.locator(".note-recovery button").click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__backupBlob)))
    .toBe(true);
  const backup = await page.evaluate(async () =>
    JSON.parse(await window.__backupBlob!.text()),
  );
  expect(backup.notes["01-001"]).toBe("Ответ для резервной копии");
  expect(backup.lessonStatuses["01-001"]).toBe("theory_completed");
  expect(pageErrors).toEqual([]);
});

test("A quota failure during import aborts the entire replacement", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.text === "ABORT_IMPORT_FOR_QUOTA_TEST") {
        this.transaction.abort();
        throw new DOMException("Simulated storage quota", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });
  await page.goto("/lesson/01-001/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    await window.SalesOSUserStore.replaceAll(
      {
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: { "01-001": "theory_completed" },
        practiceStatuses: {},
        bookmarks: ["01-001"],
        lastVisited: null,
      },
      { "01-001": "Предыдущая заметка" },
    );
  });
  await page.goto("/settings/");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("[data-import]").setInputFiles({
    name: "quota-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: { "01-001": "mastered" },
        practiceStatuses: {},
        bookmarks: [],
        notes: { "01-001": "ABORT_IMPORT_FOR_QUOTA_TEST" },
      }),
    ),
  });
  await page.locator("[data-import-replace]").click();
  await expect(page.locator("#toast")).toContainText(
    "Не удалось заменить данные",
  );
  const state = await page.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  const note = await page.evaluate(async () =>
    window.SalesOSUserStore.getNote("01-001"),
  );
  expect(state.lessonStatuses["01-001"]).toBe("theory_completed");
  expect(state.bookmarks).toEqual(["01-001"]);
  expect(note.record.text).toBe("Предыдущая заметка");
});

test("Closing a tab during an active import preserves the previous database", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = originalPut.call(this, value, key);
      if (value?.text === "HOLD_IMPORT_UNTIL_TAB_CLOSE") {
        const store = this;
        window.__importStarted = true;
        function keepTransactionActive() {
          const keepAliveRequest = store.get("m2-import-keepalive");
          keepAliveRequest.onsuccess = keepTransactionActive;
        }
        keepTransactionActive();
      }
      return request;
    };
  });
  await page.goto("/lesson/01-001/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    await window.SalesOSUserStore.replaceAll(
      {
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: { "01-001": "theory_completed" },
        practiceStatuses: {},
        bookmarks: ["01-001"],
        lastVisited: null,
      },
      { "01-001": "Предыдущая заметка" },
    );
  });
  await page.goto("/settings/");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("[data-import]").setInputFiles({
    name: "interrupted-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "sales-os-v2",
        version: 2,
        lessonStatuses: { "01-001": "mastered" },
        practiceStatuses: {},
        bookmarks: [],
        notes: { "01-001": "HOLD_IMPORT_UNTIL_TAB_CLOSE" },
      }),
    ),
  });
  await page.locator("[data-import-replace]").click();
  await page.waitForFunction(() => window.__importStarted === true);
  await page.close({ runBeforeUnload: false });

  const reopened = await page.context().newPage();
  await reopened.goto("/lesson/01-001/");
  const state = await reopened.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  const note = await reopened.evaluate(() =>
    window.SalesOSUserStore.getNote("01-001"),
  );
  expect(state.lessonStatuses["01-001"]).toBe("theory_completed");
  expect(state.bookmarks).toEqual(["01-001"]);
  expect(note.record.text).toBe("Предыдущая заметка");
});

test("A quota failure keeps progress temporary without changing the saved database", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.lessonStatuses?.["01-001"] === "theory_completed") {
        this.transaction.abort();
        throw new DOMException("Simulated storage quota", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sales-os-local-v2" || key === "sales-os-v2")
        throw new DOMException("Simulated storage quota", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    };
  });

  await page
    .locator("[data-status-control]")
    .first()
    .selectOption("theory_completed");
  await expect(page.locator("#toast")).toContainText("временной памяти");
  await expect(page.locator("#storage-warning")).toContainText(
    "не сохранён надёжно",
  );
  await expect(page.locator("[data-status-control]").first()).toHaveValue(
    "theory_completed",
  );

  const persisted = await page.evaluate<{
    lessonStatuses: Record<string, string>;
  }>(
    () =>
      new Promise<{ lessonStatuses: Record<string, string> }>(
        (resolve, reject) => {
          const request = indexedDB.open("sales-os-personal", 3);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction(
              "app-state",
              "readonly",
            );
            const stateRequest = transaction
              .objectStore("app-state")
              .get("current");
            stateRequest.onsuccess = () => resolve(stateRequest.result);
            stateRequest.onerror = () => reject(stateRequest.error);
          };
        },
      ),
  );
  expect(persisted.lessonStatuses["01-001"]).toBeUndefined();
});

test("Structured practice drafts, rubric self-review and iteration history survive reload and export", async ({
  page,
}) => {
  await page.goto("/practice/01-P01/");
  const form = page.locator('[data-practice-form="01-P01"]');
  await expect(form.locator("[data-practice-criterion]")).toHaveCount(5);
  await form
    .locator('[data-practice-answer="criterion-1"]')
    .fill("Путь клиента от первого согласия до передачи результата.");
  await form.locator('[data-practice-review="criterion-1"][value="2"]').check();
  await form
    .locator("[data-practice-next]")
    .fill("Проверить неопределённые этапы по следующему диалогу.");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).practiceDrafts["01-P01"]
            ?.answers["criterion-1"],
      ),
    )
    .toBe("Путь клиента от первого согласия до передачи результата.");
  await page.reload();
  await expect(
    form.locator('[data-practice-answer="criterion-1"]'),
  ).toHaveValue("Путь клиента от первого согласия до передачи результата.");
  await expect(
    form.locator('[data-practice-review="criterion-1"][value="2"]'),
  ).toBeChecked();
  await form.locator("[data-practice-save]").click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).practiceAttempts["01-P01"]
            ?.length || 0,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.locator("[data-practice-history-list] .practice-attempt"),
  ).toHaveCount(1);

  await page.goto("/settings/");
  await page.evaluate(() => {
    URL.createObjectURL = (blob) => {
      window.__backupBlob = blob as Blob;
      return "blob:m7-practice";
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      window.__downloadName = this.download;
    };
  });
  await page.locator("[data-export]").click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__backupBlob)))
    .toBe(true);
  const backup = await page.evaluate(async () =>
    JSON.parse(await window.__backupBlob!.text()),
  );
  expect(backup.format).toBe("sales-os-v9");
  expect(backup.practiceDrafts["01-P01"].answers["criterion-1"]).toContain(
    "Путь клиента",
  );
  expect(backup.practiceAttempts["01-P01"]).toHaveLength(1);
  expect(page.locator("[data-backup-last-export]")).toContainText(
    "Последний экспорт",
  );
});

test("Revisit queue saves active recall locally, supports rescheduling and completion", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  await page.locator(".revisit-schedule summary").click();
  await page.locator('[data-revisit-delay="01-001"]').selectOption("3");
  await page.locator('[data-revisit-add="01-001"]').click();
  await expect(page.locator('[data-revisit-status="01-001"]')).toContainText(
    "Добавлено в очередь",
  );
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).revisitQueue["01-001"]
            ?.dueAt || 0,
      ),
    )
    .toBeGreaterThan(Date.now());

  await page.goto("/review/");
  const card = page.locator(".revisit-card");
  await expect(card).toContainText("Обмен ценностью");
  await card
    .locator("textarea[data-recall-id]")
    .fill("Ценность для клиента важнее описания технологии.");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).revisitQueue["01-001"]
            ?.recallDraft || "",
      ),
    )
    .toContain("Ценность для клиента");
  await card.locator("[data-review-delay]").selectOption("7");
  await card.locator("[data-review-reschedule]").click();
  await expect(page.locator("[data-review-upcoming-group]")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).revisitQueue["01-001"]
            ?.dueAt || 0,
      ),
    )
    .toBeGreaterThan(Date.now() + 5 * 86400000);
  await card.locator("[data-review-done]").click();
  await expect(page.locator("[data-review-empty]")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.SalesOSUserStore.getState()).revisitHistory.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(page.locator("[data-review-empty]")).toBeVisible();
});

test("Concurrent practice edits preserve both draft versions", async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await second.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    Object.defineProperty(window, "setTimeout", {
      configurable: true,
      value: (handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        Reflect.apply(nativeSetTimeout, window, [
          handler,
          delay === 450 ? 10000 : delay,
          ...args,
        ]),
    });
  });
  await Promise.all([
    first.goto("/practice/01-P01/"),
    second.goto("/practice/01-P01/"),
  ]);
  const firstAnswer = first.locator('[data-practice-answer="criterion-1"]');
  const secondAnswer = second.locator('[data-practice-answer="criterion-1"]');
  await secondAnswer.fill("Черновик из второй вкладки");
  await firstAnswer.fill("Черновик из первой вкладки");
  await expect(first.locator("[data-practice-draft-status]")).toContainText(
    "Черновик сохранён",
  );
  await expect(second.locator(".practice-conflict")).toBeVisible();
  await second
    .getByRole("button", { name: "Сохранить мой вариант отдельно" })
    .click();
  await expect(second.locator("[data-practice-draft-status]")).toHaveText(
    "Оба черновика сохранены отдельно на этом устройстве",
  );
  const drafts = await second.evaluate(async () => {
    const state = await window.SalesOSUserStore.getState();
    return state.practiceDrafts["01-P01"];
  });
  expect(drafts.answers["criterion-1"]).toBe("Черновик из первой вкладки");
  const versions = drafts.versions || [];
  expect(versions).toHaveLength(1);
  expect(versions[0].answers["criterion-1"]).toBe("Черновик из второй вкладки");
  await first.close();
  await second.close();
});

test("Backup preview merges without duplicate attempts or lost notes and restores replace", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    await window.SalesOSUserStore.replaceAll(
      {
        format: "sales-os-v3",
        version: 3,
        lessonStatuses: { "01-001": "theory_completed" },
        practiceStatuses: {},
        bookmarks: ["01-001"],
        lastVisited: "01-001",
        practiceDrafts: {},
        practiceAttempts: {
          "01-P01": [
            {
              id: "attempt-stable",
              createdAt: 1000,
              rubric: [
                {
                  id: "criterion-1",
                  label: "Цель",
                  description: "Проверить цель",
                },
                {
                  id: "criterion-2",
                  label: "Результат",
                  description: "Проверить результат",
                },
                {
                  id: "criterion-3",
                  label: "Основания",
                  description: "Проверить основания",
                },
              ],
              answers: { "criterion-1": "Уникальная сохранённая итерация" },
              selfReview: {},
              nextStep: "",
            },
          ],
        },
        revisitQueue: {},
        revisitHistory: [],
      },
      { "01-001": "Локальная заметка" },
    );
  });
  await page.goto("/settings/");
  const imported = {
    format: "sales-os-v3",
    version: 3,
    lessonStatuses: { "02-001": "mastered" },
    practiceStatuses: {},
    bookmarks: ["02-001"],
    lastVisited: "02-001",
    practiceDrafts: {},
    practiceAttempts: {
      "01-P01": [
        {
          id: "attempt-stable",
          createdAt: 1000,
          rubric: [
            { id: "criterion-1", label: "Цель", description: "Проверить цель" },
            {
              id: "criterion-2",
              label: "Результат",
              description: "Проверить результат",
            },
            {
              id: "criterion-3",
              label: "Основания",
              description: "Проверить основания",
            },
          ],
          answers: { "criterion-1": "Уникальная сохранённая итерация" },
          selfReview: {},
          nextStep: "",
        },
      ],
    },
    revisitQueue: {
      "01-P01": {
        entryId: "01-P01",
        dueAt: Date.now() + 86400000,
        scheduledAt: Date.now(),
        prompt: "Вспомните главное",
        recallDraft: "",
      },
    },
    revisitHistory: [],
    noteMergeSources: {},
    notes: { "01-001": "Импортированная заметка" },
  };
  await page.locator("[data-import]").setInputFiles({
    name: "merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.locator("[data-import-dialog]")).toBeVisible();
  await expect(page.locator("[data-import-preview]")).toContainText(
    "Итерации ответов: 1",
  );
  await page.locator("[data-import-merge]").click();
  await expect(page.locator("#toast")).toContainText("Данные объединены");
  let merged = await page.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  expect(merged.lessonStatuses).toMatchObject({
    "01-001": "theory_completed",
    "02-001": "mastered",
  });
  expect(merged.bookmarks).toEqual(
    expect.arrayContaining(["01-001", "02-001"]),
  );
  expect(merged.practiceAttempts["01-P01"]).toHaveLength(1);
  expect(
    await page.evaluate(
      async () => (await window.SalesOSUserStore.getNote("01-001")).record.text,
    ),
  ).toContain("Локальная заметка");
  expect(
    await page.evaluate(
      async () => (await window.SalesOSUserStore.getNote("01-001")).record.text,
    ),
  ).toContain("Импортированная заметка");
  await expect(
    page.locator("[data-restore-points] [data-restore-id]"),
  ).toHaveCount(2);

  const replacement = {
    format: "sales-os-v3",
    version: 3,
    lessonStatuses: {},
    practiceStatuses: {},
    bookmarks: [],
    notes: {},
  };
  await page.locator("[data-import]").setInputFiles({
    name: "replace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await page.locator("[data-import-replace]").click();
  await expect(page.locator("#toast")).toContainText(
    "Импорт заменил локальные данные",
  );
  merged = await page.evaluate(async () => window.SalesOSUserStore.getState());
  expect(merged.lessonStatuses).toEqual({});
  await page.locator("[data-restore-points] [data-restore-id]").first().click();
  await page.locator("[data-restore-confirm]").click();
  await expect(page.locator("#toast")).toContainText(
    "Предыдущие данные восстановлены",
  );
  merged = await page.evaluate(async () => window.SalesOSUserStore.getState());
  expect(merged.lessonStatuses).toMatchObject({
    "01-001": "theory_completed",
    "02-001": "mastered",
  });
  expect(merged.practiceAttempts["01-P01"]).toHaveLength(1);
});
