import { expect, test, type Page } from "@playwright/test";

async function selectFirstParagraph(page: Page) {
  await page
    .locator("article[data-annotation-content] p")
    .first()
    .evaluate((p) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
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

async function savedItems(page: Page) {
  return page.evaluate(async () => {
    await window.SalesOSUserStore.ready;
    return Object.values(
      (await window.SalesOSUserStore.getState()).annotations.items,
    );
  });
}

test("M7 saves a text selection, returns to its exact source and reviews it", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/lesson/01-001/");
  const originalArticleText = await page
    .locator("article[data-annotation-content]")
    .innerText();
  await selectFirstParagraph(page);
  await page.locator("[data-highlight-selection-action]").click();
  const quote = await page.locator("[data-highlight-quote]").inputValue();
  expect(quote.length).toBeGreaterThan(8);
  await page
    .locator("[data-highlight-comment]")
    .fill("Проверить это в следующем разговоре.");
  await page.locator("[data-highlight-save]").click();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);
  await expect(page.locator("article[data-annotation-content]")).toHaveText(
    originalArticleText,
  );
  let records = await savedItems(page);
  expect(records).toHaveLength(1);
  const id = records[0].id;
  expect(records[0].comment).toBe("Проверить это в следующем разговоре.");
  await expect
    .poll(() =>
      page.evaluate(() => CSS.highlights.get("sales-os-highlights")?.size || 0),
    )
    .toBeGreaterThan(0);

  await page.reload();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => CSS.highlights.get("sales-os-highlights")?.size || 0),
    )
    .toBeGreaterThan(0);

  await page.goto("/highlights/");
  await page.locator("[data-highlight-search]").fill(quote.slice(0, 12));
  const catalogCard = page.locator(`[data-highlight-id="${id}"]`);
  await expect(catalogCard).toBeVisible();
  await page.locator("[data-highlight-module]").selectOption("01");
  await expect(catalogCard).toBeVisible();
  await expect(catalogCard).toContainText(
    "Проверить это в следующем разговоре.",
  );
  await catalogCard.getByRole("button", { name: "Изменить заметку" }).click();
  await catalogCard
    .locator(".highlight-edit textarea")
    .fill("Комментарий после редактирования.");
  await catalogCard
    .getByRole("button", { name: "Сохранить комментарий" })
    .click();
  await expect(catalogCard).toContainText("Комментарий после редактирования.");
  records = await savedItems(page);
  expect(records.find((item) => item.id === id)?.comment).toBe(
    "Комментарий после редактирования.",
  );
  const sourceLink = catalogCard.getByRole("link", {
    name: "Обмен ценностью: клиентская задача → решение → результат",
  });
  const sourceHref = await sourceLink.getAttribute("href");
  expect(sourceHref).toContain(`annotation=${id}`);
  await sourceLink.click();
  await expect(page).toHaveURL(new RegExp(`[?&]annotation=${id}`));
  await expect
    .poll(() =>
      page.evaluate(() => CSS.highlights.get("sales-os-highlights")?.size || 0),
    )
    .toBeGreaterThan(0);

  await page.locator(`[data-highlight-schedule="${id}"]`).click();
  await expect
    .poll(
      async () =>
        (await savedItems(page)).find((item) => item.id === id)?.reviewAt || 0,
    )
    .toBeGreaterThan(Date.now());
  await page.goto("/review/");
  const repeat = page.locator(`[data-highlight-review-id="${id}"]`);
  await expect(repeat).toBeVisible();
  await repeat
    .locator(`[data-highlight-review-delay="${id}"]`)
    .selectOption("3");
  await repeat.locator(`[data-highlight-review-reschedule="${id}"]`).click();
  await expect
    .poll(
      async () =>
        (await savedItems(page)).find((item) => item.id === id)?.reviewAt || 0,
    )
    .toBeGreaterThan(Date.now() + 2 * 86400000);
  await page.locator(`[data-highlight-review-complete="${id}"]`).click();
  await expect(repeat).toHaveCount(0);
  expect(
    (await savedItems(page)).find((item) => item.id === id)?.reviewAt,
  ).toBe(0);

  await page.goto(`/lesson/01-001/?annotation=${id}#highlight-workspace`);
  await page.locator(`[data-highlight-delete="${id}"]`).click();
  await expect(
    page.locator("[data-highlight-trash-items] .highlight-item"),
  ).toHaveCount(1);
  await page.locator("[data-highlight-trash] > summary").click();
  await page.locator(`[data-highlight-restore="${id}"]`).click();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);
  records = await savedItems(page);
  expect(records.find((item) => item.id === id)?.comment).toBe(
    "Комментарий после редактирования.",
  );

  await page.locator(`[data-highlight-delete="${id}"]`).click();
  await page.goto("/highlights/");
  await page.locator("[data-highlight-scope]").selectOption("deleted");
  const trashCard = page.locator(`[data-highlight-id="${id}"]`);
  await expect(trashCard).toBeVisible();
  await trashCard.locator(`[data-highlight-restore="${id}"]`).click();
  await expect(trashCard).toHaveCount(0);
  await page.locator("[data-highlight-scope]").selectOption("active");
  await expect(page.locator(`[data-highlight-id="${id}"]`)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("M7 catalog keeps working when its material index is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes("/assets/client-index.json"))
        throw new TypeError("Simulated unavailable client index");
      return originalFetch(input, init);
    };
  });
  await page.goto("/lesson/01-001/");
  await selectFirstParagraph(page);
  await page.locator("[data-highlight-selection-action]").click();
  await page.locator("[data-highlight-comment]").fill("Локальная запись.");
  await page.locator("[data-highlight-save]").click();
  const id = (await savedItems(page))[0].id;

  await page.goto("/highlights/");
  const catalogCard = page.locator(`[data-highlight-id="${id}"]`);
  await expect(catalogCard).toBeVisible();
  await expect(page.locator("[data-highlight-catalog-status]")).toContainText(
    "Названия материалов не загрузились",
  );
  const sourceLink = catalogCard.getByRole("link", { name: "01-001" });
  await sourceLink.click();
  await expect(page).toHaveURL(new RegExp(`[?&]annotation=${id}`));
  await expect
    .poll(() =>
      page.evaluate(() => CSS.highlights.get("sales-os-highlights")?.size || 0),
    )
    .toBeGreaterThan(0);
});

test("M7 keeps the mobile paragraph workflow available and outside practice answers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lesson/01-001/");
  await expect(page.locator("[data-highlight-toolbar]")).toBeHidden();
  await page.locator(".highlight-manual > summary").click();
  const select = page.locator("[data-highlight-block-select]");
  expect(
    await select.evaluate((field) => field.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(390);
  await select.selectOption({ index: 2 });
  const quote = page.locator("[data-highlight-quote]");
  await expect(quote).not.toHaveValue("");
  await page.locator("[data-highlight-comment]").fill("Ручной touch-путь.");
  await page.locator("[data-highlight-save]").click();
  await expect(
    page.locator("[data-highlight-items] .highlight-item"),
  ).toHaveCount(1);

  await page.goto("/practice/01-P01/");
  expect(
    await page
      .locator('[data-practice-answer="criterion-1"]')
      .evaluate((field) => field.closest("article[data-annotation-content]")),
  ).toBeNull();
  await page
    .locator('[data-practice-answer="criterion-1"]')
    .fill("Черновик ответа не меняется.");
  await expect(
    page.locator('[data-practice-answer="criterion-1"]'),
  ).toHaveValue("Черновик ответа не меняется.");
});
