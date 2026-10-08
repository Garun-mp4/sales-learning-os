"""Responsive and palette verification using actual generated HTML and CSS.

Uses page.set_content, not live-URL navigation (which this host blocks).
"""
from browser_helpers import launch_chromium
from site_helpers import ROOT, SITE
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
CSS=(ROOT/'src/styles/app.css').read_text(encoding='utf-8')
ROUTES=['','roadmap','sources','search','settings','practice','lesson/01-001','practice/01-P01'] + [f'module/{n:02d}-MODULE' for n in range(1,23)]
WIDTHS=(320,390,768,1024,1440)

def render(page,route):
    html=(SITE/route/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+CSS+'</style>',html)
    html=re.sub(r'<script[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
    page.set_content(html,wait_until='domcontentloaded')

def main():
    with sync_playwright() as p:
      browser=launch_chromium(p)
      page=browser.new_page(viewport={'width':1440,'height':900})
      failures=[];count=0
      for w in WIDTHS:
        page.set_viewport_size({'width':w,'height':900})
        for route in ROUTES:
          render(page,route)
          props=page.evaluate('''() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
            content:!!document.querySelector('main#main'),
            bg:getComputedStyle(document.body).backgroundColor,
            font:getComputedStyle(document.body).fontFamily})''')
          count+=1
          if props['scroll']>props['width']: failures.append(f'{route or "home"}@{w}: scrollWidth={props["scroll"]}')
          if not props['content']: failures.append(f'{route or "home"}@{w}: no main element')
      render(page,'lesson/01-001')
      page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
      colors=page.evaluate('''()=>({background:getComputedStyle(document.body).backgroundColor,
        text:getComputedStyle(document.body).color,
        foreground:getComputedStyle(document.documentElement).getPropertyValue('--fg').trim(),
        link:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()})''')
      assert colors['background']=='rgb(0, 0, 0)',colors
      assert colors['foreground']=='#fafafa',colors
      assert colors['link']=='#3291ff',colors
      page.evaluate("document.documentElement.setAttribute('data-theme','light')")
      colors=page.evaluate('''()=>({background:getComputedStyle(document.body).backgroundColor,
        foreground:getComputedStyle(document.documentElement).getPropertyValue('--fg').trim(),
        link:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()})''')
      assert colors['background']=='rgb(255, 255, 255)',colors
      assert colors['foreground']=='#000',colors
      assert colors['link']=='#0761d1',colors
      page.set_viewport_size({'width':320,'height':900})
      render(page,'practice/01-P01')
      table=page.evaluate('''()=>{const table=document.querySelector('.article table');const wrapper=table?.parentElement;return {table:!!table,wrapped:wrapper?.classList.contains('table-wrap')||false,client:wrapper?.clientWidth||0,scroll:wrapper?.scrollWidth||0,overflow:getComputedStyle(wrapper||document.body).overflowX}}''')
      assert table['table'] and table['wrapped'] and table['overflow']=='auto' and table['scroll']>table['client'],table
      if failures:
        print('\n'.join(failures[:30]));raise AssertionError(f'{len(failures)} responsive failures')
      print(f'PASS: {count} responsive views (30 routes × 5 widths), zero document-level overflow')
      print('PASS: light/dark foreground, background and accessible link color tokens')
      browser.close()
if __name__=='__main__':main()
