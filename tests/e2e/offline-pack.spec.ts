import { expect, test, type Page } from "@playwright/test";

const testModeKey = "sales-os-m6-offline-test";

async function useShortManifest(
  page: Page,
  initial: {
    version: string;
    failPath?: string;
    failCount?: number;
    delayPath?: string;
    quotaPath?: string;
  },
) {
  await page.addInitScript(
    ({ key, config }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(config));
      const mode = JSON.parse(localStorage.getItem(key) || "{}");
      (
        window as Window & { __salesOsOfflineTest?: Record<string, unknown> }
      ).__salesOsOfflineTest = mode;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          location.href,
        );
        const headers = new Headers(
          init?.headers ||
            (input instanceof Request ? input.headers : undefined),
        );
        const mode = (
          window as Window & { __salesOsOfflineTest?: Record<string, any> }
        ).__salesOsOfflineTest!;
        if (
          url.pathname.endsWith("/assets/offline-files.json") &&
          headers.get("x-salesos-offline-install") !== "1"
        ) {
          const response = await nativeFetch(input, init);
          const original = await response.json();
          const versionedAsset = (name: string, extension: string) => {
            const resource = original.resources.find((item: { url: string }) =>
              new RegExp(
                `^assets/versioned/${name}\\.[a-f0-9]+\\.${extension}$`,
              ).test(item.url),
            );
            return resource?.url || `assets/${name}.${extension}`;
          };
          const resources = [
            "assets/offline-files.json",
            versionedAsset("app", "css"),
            versionedAsset("app", "js"),
            versionedAsset("user-store", "js"),
            versionedAsset("trainer-core", "js"),
            versionedAsset("today-core", "js"),
            versionedAsset("knowledge-core", "js"),
            versionedAsset("knowledge", "js"),
            "review/check/",
            "assets/client-index.json",
            "assets/search-index.json",
            "lesson/01-001/",
            "search/",
          ].map((resourceUrl) => ({ url: resourceUrl, bytes: 0 }));
          if (mode.quotaPath === "assets/app.css")
            mode.quotaPath = versionedAsset("app", "css");
          mode.manifestResourceCount = original.resources.length;
          localStorage.setItem(key, JSON.stringify(mode));
          return new Response(
            JSON.stringify({
              ...original,
              version: mode.version,
              estimatedBytes: 0,
              resources,
              urls: resources.map((resource) => resource.url),
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        const installRequest = headers.get("x-salesos-offline-install") === "1";
        if (
          installRequest &&
          mode.failPath &&
          url.pathname.endsWith(`/${mode.failPath}`) &&
          mode.failCount > 0
        ) {
          mode.failCount--;
          localStorage.setItem(key, JSON.stringify(mode));
          return new Response("temporary failure", { status: 503 });
        }
        if (
          installRequest &&
          mode.delayPath &&
          url.pathname.endsWith(`/${mode.delayPath}`)
        ) {
          mode.delayed = true;
          localStorage.setItem(key, JSON.stringify(mode));
          return new Promise((_, reject) => {
            if (init?.signal?.aborted)
              reject(new DOMException("Cancelled", "AbortError"));
            else
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Cancelled", "AbortError")),
                { once: true },
              );
          });
        }
        return nativeFetch(input, init);
      };
      const nativePut = Cache.prototype.put;
      Cache.prototype.put = function (
        request: RequestInfo | URL,
        response: Response,
      ) {
        const url = new URL(
          typeof request === "string"
            ? request
            : request instanceof URL
              ? request.href
              : request.url,
          location.href,
        );
        const mode = (
          window as Window & { __salesOsOfflineTest?: Record<string, any> }
        ).__salesOsOfflineTest!;
        if (
          mode.quotaPath &&
          url.pathname.endsWith(`/${mode.quotaPath}`) &&
          !mode.quotaFailed
        ) {
          mode.quotaFailed = true;
          localStorage.setItem(key, JSON.stringify(mode));
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return nativePut.call(this, request, response);
      };
    },
    { key: testModeKey, config: initial },
  );
}

test("A complete offline pack survives reload and opens lessons and private notes without network", async ({
  page,
  context,
}) => {
  await useShortManifest(page, { version: "000000000005" });
  test.setTimeout(30_000);
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
  await expect(page.locator("[data-offline-status]")).toContainText(
    "Пакет установлен",
  );
  const installed = await page.evaluate(async (key) => {
    const mode = JSON.parse(localStorage.getItem(key) || "{}");
    const keys = await caches.keys();
    const cacheName = "sales-os-offline-000000000005";
    const cache = await caches.open(cacheName);
    const marker = await cache.match(
      new URL("__sales-os-offline-ready__", location.origin).href,
    );
    return {
      total: (await cache.keys()).length - 1,
      fullManifestTotal: mode.manifestResourceCount,
      keys,
      ready: Boolean(marker),
    };
  }, testModeKey);
  expect(installed.fullManifestTotal).toBeGreaterThan(450);
  expect(installed.total).toBe(13);
  expect(installed.ready).toBe(true);
  expect(installed.keys).toContain("sales-os-offline-000000000005");

  await context.setOffline(true);
  await page.goto("/lesson/01-001/");
  await expect(page.locator("article[data-pagefind-body]")).toContainText(
    "Обмен ценностью",
  );
  await page.locator("textarea[data-note]").fill("offline-private-note-314159");
  await page.waitForTimeout(650);
  await page.goto("/search/");
  await page.locator("[data-search-input]").fill("offline-private-note-314159");
  await page.locator("[data-search-private]").check();
  await expect(page.locator(".search-private-result a")).toContainText(
    "offline-private-note-314159",
  );
  await page.goto("/review/check/");
  await page
    .locator("[data-knowledge-catalog]")
    .getByRole("button", { name: "Ценность функции", exact: true })
    .click();
  await page.locator("[data-knowledge-answer] input").first().check();
  await page.getByRole("button", { name: "Ответить и открыть разбор" }).click();
  await expect(page.locator("[data-knowledge-work]")).toContainText(
    "Проверка по ключу: правильно",
  );
  await page.reload();
  await expect(page.locator("[data-knowledge-work]")).toContainText(
    "Проверка по ключу: правильно",
  );
  expect(pageErrors).toEqual([]);
});

test("Partial offline install can retry, then a newer manifest replaces the older pack", async ({
  page,
}) => {
  await useShortManifest(page, {
    version: "000000000001",
    failPath: "lesson/01-001/",
    failCount: 1,
  });
  await page.goto("/settings/");
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "empty",
  );
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "partial",
  );
  await expect(page.locator("[data-offline-failures]")).toContainText(
    "lesson/01-001/",
  );
  const incompleteHasNoMarker = await page.evaluate(async () => {
    const cache = await caches.open("sales-os-offline-000000000001");
    return !(await cache.match(
      new URL("__sales-os-offline-ready__", location.origin).href,
    ));
  });
  expect(incompleteHasNoMarker).toBe(true);

  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await page.evaluate((key) => {
    const mode = JSON.parse(localStorage.getItem(key) || "{}");
    mode.version = "000000000002";
    localStorage.setItem(key, JSON.stringify(mode));
  }, testModeKey);
  await page.reload();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "update",
  );
  await expect(page.locator("[data-offline-status]")).toContainText(
    "Доступна новая версия",
  );
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  const remaining = await page.evaluate(() => caches.keys());
  expect(
    remaining.filter((name) => name.startsWith("sales-os-offline-")).sort(),
  ).toEqual(["sales-os-offline-000000000002"]);
});

test("Offline install cancellation preserves a resumable partial cache", async ({
  page,
}) => {
  await useShortManifest(page, {
    version: "000000000003",
    delayPath: "lesson/01-001/",
  });
  await page.goto("/settings/");
  await page.locator("[data-offline-install]").click();
  await page.waitForFunction(() =>
    Boolean(
      (window as Window & { __salesOsOfflineTest?: { delayed?: boolean } })
        .__salesOsOfflineTest?.delayed,
    ),
  );
  await page.locator("[data-offline-cancel]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "cancelled",
  );
  await expect(page.locator("[data-offline-status]")).toContainText(
    "Загрузка отменена",
  );
  const markerExists = await page.evaluate(async () => {
    const cache = await caches.open("sales-os-offline-000000000003");
    return Boolean(
      await cache.match(
        new URL("__sales-os-offline-ready__", location.origin).href,
      ),
    );
  });
  expect(markerExists).toBe(false);
});

test("Quota errors are named and do not mark a partial pack as ready", async ({
  page,
}) => {
  await useShortManifest(page, {
    version: "000000000004",
    quotaPath: "assets/app.css",
  });
  await page.goto("/settings/");
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "quota",
  );
  await expect(page.locator("[data-offline-status]")).toContainText(
    "Недостаточно места",
  );
  await expect(page.locator("[data-offline-failures]")).toContainText(
    "Недостаточно места в хранилище браузера",
  );
  const markerExists = await page.evaluate(async () => {
    const cache = await caches.open("sales-os-offline-000000000004");
    return Boolean(
      await cache.match(
        new URL("__sales-os-offline-ready__", location.origin).href,
      ),
    );
  });
  expect(markerExists).toBe(false);
});
