import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const bank = JSON.parse(
  (
    await readFile("sales-knowledge-base/review-questions.json", "utf8")
  ).replace(/^\uFEFF/, ""),
).questions;
const choice = bank.find((q: any) => q.type === "choice"),
  open = bank.find((q: any) => q.type === "open");
const work = (page: Page) => page.locator("[data-knowledge-work]");
async function state(page: Page) {
  return page.evaluate(
    async () => await window.SalesOSUserStore.getState(),
  ) as Promise<any>;
}
async function start(page: Page, q: any) {
  await page.goto("/review/check/");
  await page
    .locator("[data-knowledge-catalog]")
    .getByRole("button", { name: q.skill, exact: true })
    .click();
  await expect(work(page).locator("[data-knowledge-answer]")).toBeVisible();
}
async function send(page: Page, q: any, correct = true) {
  await work(page)
    .locator(
      'input[value="' +
        (correct
          ? q.answerId
          : q.options.find((o: any) => o.id !== q.answerId).id) +
        '"]',
    )
    .check();
  await work(page)
    .getByRole("button", { name: "Ответить и открыть разбор" })
    .click();
  await expect(
    work(page).getByRole("heading", { name: "Почему", exact: true }),
  ).toBeVisible();
}

test("M4 choice hidden explanation, durable draft, objective key, single submission and unchanged mastery", async ({
  page,
}) => {
  await start(page, choice);
  await expect(work(page)).not.toContainText(choice.explanation);
  await work(page)
    .locator('input[value="' + choice.answerId + '"]')
    .check();
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Сохранено",
  );
  await page.reload();
  await expect(
    work(page).locator('input[value="' + choice.answerId + '"]'),
  ).toBeChecked();
  await work(page)
    .getByRole("button", { name: "Ответить и открыть разбор" })
    .dblclick();
  await expect(work(page)).toContainText("Проверка по ключу: правильно");
  let s = await state(page);
  expect(Object.keys(s.knowledgeReview.attempts)).toHaveLength(1);
  expect(s.lessonStatuses).toEqual({});
  expect(Object.keys(s.knowledgeReview.schedule)).toHaveLength(0);
  await work(page)
    .getByRole("button", { name: "Тренировочная повторная попытка" })
    .click();
  await send(page, choice, false);
  await expect(work(page)).toContainText("Проверка по ключу: ошибка");
  await expect(
    work(page).getByRole("link", { name: "Вернуться к теме курса" }),
  ).toHaveAttribute("href", "/lesson/" + choice.entryId + "/");
  await page.reload();
  await expect(work(page)).toContainText("Проверка по ключу: ошибка");
  expect(
    Object.keys((await state(page)).knowledgeReview.attempts),
  ).toHaveLength(2);
});

test("M4 open response autosave, reload and explicit rubric self-assessment", async ({
  page,
}) => {
  await start(page, open);
  await work(page)
    .locator("textarea")
    .fill(
      "Уточню границы задачи и ожидаемый результат. Согласую следующий шаг без давления.",
    );
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Сохранено",
  );
  await page.reload();
  await expect(work(page).locator("textarea")).toHaveValue(/Уточню границы/);
  await expect(work(page)).not.toContainText(open.explanation);
  await work(page)
    .getByRole("button", { name: "Ответить и открыть разбор" })
    .click();
  await expect(work(page)).toContainText("Ожидает самооценки");
  await page.reload();
  for (const criterion of open.rubric)
    await work(page)
      .locator('input[name="' + criterion.id + '"][value="2"]')
      .check();
  await work(page)
    .getByRole("button", { name: "Сохранить самооценку" })
    .click();
  await expect(work(page)).toContainText("Самооценка: критерии выполнены");
  expect(
    Object.values((await state(page)).knowledgeReview.attempts)[0],
  ).toMatchObject({ result: { kind: "self", value: "met" } });
});

test("M4 opt-in, priority in M3, skip and unchanged manual queue", async ({
  page,
}) => {
  await start(page, choice);
  await page
    .getByRole("button", {
      name: "Включить автоматические интервалы",
      exact: true,
    })
    .click();
  await send(page, choice);
  let s = await state(page);
  expect(s.knowledgeReview.enabled).toBe(true);
  expect(s.knowledgeReview.schedule[choice.id].streak).toBe(1);
  await page.evaluate(async (id) => {
    await window.SalesOSUserStore.updateState((s: any) => {
      s.knowledgeReview.schedule[id].dueAt = Date.now() - 1000;
      s.revisitQueue = {
        "02-001": {
          entryId: "02-001",
          dueAt: Date.now() - 1000,
          recallDraft: "Ручная запись",
        },
      };
      return s;
    });
  }, choice.id);
  await page.goto("/today/");
  await page
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  await expect(
    page.locator("[data-today-item]").first().locator("a").first(),
  ).toHaveAttribute("href", "/review/check/?question=" + choice.id);
  await page.goto("/review/check/");
  await page
    .getByRole("button", {
      name: "Отключить автоматические интервалы",
      exact: true,
    })
    .click();
  expect((await state(page)).knowledgeReview.enabled).toBe(false);
  await page.goto("/review/");
  await expect(page.locator("[data-review-due-list] textarea")).toHaveValue(
    "Ручная запись",
  );
  await start(page, open);
  await work(page).locator("textarea").fill("Черновик перед пропуском");
  await work(page)
    .getByRole("button", { name: "Пропустить до завтра" })
    .click();
  await expect(
    work(page).getByRole("button", { name: "Попробовать снова" }),
  ).toBeVisible();
  expect(
    Object.values((await state(page)).knowledgeReview.attempts),
  ).toHaveLength(1);
  await work(page).getByRole("button", { name: "Попробовать снова" }).click();
  const archived = Object.values(
    (await state(page)).knowledgeReview.attempts,
  ).find((a: any) => a.archived) as any;
  expect(archived.text).toBe("Черновик перед пропуском");
});

test("M4 backup v6 restore, v5 compatibility and invalid result rejection", async ({
  page,
}) => {
  await start(page, choice);
  await send(page, choice);
  const before = await state(page);
  await page.goto("/settings/");
  const dl = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const download = await dl;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.format).toBe("sales-os-v9");
  expect(Object.keys(backup.knowledgeReview.attempts)).toHaveLength(1);
  const upload = async (value: any) => {
    await page.locator("input[type=file]").setInputFiles({
      name: "copy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  };
  const bad = structuredClone(backup);
  Object.values(bad.knowledgeReview.attempts).forEach(
    (a: any) => (a.result.value = "incorrect"),
  );
  await upload(bad);
  await expect(page.locator("[data-import-dialog]")).not.toBeVisible();
  await expect(page.locator("#toast")).toContainText("Некорректные данные");
  expect((await state(page)).knowledgeReview.attempts).toEqual(
    before.knowledgeReview.attempts,
  );
  await upload(backup);
  await expect(page.locator("[data-import-replace]")).toBeEnabled();
  await page.locator("[data-import-replace]").click();
  await expect
    .poll(
      async () =>
        Object.keys((await state(page)).knowledgeReview.attempts).length,
    )
    .toBe(1);
  const legacy = { ...backup, format: "sales-os-v5", version: 5 };
  delete legacy.knowledgeReview;
  delete legacy.projects;
  delete legacy.personalTemplates;
  delete legacy.annotations;
  await upload(legacy);
  await expect(page.locator("[data-import-merge]")).toBeEnabled();
  await page.locator("[data-import-merge]").click();
  await expect
    .poll(
      async () =>
        Object.keys((await state(page)).knowledgeReview.attempts).length,
    )
    .toBe(1);
  await page.goto("/review/check/?question=" + choice.id);
  await expect(work(page)).toContainText("Проверка по ключу: правильно");
});

test("M4 concurrent submit is idempotent and version change preserves original draft", async ({
  page,
  context,
}) => {
  await start(page, open);
  await work(page)
    .locator("textarea")
    .fill("Исходный ответ до изменения вопроса");
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Сохранено",
  );
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(work(other).locator("textarea")).toHaveValue(/Исходный/);
  const captured = (await state(page)).knowledgeReview.drafts[open.id];
  await Promise.all(
    [page, other].map((p) =>
      p.evaluate(async (draft: any) => {
        await window.SalesOSUserStore.updateState((s: any) => ({
          ...s,
          knowledgeReview: (window as any).SalesOSKnowledge.submit(
            s.knowledgeReview,
            draft,
          ),
        }));
      }, captured),
    ),
  );
  await expect(work(page)).toContainText("Ожидает самооценки");
  await expect(work(other)).toContainText("Ожидает самооценки");
  await expect
    .poll(
      async () =>
        Object.keys((await state(page)).knowledgeReview.attempts).length,
    )
    .toBe(1);
  await other.close();
  // Registry changes are modeled through the pure contract, with real IndexedDB persistence.
  await page.evaluate(async (q: any) => {
    const core = (window as any).SalesOSKnowledge;
    await window.SalesOSUserStore.updateState((s: any) => {
      const next = { ...q, version: 2, prompt: q.prompt + " Новый контекст." };
      s.knowledgeReview = core.start(s.knowledgeReview, next, true);
      return s;
    });
  }, open);
  const s = await state(page);
  expect(Object.values(s.knowledgeReview.attempts)[0]).toMatchObject({
    question: { version: 1 },
    text: "Исходный ответ до изменения вопроса",
  });
  expect(s.knowledgeReview.drafts[open.id].question.version).toBe(2);
});

test("M4 mobile dark, keyboard focus, offline reload and visual evidence", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("sales-os-theme", "dark"),
  );
  await start(page, open);
  await work(page)
    .locator("textarea")
    .fill("Проверю цель, ограничения и следующий шаг.");
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Сохранено",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("docs/screenshots/m4-knowledge", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/m4-knowledge/mobile-dark.png",
    fullPage: true,
  });
  // The running page can save while offline; the full offline package is covered by offline-pack regression tests.
  await context.setOffline(true);
  await work(page).locator("textarea").fill("Ответ, сохранённый без сети");
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Сохранено",
  );
  await context.setOffline(false);
  await page.reload();
  await expect(work(page).locator("textarea")).toHaveValue(
    "Ответ, сохранённый без сети",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    localStorage.setItem("sales-os-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await work(page)
    .getByRole("button", { name: "Ответить и открыть разбор" })
    .click();
  await expect(work(page).locator("[data-knowledge-rubric]")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/m4-knowledge/desktop-rubric.png",
    fullPage: true,
  });
});
test("M4 limits retain current answer and temporary storage exports answers in place", async ({
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
  await start(page, choice);
  await send(page, choice);
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "Только в памяти",
  );
  for (const q of bank.slice(1, 3))
    await page
      .locator("[data-knowledge-catalog]")
      .getByRole("button", { name: q.skill, exact: true })
      .click();
  const prior = page.url();
  await page
    .locator("[data-knowledge-catalog]")
    .getByRole("button", { name: bank[3].skill, exact: true })
    .click();
  await expect(page.locator("[data-knowledge-notice]")).toContainText(
    "3 новых",
  );
  expect(page.url()).toBe(prior);
  const before = await state(page);
  const download = page.waitForEvent("download");
  await page
    .locator("[data-knowledge-notice]")
    .getByRole("button", { name: "Скачать резервную копию" })
    .click();
  const backup = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(backup.format).toBe("sales-os-v9");
  expect(backup.knowledgeReview).toEqual(before.knowledgeReview);
});
