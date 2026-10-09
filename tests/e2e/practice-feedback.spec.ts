import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const ids = [
  "03-P01",
  "03-P03",
  "05-P03",
  "06-P01",
  "06-P02",
  "08-P02",
  "08-P03",
  "11-P01",
  "12-P03",
  "13-P02",
];
async function save(page: Page, answer: string, count: number) {
  await page.locator('[data-practice-answer="criterion-1"]').fill(answer);
  await page.locator('[data-practice-review="criterion-1"][value="2"]').check();
  await page.locator("[data-practice-save]").click();
  await expect(page.locator(".practice-attempt")).toHaveCount(count);
}

test("M1 ten guides have progressive hints, rubric explanations and honest status", async ({
  page,
}) => {
  for (const id of ids) {
    await page.goto(`/practice/${id}/`);
    await expect(page.locator("[data-guide-status]")).toContainText(
      "независимая рецензия не пройдена",
    );
    await expect(page.locator("[data-guide-hints] details")).toHaveCount(3);
    await expect(page.locator("[data-guide-example]")).toHaveCount(3);
    await expect(page.locator(".feedback-rubric dt")).toHaveCount(15);
  }
  await page.goto("/practice/06-P01/");
  const before = await page.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  const hint = page.locator("[data-guide-hints] summary").first();
  await hint.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator("[data-guide-hints] details").first(),
  ).toHaveAttribute("open", "");
  await page.locator("[data-guide-examples] > summary").click();
  await page.locator('[data-guide-example="strong"] > summary').click();
  await mkdir("docs/screenshots/m1-feedback", { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".practice-feedback").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/m1-feedback/guide-${width}.png`,
    });
  }
  const after = await page.evaluate(async () =>
    window.SalesOSUserStore.getState(),
  );
  expect(after.practiceStatuses).toEqual(before.practiceStatuses);
  expect(after.practiceAttempts).toEqual(before.practiceAttempts);
  await page.goto("/practice/01-P01/");
  await expect(page.locator("[data-guide-unavailable]")).toBeVisible();
  await expect(page.locator("[data-comparison-controls]")).toBeHidden();
  await expect(page.locator("[data-practice-form]")).toBeVisible();
});

test("M1 answer, guide, second iteration, comparison and v3 backup round trip", async ({
  page,
  browser,
}) => {
  await page.goto("/practice/06-P01/");
  await save(page, "Первый вариант без конкретного наблюдения", 1);
  await expect(page.locator("[data-comparison-status]")).toContainText(
    "одна итерация",
  );
  await page.locator("[data-guide-examples] > summary").click();
  await page.locator('[data-guide-example="strong"] > summary').click();
  await save(page, "В карточке не нашёл каталог. Уместно показать пример?", 2);
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Первый вариант",
  );
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Уместно показать",
  );
  const original = await page.evaluate(
    async () =>
      (await window.SalesOSUserStore.getState()).practiceAttempts["06-P01"],
  );
  await page.reload();
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Первый вариант",
  );
  await page.goto("/settings/");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const clean = await browser.newContext();
  const restored = await clean.newPage();
  await restored.goto(new URL("/settings/", page.url()).href);
  await restored.locator("[data-import]").setInputFiles(file!);
  await expect(restored.locator("[data-import-dialog]")).toBeVisible();
  await restored.locator("[data-import-replace]").click();
  await expect(restored.locator("#toast")).toContainText(
    "Импорт заменил локальные данные",
  );
  await restored.goto(new URL("/practice/06-P01/", page.url()).href);
  await expect(restored.locator("[data-comparison-result]")).toContainText(
    "Уместно показать",
  );
  expect(
    await restored.evaluate(
      async () =>
        (await window.SalesOSUserStore.getState()).practiceAttempts["06-P01"],
    ),
  ).toEqual(original);
  await clean.close();
});

test("M1 compares changed rubrics, empty answers and long unsafe text without mutation", async ({
  page,
  context,
}) => {
  await page.goto("/final-project/");
  const longText =
    '<img src=x onerror="alert(1)">' + "ДлинныйОтвет".repeat(600);
  await page.evaluate(async (text) => {
    await window.SalesOSUserStore.updateState((s): typeof s => ({
      ...s,
      practiceAttempts: {
        ...s.practiceAttempts,
        FINAL_PROJECT: [
          {
            id: "old",
            createdAt: 1700000000000,
            rubric: [
              {
                id: "criterion-1",
                label: "Старое условие",
                description: "Старая рубрика",
              },
            ],
            answers: { "criterion-1": "" },
            selfReview: {},
            nextStep: "",
          },
          {
            id: "new",
            createdAt: 1700000001000,
            rubric: [
              {
                id: "criterion-1",
                label: "Новое условие",
                description: "Новая рубрика",
              },
              {
                id: "criterion-2",
                label: "Новый критерий",
                description: "Добавлен",
              },
            ],
            answers: { "criterion-1": text, "criterion-2": "Новый ответ" },
            selfReview: { "criterion-1": 1 },
            nextStep: "Проверить гипотезу",
          },
        ],
      },
    }));
  }, longText);
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Рубрика изменилась",
  );
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Ответ не записан",
  );
  await expect(page.locator("[data-comparison-result] img")).toHaveCount(0);
  const original = await page.evaluate(
    async () =>
      (await window.SalesOSUserStore.getState()).practiceAttempts.FINAL_PROJECT,
  );
  await mkdir("docs/screenshots/m1-feedback", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.locator("[data-theme-trigger]").click();
    await page.locator(`[data-theme-option="${theme}"]`).click();
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
    await page.locator(".practice-comparison").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/m1-feedback/comparison-${theme}.png`,
    });
  }
  await page.locator("[data-comparison-right]").selectOption("old");
  await expect(page.locator("[data-comparison-status]")).toContainText(
    "две разные",
  );
  await page.locator("[data-comparison-right]").selectOption("new");
  const second = await context.newPage();
  await second.goto(new URL("/final-project/", page.url()).href);
  await second.evaluate(async () => {
    await window.SalesOSUserStore.updateState((s): typeof s => ({
      ...s,
      practiceAttempts: { ...s.practiceAttempts, FINAL_PROJECT: [] },
    }));
  });
  await expect(page.locator("[data-comparison-controls]")).toBeHidden();
  await expect(page.locator("[data-comparison-result]")).toBeEmpty();
  expect(original).toHaveLength(2);
  await second.close();
});

test("M1 examples and comparison work offline after complete pack installation", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await page.goto("/settings/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 150000 },
  );
  await context.setOffline(true);
  await page.goto("/practice/06-P01/");
  await page.locator("[data-guide-examples] > summary").click();
  await page.locator('[data-guide-example="strong"] > summary').click();
  await expect(
    page.locator('[data-guide-example="strong"] .feedback-answer'),
  ).toBeVisible();
  await save(page, "Офлайн первая итерация", 1);
  await save(page, "Офлайн следующая итерация", 2);
  await page.reload();
  await expect(page.locator("[data-comparison-result]")).toContainText(
    "Офлайн следующая",
  );
  await page.goto("/search/");
  await page
    .locator("[data-search-input]")
    .fill("симуляция допустимого контакта");
  await expect(
    page.locator('[data-search-results] a[href*="06-P01"]'),
  ).toBeVisible();
});
