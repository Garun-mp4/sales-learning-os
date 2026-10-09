import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("both status controls persist and the module resumes the unfinished lesson", async ({
  page,
}) => {
  await page.goto("/lesson/01-001/");
  const statuses = page.locator("[data-status-control]");
  await expect(statuses).toHaveCount(2);
  await statuses.last().selectOption("theory_completed");
  await expect(statuses.first()).toHaveValue("theory_completed");
  await page.reload();
  await expect(statuses.last()).toHaveValue("theory_completed");
  await page.goto("/module/01-MODULE/");
  await expect(page.locator("[data-module-continue]")).toHaveAttribute(
    "href",
    "/lesson/01-002/",
  );
  await expect(page.locator(".module-reading")).not.toContainText("Результат:");
  await page.getByRole("link", { name: "Теория", exact: true }).click();
  await expect(page).toHaveURL(/#module-theory$/);
});

test("public and private search can continue beyond sixty results without leaking the query", async ({
  page,
}) => {
  await page.goto("/search/");
  await page.locator("[data-search-kind]").selectOption("theory");
  await expect(page.locator("[data-search-results] a.item")).toHaveCount(60);
  await page.locator("[data-search-more]").click();
  await expect(page.locator("[data-search-results] a.item")).toHaveCount(120);
  await page.locator("[data-search-module]").selectOption("01");
  await expect(page.locator("[data-search-results] a.item")).toHaveCount(13);
  await expect(page.locator("[data-search-more]")).toBeHidden();
  await page.locator("[data-search-input]").fill("<img onerror=alert(1)>");
  await expect(page.locator("[data-search-status]")).toContainText(
    "Совпадений",
  );
  await expect(page).toHaveURL(/\/search\/$/);
  const records = JSON.parse(
    await readFile("src/generated/content-manifest.json", "utf8"),
  );
  const ids = Object.values(records.entries)
    .filter((e: any) => e.kind === "theory")
    .slice(0, 65)
    .map((e: any) => e.id);
  await page.goto("/settings/");
  const backup = {
    format: "sales-os-v3",
    version: 3,
    lessonStatuses: {},
    practiceStatuses: {},
    bookmarks: [],
    notes: Object.fromEntries(
      ids.map((id) => [id, "Личный уникальный черновик"]),
    ),
    practiceDrafts: {},
    practiceAttempts: {},
  };
  await page.locator("[data-import]").setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator("[data-import-replace]").click();
  await expect(page.locator("[data-import-dialog]")).not.toBeVisible();
  await page.goto("/search/");
  await page.locator("[data-search-private]").check();
  await page.locator("[data-search-input]").fill("Личный уникальный черновик");
  await expect(page.locator(".search-private-result a.item")).toHaveCount(60);
  await page.locator("[data-search-more]").click();
  await expect(page.locator(".search-private-result a.item")).toHaveCount(65);
  await expect(page).toHaveURL(/\/search\/$/);
});

test("final-project checkpoints survive export, import, reload and history restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/final-project/");
  const answers = page.locator("[data-practice-answer]");
  await expect(answers).toHaveCount(10);
  await answers.first().fill("Сегмент: мебельные мастерские");
  await answers.last().fill("Проверить гипотезу по интервью");
  await page.locator('[data-practice-review="criterion-1"][value="2"]').check();
  await page
    .locator('[data-note="FINAL_PROJECT"]')
    .fill("Прежний общий обзор проекта");
  await page.locator("[data-practice-save-top]").click();
  await expect(page.locator("[data-practice-history-count]")).toHaveText(
    "1 сохранено",
  );
  await expect(page.locator("[data-save-hint]")).toContainText("Сохранено");
  await page.reload();
  await expect(answers.first()).toHaveValue("Сегмент: мебельные мастерские");
  await expect(page.locator("[data-practice-history-count]")).toHaveText(
    "1 сохранено",
  );
  await page.goto("/search/");
  await page.locator("[data-search-private]").check();
  await page.locator("[data-search-input]").fill("мебельные мастерские");
  await expect(page.locator(".search-private-result")).toContainText(
    "От первого клиента до сделки",
  );
  await page.goto("/settings/");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const download = await downloadPromise;
  const file = await download.path();
  const backup = JSON.parse(await readFile(file!, "utf8"));
  expect(backup.practiceDrafts.FINAL_PROJECT.answers["criterion-10"]).toBe(
    "Проверить гипотезу по интервью",
  );
  expect(backup.practiceAttempts.FINAL_PROJECT).toHaveLength(1);
  expect(backup.notes.FINAL_PROJECT).toBe("Прежний общий обзор проекта");
  await page.locator("[data-import]").setInputFiles(file!);
  await page.locator("[data-import-replace]").click();
  await expect(page.locator("[data-import-dialog]")).not.toBeVisible();
  await page.goto("/final-project/");
  await expect(answers.last()).toHaveValue("Проверить гипотезу по интервью");
  await page.locator(".practice-attempt summary").click();
  await page.getByRole("button", { name: "Продолжить с этой версией" }).click();
  await expect(page.locator('[data-note="FINAL_PROJECT"]')).toHaveValue(
    "Прежний общий обзор проекта",
  );
  expect(errors).toEqual([]);
});

test("reading outline tracks Russian heading anchors", async ({ page }) => {
  await page.goto("/lesson/01-001/");
  const outline = page.locator(".reader-aside .toc a");
  const headingLink = outline
    .filter({ hasText: "Предметное объяснение" })
    .first();
  await headingLink.click();
  await expect(headingLink).toHaveAttribute("aria-current", "location");
});

for (const width of [320, 390])
  for (const theme of ["light", "dark"]) {
    test(`mobile reading tables and task navigation ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        (t) => localStorage.setItem("sales-os-theme", t),
        theme,
      );
      for (const route of ["/practice/01-P01/", "/library/glossary/"]) {
        await page.goto(route);
        const cells = page.locator("article tbody td");
        await expect(cells.first()).toBeVisible();
        expect(
          await cells.first().evaluate((e) => e.getBoundingClientRect().width),
        ).toBeGreaterThan(200);
        const widths = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        expect(widths.page).toBeLessThanOrEqual(widths.viewport);
      }
      await page.goto("/practice/01-P01/");
      await page
        .getByRole("link", { name: "Перейти к ответу", exact: true })
        .click();
      await expect(page).toHaveURL(/#workspace-01-P01$/);
      await page
        .locator("[data-practice-answer]")
        .first()
        .fill("Тестовый ответ");
      await expect(page.locator("[data-criteria-progress]")).toContainText(
        "1 из 5",
      );
      await expect(page.locator(".criterion-nav a").first()).toHaveAttribute(
        "data-filled",
        "true",
      );
    });
  }
