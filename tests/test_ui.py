from playwright.sync_api import sync_playwright

BASE='http://127.0.0.1:8765'
def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
  page=context.new_page();errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.goto(BASE+'/roadmap/',wait_until='networkidle');print('roadmap modules',page.locator('.card').count())
  assert page.locator('.card').count()==22
  page.screenshot(path='/mnt/data/sales-os-2/docs/roadmap-light.png',full_page=False)
  page.goto(BASE+'/module/01-MODULE/',wait_until='networkidle')
  print('module lessons',page.locator('.item').count());assert page.locator('.item').count()==16
  page.screenshot(path='/mnt/data/sales-os-2/docs/module-light.png',full_page=False)
  page.goto(BASE+'/lesson/01-001/',wait_until='networkidle');print('lesson text',page.locator('.article').inner_text()[:80]);assert 'Обмен ценностью' in page.locator('.article').inner_text()
  page.screenshot(path='/mnt/data/sales-os-2/docs/lesson-light.png',full_page=False)
  page.locator('#status').select_option('theory_completed');page.reload(wait_until='networkidle');assert page.locator('#status').input_value()=='theory_completed'
  page.locator('[data-bookmark]').click();assert page.locator('[data-bookmark]').get_attribute('aria-pressed')=='true'
  page.goto(BASE+'/practice/01-P01/',wait_until='networkidle');page.locator('[data-note]').fill('Мой тестовый ответ про проект');page.wait_for_timeout(1200);page.reload(wait_until='networkidle');page.wait_for_timeout(500);print('note retained',page.locator('[data-note]').input_value());assert 'Мой тестовый' in page.locator('[data-note]').input_value()
  page.goto(BASE+'/search/?q=возражения',wait_until='networkidle');print('search results',page.locator('[data-search-results] a').count());assert page.locator('[data-search-results] a').count()>0
  page.goto(BASE+'/settings/',wait_until='networkidle');page.locator('.topbar [data-theme-trigger]').click();page.locator('.topbar [data-theme-option="dark"]').click();assert page.locator('html').get_attribute('data-theme')=='dark';page.reload(wait_until='networkidle');assert page.locator('html').get_attribute('data-theme')=='dark'
  page.goto(BASE+'/lesson/01-001/',wait_until='networkidle');page.screenshot(path='/mnt/data/sales-os-2/docs/lesson-dark.png',full_page=False)
  mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
  mp=mobile.new_page();mp.goto(BASE+'/module/08-MODULE/',wait_until='networkidle');mp.screenshot(path='/mnt/data/sales-os-2/docs/module-mobile.png',full_page=False);mp.locator('[data-menu-toggle]').click();assert mp.locator('body').evaluate('(e)=>e.classList.contains("menu-open")')
  overflow=mp.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');print('mobile overflow',overflow);assert not overflow
  print('JS errors',errors);assert not errors
  browser.close()
if __name__=='__main__':main()
