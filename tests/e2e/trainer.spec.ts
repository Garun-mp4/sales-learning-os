import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile("sales-knowledge-base/trainer-scenarios.json", "utf8"),
);
const workspace = (p: Page) => p.locator("[data-trainer-workspace]");
async function send(p: Page, action: string, text = "Учебный ответ") {
  await workspace(p).locator("textarea").fill(text);
  await workspace(p).locator(`input[value="${action}"]`).check();
  await workspace(p)
    .getByRole("button", { name: "Отправить ответ и действие", exact: true })
    .click();
  await expect(p.locator("[data-trainer-notice]")).toContainText("Сохранено");
}
async function begin(p: Page, id = "price-context") {
  await p.goto(`/trainer/${id}/`);
  await workspace(p)
    .getByRole("button", { name: "Начать сценарий", exact: true })
    .click();
  await expect(workspace(p).locator("textarea")).toBeVisible();
}
test("M2 six scenarios complete, repair branches and safe refusal", async ({
  page,
}) => {
  for (const s of catalog.scenarios) {
    await begin(page, s.id);
    await send(page, "clarify", "<img src=x onerror=alert(1)>");
    await send(page, "check");
    await send(page, "confirm");
    await expect(workspace(page).locator(".trainer-summary")).toContainText(
      s.nodes.next.outcome,
    );
    await expect(workspace(page).locator("img")).toHaveCount(0);
    await expect(workspace(page).locator(".trainer-transcript li")).toHaveCount(
      3,
    );
  }
  await page.goto("/trainer/price-context/");
  await workspace(page)
    .getByRole("button", { name: "Начать сценарий", exact: true })
    .click();
  await send(page, "rush");
  await send(page, "repair");
  await send(page, "check");
  await send(page, "confirm");
  await expect(workspace(page)).toContainText("первоначальную");
});
test("M2 draft resume, single submit, compare, recover deletion and backup v4", async ({
  page,
  browser,
}) => {
  await begin(page);
  await workspace(page)
    .locator("textarea")
    .fill("Сначала уточним объём, а не цену");
  await workspace(page).locator('input[value="clarify"]').check();
  await expect(page.locator("[data-trainer-notice]")).toContainText(
    "Сохранено",
  );
  const url = page.url();
  await page.reload();
  await expect(workspace(page).locator("textarea")).toHaveValue(
    "Сначала уточним объём, а не цену",
  );
  await send(page, "clarify");
  await send(page, "check");
  await send(page, "confirm");
  await workspace(page)
    .getByRole("button", { name: "Попробовать другой подход" })
    .click();
  // Two synchronous submissions must produce one transition.
  await workspace(page).locator('input[value="decline"]').check();
  await workspace(page)
    .locator("form")
    .evaluate((form) => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  await expect(workspace(page).locator(".trainer-summary")).toBeVisible();
  await expect(workspace(page).locator(".trainer-transcript li")).toHaveCount(
    1,
  );
  await expect(
    page.locator("[data-trainer-comparison] .comparison-column"),
  ).toHaveCount(2);
  await page
    .locator("[data-trainer-history]")
    .getByRole("button", { name: "Удалить с восстановлением" })
    .first()
    .click();
  await expect(page.locator("[data-trainer-history]")).toContainText("Удалена");
  await page
    .locator("[data-trainer-history]")
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(
    page.locator("[data-trainer-comparison] .comparison-column"),
  ).toHaveCount(2);
  const original = await page.evaluate(
    async () => (await window.SalesOSUserStore.getState()).trainerSessions,
  );
  await page.goto("/settings/");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const file = await (await downloadPromise).path();
  const backup = JSON.parse(await readFile(file!, "utf8"));
  expect(backup.format).toBe("sales-os-v4");
  const clean = await browser.newContext();
  const restored = await clean.newPage();
  await restored.goto(new URL("/settings/", page.url()).href);
  await restored.locator("[data-import]").setInputFiles(file!);
  await restored.locator("[data-import-replace]").click();
  await expect(restored.locator("#toast")).toContainText("Импорт заменил");
  expect(
    await restored.evaluate(
      async () => (await window.SalesOSUserStore.getState()).trainerSessions,
    ),
  ).toEqual(original);
  await restored.goto(url);
  await expect(workspace(restored).locator(".trainer-summary")).toBeVisible();
  await clean.close();
});
test("M2 preserve old versions and reject malformed/future backups", async ({
  page,
}) => {
  await begin(page);
  const url = page.url();
  await page.evaluate(async () => {
    await window.SalesOSUserStore.updateState((state) => {
      const entries = Object.entries(state.trainerSessions);
      const [id, s] = entries[0];
      return {
        ...state,
        trainerSessions: {
          [id]: {
            ...s,
            scenarioVersion: 2,
            scenario: { ...s.scenario, version: 2 },
            draft: { text: "Старый черновик", choiceId: "" },
          },
        },
      };
    });
  });
  await page.reload();
  await expect(workspace(page)).toContainText("Сценарий обновлён");
  await expect(workspace(page)).toContainText("Старый черновик");
  await workspace(page)
    .getByRole("button", { name: "Начать новую версию" })
    .click();
  await expect(page.locator(".trainer-history-row")).toHaveCount(2);
  await page.goto("/settings/");
  const state = await page.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  for (const bad of [
    { ...state, format: "sales-os-v5", version: 5, notes: {} },
    { ...state, notes: {}, trainerSessions: { broken: { id: "broken" } } },
  ]) {
    await page.locator("[data-import]").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(page.locator("#toast")).toContainText("Файл не принят");
    await expect(page.locator("[data-import-dialog]")).not.toBeVisible();
  }
  expect(
    (await page.evaluate(async () => window.SalesOSUserStore.getState()))
      .trainerSessions,
  ).toEqual(state.trainerSessions);
  await page.goto(url);
  await expect(workspace(page)).toContainText("Старый черновик");
});
test("M2 concurrent drafts fork rather than overwrite; merge is idempotent", async ({
  page,
  context,
}) => {
  await begin(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(workspace(other).locator("textarea")).toBeVisible();
  // Freeze autosave in the first tab while the other commits its edit.
  await page.evaluate(() => {
    const native = window.setTimeout;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
      native(fn, ms === 350 ? 10000 : ms, ...args)) as typeof window.setTimeout;
  });
  await workspace(page).locator("textarea").fill("Вариант первой вкладки");
  await workspace(other).locator("textarea").fill("Вариант второй вкладки");
  await expect(other.locator("[data-trainer-notice]")).toContainText(
    "Сохранено",
  );
  await workspace(page).locator('input[value="clarify"]').check();
  await workspace(page)
    .getByRole("button", { name: "Отправить ответ и действие", exact: true })
    .click();
  await expect(page.locator("[data-trainer-notice]")).toContainText(
    "отдельной попыткой",
  );
  const saved = await page.evaluate(
    async () => (await window.SalesOSUserStore.getState()).trainerSessions,
  );
  expect(Object.keys(saved)).toHaveLength(2);
  expect(JSON.stringify(saved)).toContain("Вариант первой вкладки");
  expect(JSON.stringify(saved)).toContain("Вариант второй вкладки");
  await page.evaluate(async () => {
    const s = await window.SalesOSUserStore.getState();
    await window.SalesOSUserStore.replaceAll(s, {}, { merge: true });
    await window.SalesOSUserStore.replaceAll(s, {}, { merge: true });
  });
  expect(
    Object.keys(
      await page.evaluate(
        async () => (await window.SalesOSUserStore.getState()).trainerSessions,
      ),
    ),
  ).toHaveLength(2);
  await page.evaluate(async () => {
    const s = await window.SalesOSUserStore.getState();
    const [id, first] = Object.entries(s.trainerSessions)[0];
    const incoming = {
      ...s,
      trainerSessions: {
        [id]: {
          ...first,
          draft: { text: "Вариант из резервной копии", choiceId: "" },
        },
      },
    };
    await window.SalesOSUserStore.replaceAll(incoming, {}, { merge: true });
    await window.SalesOSUserStore.replaceAll(incoming, {}, { merge: true });
  });
  const merged = await page.evaluate(
    async () => (await window.SalesOSUserStore.getState()).trainerSessions,
  );
  expect(Object.keys(merged)).toHaveLength(3);
  expect(JSON.stringify(merged)).toContain("Вариант из резервной копии");
  const mode = await page.evaluate(async () => {
    try {
      await window.SalesOSUserStore.updateState(() => {
        throw new Error("Test validation error");
      });
    } catch {
      /* Expected atomic rejection. */
    }
    return window.SalesOSUserStore.getMode();
  });
  expect(mode).toBe("indexeddb");
  await other.close();
});

test("M2 unavailable storage offers export in place without losing the answer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage unavailable");
      },
    });
  });
  await begin(page);
  await workspace(page)
    .locator("textarea")
    .fill("Временный ответ без постоянного хранилища");
  await workspace(page).locator('input[value="clarify"]').check();
  await expect(page.locator("[data-trainer-notice]")).toContainText(
    "только в памяти",
  );
  await workspace(page)
    .getByRole("button", { name: "Сохранить и вернуться к сценариям" })
    .click();
  await expect(page).toHaveURL(/trainer\/price-context/);
  const promise = page.waitForEvent("download");
  await page
    .locator("[data-trainer-notice]")
    .getByRole("button", { name: "Скачать резервную копию" })
    .click();
  const file = await (await promise).path();
  expect(await readFile(file!, "utf8")).toContain("Временный ответ");
});

test("M2 typing during a slow autosave preserves the newest draft and focus", async ({
  page,
}) => {
  await begin(page);
  await page.evaluate(() => {
    const original = window.SalesOSUserStore.updateState;
    window.SalesOSUserStore.updateState = async (mutator) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return original(mutator);
    };
  });
  const area = workspace(page).locator("textarea");
  await area.fill("Первый черновик");
  await page.waitForTimeout(400); // Deliberately edit after the 350ms debounce, during the delayed write.
  await expect(area).toBeEnabled();
  await area.fill("Новый черновик во время сохранения");
  await expect(area).toBeFocused();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          Object.values(
            (await window.SalesOSUserStore.getState()).trainerSessions,
          )[0].draft.text,
      ),
    )
    .toBe("Новый черновик во время сохранения");
  await page.reload();
  await expect(workspace(page).locator("textarea")).toHaveValue(
    "Новый черновик во время сохранения",
  );
});
test("M2 mobile desktop and themes preserve visible controls", async ({
  page,
}) => {
  await begin(page);
  await mkdir("docs/screenshots/m2-trainer", { recursive: true });
  for (const theme of ["light", "dark"])
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.evaluate((t) => {
        localStorage.setItem("sales-os-theme", t);
      }, theme);
      await page.reload();
      await page.setViewportSize({ width, height: 900 });
      await expect(workspace(page).locator("textarea")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBeTruthy();
      if (width === 390 || width === 1440) {
        await workspace(page).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `docs/screenshots/m2-trainer/dialog-${theme}-${width}.png`,
        });
      }
    }
});
test("M2 full offline pack supports resume and finish", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto("/settings/");
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 90000 },
  );
  await begin(page, "extra-work");
  await send(page, "clarify");
  await context.setOffline(true);
  await page.reload();
  await expect(workspace(page).locator("textarea")).toBeVisible();
  await send(page, "check");
  await send(page, "confirm");
  await page.reload();
  await expect(workspace(page).locator(".trainer-summary")).toContainText(
    "Изменение вынесено",
  );
  await context.setOffline(false);
});
