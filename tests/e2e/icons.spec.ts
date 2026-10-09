import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const theme of ["light", "dark"]) {
  test(`icons are aligned, named and consistent in ${theme} theme`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      (t) => localStorage.setItem("sales-os-theme", t),
      theme,
    );
    await page.goto("/practice/");
    const settings = page.getByRole("link", { name: "Настройки", exact: true });
    await expect(settings).toHaveAttribute("href", "/settings/");
    await expect(settings.locator("svg")).toHaveAttribute(
      "data-icon",
      "settings",
    );
    const shape = await settings.evaluate((link) => {
      const svg = link.querySelector("svg")!;
      const box = svg.getBBox();
      const icon = svg.getBoundingClientRect();
      const button = link.getBoundingClientRect();
      return {
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
        dx: icon.x + icon.width / 2 - button.x - button.width / 2,
        dy: icon.y + icon.height / 2 - button.y - button.height / 2,
        width: icon.width,
        stroke: getComputedStyle(svg).strokeWidth,
      };
    });
    expect(shape.cx).toBeCloseTo(12, 1);
    expect(shape.cy).toBeCloseTo(12, 1);
    expect(Math.abs(shape.dx)).toBeLessThan(0.5);
    expect(Math.abs(shape.dy)).toBeLessThan(0.5);
    expect(shape.width).toBe(18);
    expect(shape.stroke).toBe("1.7px");
    for (const [label, icon] of [
      ["Обзор", "home"],
      ["Roadmap", "map"],
      ["Практика", "practice"],
      ["Очередь повтора", "clock"],
      ["Источники", "library"],
      ["Справочные материалы", "book"],
      ["Закладки", "star"],
    ]) {
      await expect(
        page
          .locator(".side-body")
          .getByRole("link", { name: label, exact: true })
          .locator("svg"),
      ).toHaveAttribute("data-icon", icon);
    }
    await mkdir("docs/screenshots/icons-2026-10-09", { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/icons-2026-10-09/header-${theme}.png`,
      clip: { x: 1000, y: 0, width: 425, height: 64 },
    });
    await page.goto("/search/");
    await page.locator("[data-search-input]").fill("продажи");
    await expect(
      page.locator("[data-search-results] .ic-right svg").first(),
    ).toHaveAttribute("data-icon", "chevron");
    await page.goto("/lesson/01-001/");
    await page.locator("[data-bookmark]").click();
    await page.goto("/bookmarks/");
    await expect(
      page.locator("[data-bookmark-list] .ic-right svg"),
    ).toHaveAttribute("data-icon", "chevron");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Открыть меню", exact: true })
      .click();
    const close = page.getByRole("button", {
      name: "Закрыть меню",
      exact: true,
    });
    await expect(close.locator("svg")).toHaveAttribute("data-icon", "close");
    await close.click();
    await expect(
      page.getByRole("button", { name: "Открыть меню", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.goto("/practice/01-P01/");
    const summary = page.locator(".toc-disclosure summary");
    await expect(summary.locator("svg")).toHaveAttribute(
      "data-icon",
      "chevron-down",
    );
    await summary.click();
    await expect(page.locator(".toc-disclosure")).toHaveAttribute("open", "");
    const bounds = await page.locator("svg.icon:visible").evaluateAll((icons) =>
      icons.map((node) => {
        const svg = node as SVGSVGElement;
        const b = svg.getBBox();
        return {
          name: svg.dataset.icon,
          x: b.x,
          y: b.y,
          right: b.x + b.width,
          bottom: b.y + b.height,
          hidden: svg.getAttribute("aria-hidden"),
          focusable: svg.getAttribute("focusable"),
        };
      }),
    );
    for (const box of bounds) {
      expect(box.x, box.name).toBeGreaterThanOrEqual(0);
      expect(box.y, box.name).toBeGreaterThanOrEqual(0);
      expect(box.right, box.name).toBeLessThanOrEqual(24);
      expect(box.bottom, box.name).toBeLessThanOrEqual(24);
      expect(box.hidden).toBe("true");
      expect(box.focusable).toBe("false");
    }
  });
}
