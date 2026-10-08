import {test,expect} from '@playwright/test';
test('Roadmap shows exactly 22 modules',async({page})=>{await page.goto('/roadmap/');await expect(page.locator('a.card')).toHaveCount(22);});
test('Module isolation and direct lesson navigation',async({page})=>{
 await page.goto('/module/01-MODULE/');await expect(page.locator('.pagehead h1')).toContainText('Природа');
 await expect(page.locator('.stack > a.item').first()).toHaveAttribute('href',/01-/);
 await page.goto('/lesson/01-001/');await expect(page.locator('article.article')).toContainText('Обмен ценностью');
});
test('Theme, progress and notes persist',async({page})=>{
 await page.goto('/lesson/01-001/');await page.locator('[data-theme-select]').first().selectOption('dark');
 await page.locator('[data-status-control]').selectOption('theory_completed');
 await page.locator('textarea[data-note]').fill('Проверочная запись');await page.waitForTimeout(650);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('[data-status-control]')).toHaveValue('theory_completed');
 await expect(page.locator('textarea[data-note]')).toHaveValue('Проверочная запись');
});
test('Mobile has no horizontal overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/module/08-MODULE/');expect(await page.evaluate('document.documentElement.scrollWidth<=innerWidth')).toBe(true);await page.locator('[data-menu-toggle]').click();await expect(page.locator('body')).toHaveClass(/menu-open/);});
test('Search shows real documents',async({page})=>{await page.goto('/search/?q=возражения');await expect(page.locator('[data-search-results] a').first()).toBeVisible();});
