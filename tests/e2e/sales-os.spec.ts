import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __backupBlob?: Blob;
    __downloadName?: string;
    __importStarted?: boolean;
  }
}
test("Roadmap shows exactly 22 modules", async ({ page }) => {
  await page.goto("/roadmap/");
  await expect(page.locator("a.card")).toHaveCount(22);
});
test("Module isolation and direct lesson navigation", async ({ page }) => {
  await page.goto("/module/01-MODULE/");
  await expect(page.locator(".pagehead h1")).toContainText("Природа");
  await expect(page.locator(".stack > a.item").first()).toHaveAttribute(
    "href",
    /01-/,
  );
  await page.goto("/lesson/01-001/");
  await expect(page.locator("article.article")).toContainText(
    "Обмен ценностью",
  );
});
test("Theme, progress and notes persist", async ({ page }) => {
  await page.goto("/lesson/01-001/");
  await page.locator("[data-theme-select]").first().selectOption("dark");
  await page.locator("[data-status-control]").selectOption("theory_completed");
  await page.locator("textarea[data-note]").fill("Проверочная запись");
  await page.waitForTimeout(650);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-status-control]")).toHaveValue(
    "theory_completed",
  );
  await expect(page.locator("textarea[data-note]")).toHaveValue(
    "Проверочная запись",
  );
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
  const overview = page.locator('#side-navigation a[href="/"]');
  const roadmap = page.locator('#side-navigation a[href="/roadmap/"]');
  const practice = page.locator('#side-navigation a[href="/practice/"]');

  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
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
    "Введите слово или фразу для поиска",
  );
  expect(pageErrors).toEqual([]);
  await page.locator("[data-search-input]").fill("zzzz-sales-os-no-match");
  await expect(page.locator("[data-search-status]")).toContainText(
    "Совпадений не найдено.",
  );
  await expect(results.locator('[role="alert"]')).toHaveCount(0);
});
test("Search shows real documents", async ({ page }) => {
  await page.goto("/search/?q=возражения");
  await expect(page.locator("[data-search-results] a").first()).toBeVisible();
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
  await expect(bookmarks.locator("[data-bookmark-status]")).toHaveText(
    "Пока нет закладок.",
  );
  await expect(bookmarks.locator("[data-bookmark-list] a.item")).toHaveCount(
    0,
  );
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
    page.locator("[data-status-control]").selectOption("theory_completed"),
    second.locator("[data-status-control]").selectOption("completed"),
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
  await expect(second.locator("[data-status-control]")).toHaveValue(
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
  await expect(second.locator("[data-status-control]")).toHaveValue("mastered");
});

test("An IndexedDB v1 text note is upgraded without losing its content", async ({
  page,
}) => {
  await page.goto("/assets/favicon.svg");
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

  await page.locator("[data-status-control]").selectOption("theory_completed");
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
  await expect(page.locator("#toast")).toContainText("Импорт не удался");
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

  await page.locator("[data-status-control]").selectOption("theory_completed");
  await expect(page.locator("#toast")).toContainText("временной памяти");
  await expect(page.locator("#storage-warning")).toContainText(
    "не сохранён надёжно",
  );
  await expect(page.locator("[data-status-control]")).toHaveValue(
    "theory_completed",
  );

  const persisted = await page.evaluate<{
    lessonStatuses: Record<string, string>;
  }>(
    () =>
      new Promise<{ lessonStatuses: Record<string, string> }>(
        (resolve, reject) => {
          const request = indexedDB.open("sales-os-personal", 2);
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
