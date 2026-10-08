"""Chromium DOM/component smoke checks independent of blocked localhost navigation.
These are NOT replacements for real-URL Playwright E2E or production preview.
Requires pip install playwright, and Chromium at /usr/bin/chromium.
"""
from browser_helpers import launch_chromium
from site_helpers import ROOT, SITE
from pathlib import Path
import json,re
from playwright.sync_api import sync_playwright
CSS=(ROOT/'src/styles/app.css').read_text(encoding='utf-8')
JS=(ROOT/'src/scripts/app.js').read_text(encoding='utf-8')
INDEX=json.loads((SITE/'assets/client-index.json').read_text(encoding='utf-8'))
SEARCH=json.loads((SITE/'assets/search-index.json').read_text(encoding='utf-8'))
SHOT=ROOT/'test-results'/'screenshots';SHOT.mkdir(parents=True,exist_ok=True)

def load(page,route):
    html=(SITE/route/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+CSS+'</style>', html)
    html=re.sub(r'<script[^>]*\bsrc="[^"]+"[^>]*></script>', '', html)
    page.set_content(html,wait_until='domcontentloaded')
    # about:blank is a deliberately synthetic environment with no first-party origin.
    page.evaluate('''(v)=>{const map={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map[k]??null,setItem:(k,val)=>map[k]=String(val),removeItem:k=>delete map[k],key:i=>Object.keys(map)[i],get length(){return Object.keys(map).length}}});window.fetch=async url=>({ok:true,json:async()=>String(url).includes('client-index')?v.index:v.search});window.confirm=()=>true;history.replaceState=()=>{};}''',{'index':INDEX,'search':SEARCH})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_script_tag(content=JS)
    return errors

def main():
  with sync_playwright() as p:
    browser=launch_chromium(p)
    desktop=browser.new_page(viewport={'width':1440,'height':900})
    errors=load(desktop,'lesson/01-001')
    assert 'Обмен ценностью' in desktop.locator('article.article').inner_text()
    desktop.locator('[data-status-control]').select_option('theory_completed')
    desktop.locator('[data-bookmark]').click()
    desktop.locator('[data-theme-select]').first.select_option('dark')
    assert desktop.locator('html').get_attribute('data-theme')=='dark'
    assert desktop.locator('[data-bookmark]').get_attribute('aria-pressed')=='true'
    assert desktop.locator('[data-status-control]').input_value()=='theory_completed'
    desktop.screenshot(path=str(SHOT/'lesson-dark.png'))
    assert not errors,errors
    search=browser.new_page(viewport={'width':1440,'height':900})
    errors=load(search,'search');search.locator('[data-search-input]').fill('возражения');search.wait_for_timeout(1400)
    assert search.locator('[data-search-results] a.item').count()>0
    assert not errors,errors
    mobile=browser.new_page(viewport={'width':390,'height':844})
    errors=load(mobile,'module/08-MODULE')
    assert not mobile.evaluate('document.documentElement.scrollWidth>innerWidth')
    mobile.locator('[data-menu-toggle]').click(timeout=4000)
    assert mobile.locator('body').evaluate('(b)=>b.classList.contains("menu-open")')
    mobile.locator('[data-menu-close]').click(timeout=4000)
    assert not mobile.locator('body').evaluate('(b)=>b.classList.contains("menu-open")')
    mobile.screenshot(path=str(SHOT/'module-mobile.png'))
    assert not errors,errors
    roadmap=browser.new_page(viewport={'width':1440,'height':900})
    errors=load(roadmap,'roadmap')
    assert roadmap.locator('.card').count()==22
    roadmap.screenshot(path=str(SHOT/'roadmap-light.png'))
    assert not errors,errors
    print('PASS: embedded Chromium: theme, progress, bookmarks, search, mobile overflow/menu, 22-card roadmap, no JS errors')
    print('LIMIT: localhost navigation and PWA offline network tests NOT exercised by this in-memory smoke test')
    browser.close()

if __name__=='__main__':main()
