import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
const work = (p: Page) => p.locator("[data-today-workspace]");
async function begin(p: Page, budget = "20") {
  await p.goto("/today/");
  await work(p).getByLabel("Сколько времени есть?").selectOption(budget);
  await work(p)
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  await expect(work(p).locator(".today-plan")).toBeVisible();
}
async function current(p: Page) {
  return p.evaluate(async () => await window.SalesOSUserStore.getState());
}
test("M3 home setup, snapshot, replacement, pause, completion and no mastery", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Время занятия").selectOption("10");
  await page.getByLabel("Цель занятия").selectOption("conversation");
  await page
    .locator(".today-home-form")
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  await expect(work(page).getByLabel("Сколько времени есть?")).toHaveValue(
    "10",
  );
  await expect(
    work(page).getByLabel("Текущая цель (необязательно)"),
  ).toHaveValue("conversation");
  await work(page)
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  const before = await current(page),
    plan = Object.values(before.today.plans)[0] as any,
    first = work(page).locator("[data-today-item]").first();
  const old = await first.locator("h3").innerText();
  await first.getByRole("button", { name: "Заменить", exact: true }).click();
  await expect(first.locator("h3")).not.toHaveText(old);
  await work(page).getByRole("button", { name: "Поставить на паузу" }).click();
  await page.reload();
  await expect(work(page)).toContainText("На паузе");
  await expect(
    work(page).getByRole("button", { name: "Шаг выполнен", exact: true }),
  ).toHaveCount(0);
  await work(page)
    .getByRole("button", { name: "Продолжить занятие", exact: true })
    .click();
  await first
    .getByRole("button", { name: "Шаг выполнен", exact: true })
    .click();
  await expect(work(page).locator("[data-today-item]").first()).toContainText(
    "Выполнено",
  );
  const skips = work(page).getByRole("button", {
    name: "Пропустить",
    exact: true,
  });
  let remaining = await skips.count();
  while (remaining > 0) {
    await skips.first().click();
    remaining--;
    await expect(skips).toHaveCount(remaining);
  }
  await work(page)
    .getByRole("button", { name: "Завершить занятие", exact: true })
    .click();
  await expect(work(page)).toContainText("Результат занятия");
  await work(page)
    .getByRole("button", { name: "В самый раз", exact: true })
    .click();
  await page.reload();
  await expect(
    work(page).getByRole("button", { name: "В самый раз", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const after = await current(page);
  expect(after.lessonStatuses).toEqual(before.lessonStatuses);
  expect(after.practiceStatuses).toEqual(before.practiceStatuses);
  expect(Object.keys(after.today.plans)).toEqual([plan.id]);
});
test("M3 due queue, explicit refresh of statuses and finished course", async ({
  page,
}) => {
  await page.goto("/today/");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.updateState((s) => ({
      ...s,
      revisitQueue: {
        "01-003": {
          entryId: "01-003",
          scheduledAt: Date.now() - 10000,
          dueAt: Date.now() - 1000,
          prompt: "Вспомните",
          recallDraft: "Черновик",
        },
      },
    }));
  });
  await work(page)
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  const first = Object.values((await current(page)).today.plans)[0] as any;
  expect(first.items[0].entryId).toBe("01-003");
  await page.evaluate(async () => {
    const index = await (await fetch("/assets/client-index.json")).json();
    await window.SalesOSUserStore.updateState((s) => {
      for (const e of Object.values(index.entries) as any[]) {
        if (e.kind === "theory") s.lessonStatuses[e.id] = "mastered";
        if (e.kind === "practice") s.practiceStatuses[e.id] = "self_reviewed";
      }
      return s;
    });
  });
  await page.reload();
  expect(
    (Object.values((await current(page)).today.plans)[0] as any).items,
  ).toEqual(first.items);
  await work(page).locator("summary").click();
  await work(page)
    .getByRole("button", { name: "Создать новое занятие", exact: true })
    .click();
  await expect(work(page)).toContainText("Материал уже пройден");
  expect((await current(page)).revisitQueue["01-003"].recallDraft).toBe(
    "Черновик",
  );
});
test("M3 local midnight and timezone preserve the active snapshot", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-09T23:59:45+04:00") });
  await begin(page);
  const original = await current(page);
  await page.clock.fastForward(60000);
  await expect(work(page)).toContainText("Сменился день");
  expect((await current(page)).today.plans).toEqual(original.today.plans);
  await page.reload();
  await expect(work(page)).toContainText("Сменился день");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.updateState((s) => {
      const p = Object.values(s.today.plans)[0] as any;
      p.zone = "Pacific/Auckland";
      return s;
    });
  });
  await page.reload();
  await expect(work(page)).toContainText("часовой пояс");
});
test("M3 concurrent item completion keeps both changes and is idempotent", async ({
  page,
  context,
}) => {
  await begin(page);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(work(second).locator(".today-plan")).toBeVisible();
  const buttons = [
    work(page)
      .getByRole("button", { name: "Шаг выполнен", exact: true })
      .first(),
    work(second)
      .getByRole("button", { name: "Шаг выполнен", exact: true })
      .last(),
  ];
  await Promise.all(buttons.map((b) => b.click()));
  await page.reload();
  const p = Object.values((await current(page)).today.plans)[0] as any;
  expect(p.items.filter((i: any) => i.status === "done")).toHaveLength(2);
  expect(Object.keys((await current(page)).today.plans)).toHaveLength(1);
  await second.close();
});
test("M3 backup v5 roundtrip, v4 compatibility, malformed plans and recovery", async ({
  page,
  browser,
}) => {
  await begin(page);
  await work(page)
    .getByRole("button", { name: "Шаг выполнен", exact: true })
    .first()
    .click();
  const original = (await current(page)).today;
  await page.goto("/settings/");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const path = await (await downloadPromise).path();
  const backup = JSON.parse(await readFile(path!, "utf8"));
  expect(backup.format).toBe("sales-os-v6");
  expect(backup.today).toEqual(original);
  const ctx = await browser.newContext(),
    other = await ctx.newPage();
  await other.goto("/settings/");
  const importData = async (data: any) => {
    await other.locator("[data-import]").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  };
  await importData(backup);
  await other.locator("[data-import-replace]").click();
  await other.goto("/today/");
  await expect(work(other).locator(".today-plan")).toBeVisible();
  expect((await current(other)).today).toEqual(original);
  await other.goto("/settings/");
  const bad = structuredClone(backup);
  (Object.values(bad.today.plans)[0] as any).items[0].url =
    "javascript:alert(1)";
  await importData(bad);
  await expect(other.locator("[data-import-dialog]")).not.toBeVisible();
  expect((await current(other)).today).toEqual(original);
  const legacy = { ...backup, format: "sales-os-v4", version: 4 };
  delete legacy.today;
  delete legacy.knowledgeReview;
  await importData(legacy);
  await other.locator("[data-import-merge]").click();
  expect((await current(other)).today).toEqual(original);
  await ctx.close();
});
test("M3 responsive themes and offline reload", async ({ page, context }) => {
  test.setTimeout(120000);
  await begin(page, "40");
  await mkdir("docs/screenshots/m3-today", { recursive: true });
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 768, 1440]) {
      await page.evaluate((t) => {
        localStorage.setItem("sales-os-theme", t);
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path:
            "docs/screenshots/m3-today/plan-" + theme + "-" + width + ".png",
          fullPage: true,
        });
    }
  await page.goto("/settings/");
  await page.locator("[data-offline-install]").click();
  await expect(page.locator("[data-offline-summary]")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 90000 },
  );
  await page.goto("/today/");
  const before = (await current(page)).today;
  await context.setOffline(true);
  await page.reload();
  await expect(work(page).locator(".today-plan")).toBeVisible();
  await work(page).getByRole("button", { name: "Поставить на паузу" }).click();
  await page.reload();
  await expect(work(page)).toContainText("На паузе");
  expect(Object.keys((await current(page)).today.plans)).toEqual(
    Object.keys(before.plans),
  );
  await context.setOffline(false);
});
test("M3 temporary storage exports plan in place; invalid write preserves it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("Storage unavailable");
      },
    });
  });
  await begin(page);
  await expect(page.locator("[data-today-notice]")).toContainText(
    "только в памяти",
  );
  const before = await current(page);
  const rejected = await page.evaluate(async () => {
    try {
      await window.SalesOSUserStore.updateState((s) => {
        const p = Object.values(s.today.plans)[0] as any;
        p.items[0].minutes = [1, 1000];
        return s;
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(rejected).toBe(true);
  expect((await current(page)).today).toEqual(before.today);
  const promise = page.waitForEvent("download");
  await page
    .locator("[data-today-notice]")
    .getByRole("button", { name: "Скачать резервную копию" })
    .click();
  const file = await (await promise).path();
  const backup = JSON.parse(await readFile(file!, "utf8"));
  expect(backup.format).toBe("sales-os-v6");
  expect(backup.today).toEqual(before.today);
});
