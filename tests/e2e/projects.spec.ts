import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
const work = (p: Page) => p.locator("[data-projects-work]");
const answer = (p: Page) =>
  work(p).locator('[data-practice-answer="criterion-1"]');
const service = (p: Page) => work(p).locator('[name="service"]');
async function state(p: Page): Promise<any> {
  return p.evaluate(() => window.SalesOSUserStore.getState());
}
async function create(p: Page, name: string) {
  await p.locator("[data-project-name]").fill(name);
  await p.locator("[data-project-create]").click();
  await expect(work(p).locator("[data-project-context]")).toBeVisible();
  await expect(work(p).locator('[name="name"]')).toHaveValue(name);
  await expect(
    work(p).locator("[data-practice-draft-status]"),
  ).not.toContainText("Загрузка");
}
test("M5 independent projects flush unsaved context and answer on switch, retain iterations and reload", async ({
  page,
}) => {
  await page.goto("/projects/");
  await create(page, "Проект Альфа");
  await service(page).fill("Услуга Альфа");
  await answer(page).fill("Ответ Альфа");
  await create(page, "Проект Бета");
  await expect(answer(page)).toHaveValue("");
  await expect(service(page)).toHaveValue("");
  await answer(page).fill("Ответ Бета");
  await page
    .locator("[data-projects-list]")
    .getByRole("button", { name: "Проект Альфа", exact: true })
    .click();
  await expect(answer(page)).toHaveValue("Ответ Альфа");
  await expect(service(page)).toHaveValue("Услуга Альфа");
  await work(page).locator("[data-practice-save]").click();
  await expect(
    work(page).locator("[data-practice-history-count]"),
  ).toContainText("1");
  await page.reload();
  await expect(answer(page)).toHaveValue("Ответ Альфа");
  const s = await state(page);
  const values = Object.values(s.projects.items) as any[];
  expect(values).toHaveLength(2);
  expect(
    values.find((p) => p.name === "Проект Бета").draft.answers["criterion-1"],
  ).toBe("Ответ Бета");
  expect(s.practiceDrafts.PROJECT_WORKBOOK).toBeUndefined();
});
test("M5 migration retains old notes, draft versions, iterations and immutable practice source", async ({
  page,
}) => {
  await page.goto("/final-project/");
  await page
    .locator('[data-practice-answer="criterion-1"]')
    .fill("Прежний ответ");
  await page.locator("[data-practice-save]").click();
  await page
    .locator('[data-note="FINAL_PROJECT"]')
    .fill("Прежняя общая заметка");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.SalesOSUserStore.getAllNotes()))
          .FINAL_PROJECT,
    )
    .toBe("Прежняя общая заметка");
  await page.goto("/practice/01-P01/");
  await page
    .locator('[data-practice-answer="criterion-1"]')
    .fill("Исходная практика");
  await page.locator("[data-practice-save]").click();
  await expect(page.locator("[data-practice-history-count]")).toContainText(
    "1",
  );
  await page.goto("/projects/");
  await expect(answer(page)).toHaveValue("Прежний ответ");
  await expect(work(page).locator('[name="legacyNote"]')).toHaveValue(
    "Прежняя общая заметка",
  );
  await work(page)
    .getByRole("button", { name: "Прикрепить снимок", exact: true })
    .click();
  await expect(
    work(page).locator("[data-project-snapshots] details"),
  ).toHaveCount(1);
  await page.goto("/practice/01-P01/");
  await page
    .locator('[data-practice-answer="criterion-1"]')
    .fill("Изменённая практика");
  await page.locator("[data-practice-save]").click();
  await expect(page.locator("[data-practice-history-count]")).toContainText(
    "2",
  );
  await page.goto("/projects/");
  await work(page).locator("[data-project-snapshots] summary").click();
  await expect(work(page).locator("[data-project-snapshots]")).toContainText(
    "Исходная практика",
  );
  await expect(
    work(page).locator("[data-project-snapshots]"),
  ).not.toContainText("Изменённая практика");
  await expect(
    work(page).getByRole("link", { name: "Открыть исходную практику" }),
  ).toHaveAttribute("href", "/practice/01-P01/");
  expect((await state(page)).practiceAttempts.FINAL_PROJECT).toHaveLength(1);
});
test("M5 scoped escaped export, preview and printable long text", async ({
  page,
  context,
}) => {
  await page.goto("/projects/");
  await create(page, "Чужой секретный проект");
  await answer(page).fill("Секрет Бета");
  await create(page, "Мой документ");
  await service(page).fill("<script>window.hacked=1</script>");
  await answer(page).fill("Длинный ответ ".repeat(700));
  await work(page)
    .getByRole("button", { name: "Предпросмотр", exact: true })
    .click();
  const frame = page.frameLocator("[data-project-preview] iframe");
  await expect(
    frame.getByRole("heading", { name: "Мой документ", exact: true }),
  ).toBeVisible();
  await expect(frame.locator("body")).not.toContainText("Секрет Бета");
  const download = page.waitForEvent("download");
  await work(page)
    .getByRole("button", { name: "HTML для печати", exact: true })
    .click();
  const artifact = await download;
  const html = await readFile((await artifact.path())!, "utf8");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("Секрет Бета");
  const print = await context.newPage();
  await print.setContent(html);
  await print.emulateMedia({ media: "print" });
  expect(
    await print.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(print.locator("body")).toContainText("Длинный ответ");
  await print.close();
  const mdWait = page.waitForEvent("download");
  await work(page)
    .getByRole("button", { name: "Экспорт Markdown", exact: true })
    .click();
  expect(await readFile((await (await mdWait).path())!, "utf8")).not.toContain(
    "Секрет Бета",
  );
});
test("M5 archive restores full workbook and deletion requires exact name", async ({
  page,
}) => {
  await page.goto("/projects/");
  await create(page, "Архивный проект");
  await answer(page).fill("Не терять");
  await work(page)
    .getByRole("button", { name: "Архивировать проект", exact: true })
    .click();
  await expect(work(page)).toContainText("Окончательно удалить проект");
  await work(page)
    .getByRole("button", { name: /Восстановить/ })
    .click();
  await expect(answer(page)).toHaveValue("Не терять");
  await work(page)
    .getByRole("button", { name: "Архивировать проект", exact: true })
    .click();
  await work(page).locator("details summary").click();
  await work(page).locator("input").fill("ошибка");
  await work(page)
    .getByRole("button", { name: "Удалить без восстановления", exact: true })
    .click();
  await expect(page.locator("[data-projects-notice]")).toContainText("точно");
  await work(page).locator("input").fill("Архивный проект");
  await work(page)
    .getByRole("button", { name: "Удалить без восстановления", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state(page)).projects.items).length)
    .toBe(0);
  expect(Object.keys((await state(page)).projects.tombstones)).toHaveLength(1);
});
test("M5 simultaneous context changes preserve local text and offer explicit conflict recovery", async ({
  page,
  context,
}) => {
  await page.goto("/projects/");
  await create(page, "Две вкладки");
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(service(other)).toHaveValue("");
  await page.evaluate(async () => {
    const store = window.SalesOSUserStore;
    await store.updateState((s: any) => ({
      ...s,
      projects: (window as any).SalesOSProjects.context(
        s.projects,
        s.projects.activeId,
        1,
        "Две вкладки",
        { service: "Из другой вкладки" },
      ),
    }));
  });
  await expect(service(other)).toHaveValue("Из другой вкладки");
  await service(other).fill("Мой вариант");
  await page.evaluate(async () => {
    await window.SalesOSUserStore.updateState((s: any) => ({
      ...s,
      projects: (window as any).SalesOSProjects.context(
        s.projects,
        s.projects.activeId,
        2,
        "Две вкладки",
        { service: "Сохранённый конкурент" },
      ),
    }));
  });
  await expect(other.locator("[data-projects-notice]")).toContainText(
    "Контекст изменён",
  );
  await expect(service(other)).toHaveValue("Мой вариант");
  const file = other.waitForEvent("download");
  await other
    .getByRole("button", { name: "Скачать мой несохранённый контекст" })
    .click();
  expect(await readFile((await (await file).path())!, "utf8")).toContain(
    "Мой вариант",
  );
  await other
    .getByRole("button", { name: "Загрузить сохранённый контекст" })
    .click();
  await expect(service(other)).toHaveValue("Сохранённый конкурент");
  await other.close();
});
test("M5 mobile dark and desktop light have no horizontal overflow", async ({
  page,
}) => {
  await page.goto("/projects/");
  await create(page, "Рабочий проект");
  await work(page).locator('[name="name"]').fill("Проект после переименования");
  await service(page).fill("Разработка сайтов");
  await expect(
    work(page).getByRole("heading", {
      name: "Проект после переименования",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-projects-notice]")).toContainText(
    "Сохранено",
  );
  await mkdir("docs/screenshots/m5-projects", { recursive: true });
  for (const [name, width, theme] of [
    ["mobile-dark", 390, "dark"],
    ["desktop-light", 1440, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/m5-projects/${name}.png`,
      fullPage: true,
    });
  }
});
test("M5 temporary storage retains workbook and offers in-place v9 backup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("Unavailable");
      },
    });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/projects/");
  await create(page, "В памяти");
  await service(page).fill("Временная услуга");
  await expect(page.locator("[data-projects-notice]")).toContainText(
    "Только в памяти",
  );
  const file = page.waitForEvent("download");
  await page
    .locator("[data-projects-notice]")
    .getByRole("button", { name: "Скачать резервную копию" })
    .click();
  const backup = JSON.parse(
    await readFile((await (await file).path())!, "utf8"),
  );
  expect(backup.version).toBe(9);
  expect(Object.values(backup.projects.items)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        context: expect.objectContaining({ service: "Временная услуга" }),
      }),
    ]),
  );
});
test("M5 personal search is opt-in, local, and identifies projects separately from course materials", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/projects/");
  await create(page, "Закрытый проект");
  await service(page).fill("Приватный маяк 583");
  await expect(page.locator("[data-projects-notice]")).toContainText(
    "Сохранено",
  );
  await page.goto("/search/");
  await page.locator("[data-search-input]").fill("Приватный маяк 583");
  await expect(page.locator(".search-private-result")).toHaveCount(0);
  await page.locator("[data-search-private]").check();
  await expect(page.locator(".search-private-result")).toContainText(
    "Личный проект",
  );
  await page.locator(".search-private-result a").click();
  await expect(service(page)).toHaveValue("Приватный маяк 583");
  expect(
    requests.some((u) => decodeURIComponent(u).includes("Приватный маяк")),
  ).toBe(false);
});
for (const version of [1, 2, 3])
  test(`M5 imports legacy v${version} without losing old notes or project history`, async ({
    page,
  }) => {
    await page.goto("/settings/");
    const draft = {
      answers: { "criterion-1": "Ответ из v3" },
      selfReview: {},
      nextStep: "",
      updatedAt: 1000,
      writerId: "legacy",
      versions: [
        {
          answers: { "criterion-1": "Вариант из v3" },
          selfReview: {},
          nextStep: "",
          updatedAt: 900,
          writerId: "legacy",
        },
      ],
    };
    const rubric = JSON.parse(
      await readFile("src/generated/projects-data.json", "utf8"),
    ).rubric;
    const backup: any =
      version === 1
        ? {
            format: "sales-os-roadmap-v1",
            checks: {},
            notes: { "0": "Старая модульная заметка" },
          }
        : {
            format: `sales-os-v${version}`,
            version,
            lessonStatuses: {},
            practiceStatuses: {},
            bookmarks: [],
            notes: { FINAL_PROJECT: "Старая итоговая заметка" },
          };
    if (version === 3) {
      backup.practiceDrafts = { FINAL_PROJECT: draft };
      backup.practiceAttempts = {
        FINAL_PROJECT: [
          {
            id: "legacy-attempt",
            createdAt: 1000,
            rubric,
            answers: draft.answers,
            selfReview: {},
            nextStep: "",
          },
        ],
      };
    }
    await page.locator("[data-import]").setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator("[data-import-dialog]")).toBeVisible();
    await page.locator("[data-import-replace]").click();
    await expect(page.locator("#toast")).toContainText("Импорт заменил");
    await page.goto("/projects/");
    if (version === 1) {
      expect(
        (await page.evaluate(() => window.SalesOSUserStore.getAllNotes()))[
          "01-MODULE"
        ],
      ).toBe("Старая модульная заметка");
      await create(page, "После v1");
    } else {
      await expect(work(page).locator('[name="legacyNote"]')).toHaveValue(
        "Старая итоговая заметка",
      );
    }
    if (version === 3) {
      await expect(answer(page)).toHaveValue("Ответ из v3");
      await expect(
        work(page).locator("[data-practice-history-count]"),
      ).toContainText("1");
      await expect(
        work(page).locator("[data-practice-versions]"),
      ).toBeVisible();
    }
    await page.goto("/settings/");
    const download = page.waitForEvent("download");
    await page.locator("[data-export]").click();
    const current = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(current.version).toBe(9);
    expect(Object.keys(current.projects.items)).toHaveLength(1);
    await page.locator("[data-import]").setInputFiles({
      name: "v9.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(current)),
    });
    await page.locator("[data-import-merge]").click();
    await expect(page.locator("#toast")).toContainText("Данные объединены");
    expect(Object.keys((await state(page)).projects.items)).toHaveLength(1);
  });
