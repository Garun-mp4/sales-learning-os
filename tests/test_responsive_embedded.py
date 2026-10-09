"""Responsive and palette verification using actual generated HTML and CSS.

Uses page.set_content, not live-URL navigation (which this host blocks).
"""
from browser_helpers import launch_chromium
from site_helpers import ROOT, SITE
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright
CSS=(ROOT/'src/styles/app.css').read_text(encoding='utf-8')
ROUTES=['','roadmap','sources','search','settings','practice','lesson/01-001','practice/01-P01','library','library/glossary','library/cases','library/templates','editorial-review'] + [f'module/{n:02d}-MODULE' for n in range(1,23)]
WIDTHS=(320,390,768,1024,1440)
CONTENT=json.loads((ROOT/'src/generated/content-manifest.json').read_text(encoding='utf-8'))
PRACTICE_ROUTES=[f"practice/{entry['id']}" for entry in CONTENT['entries'].values() if entry['kind']=='practice']

def rgb_luminance(value):
    value=value.lstrip('#')
    if len(value)==3:
        value=''.join(channel*2 for channel in value)
    if len(value)!=6:
        raise ValueError(f'Expected a 3- or 6-digit hex color, got {value!r}')
    channels=[int(value[index:index+2],16)/255 for index in (0,2,4)]
    linear=[channel/12.92 if channel<=0.04045 else ((channel+0.055)/1.055)**2.4 for channel in channels]
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2]

def contrast(first,second):
    light,dark=sorted((rgb_luminance(first),rgb_luminance(second)),reverse=True)
    return (light+.05)/(dark+.05)

def render(page,route):
    html=(SITE/route/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*>','<style>'+CSS+'</style>',html)
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
      practice_views=0
      for w in (320,390):
        page.set_viewport_size({'width':w,'height':900})
        for route in PRACTICE_ROUTES:
          render(page,route)
          props=page.evaluate('''() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
            wrappers:[...document.querySelectorAll('.article table')].map(table=>{const el=table.parentElement;return {
              wrapped:el?.classList.contains('table-wrap'),tabindex:el?.getAttribute('tabindex'),role:el?.getAttribute('role')}})})''')
          practice_views+=1
          if props['scroll']>props['width']: failures.append(f'{route}@{w}: scrollWidth={props["scroll"]}')
          for wrapper in props['wrappers']:
            if not wrapper['wrapped'] or wrapper['tabindex']!='0' or wrapper['role']!='group':
              failures.append(f'{route}@{w}: inaccessible or missing local table wrapper')
      render(page,'lesson/01-001')
      page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
      theme_colors={}
      for theme in ('light','dark'):
        page.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
        colors=page.evaluate('''()=>{const root=getComputedStyle(document.documentElement);return {
          background:root.getPropertyValue('--bg').trim(),
          surface:root.getPropertyValue('--bg2').trim(),
          foreground:root.getPropertyValue('--fg').trim(),
          muted:root.getPropertyValue('--muted').trim(),
          subtle:root.getPropertyValue('--subtle').trim(),
          accent:root.getPropertyValue('--accent').trim(),
          success:root.getPropertyValue('--success').trim(),
          warning:root.getPropertyValue('--warn').trim(),
          inverted:root.getPropertyValue('--inverted').trim()}}''')
        theme_colors[theme]=colors
        assert contrast(colors['foreground'],colors['background'])>=4.5,(theme,'foreground',colors)
        assert contrast(colors['muted'],colors['surface'])>=4.5,(theme,'muted',colors)
        assert contrast(colors['subtle'],colors['surface'])>=4.5,(theme,'subtle',colors)
        assert contrast(colors['accent'],colors['background'])>=4.5,(theme,'accent',colors)
        assert contrast(colors['success'],colors['surface'])>=4.5,(theme,'success',colors)
        assert contrast(colors['warning'],colors['surface'])>=4.5,(theme,'warning',colors)
        assert contrast(colors['inverted'],colors['foreground'])>=4.5,(theme,'inverted',colors)
        logo=page.locator('.side-top .brand-logo-dark' if theme=='dark' else '.side-top .brand-logo-light')
        assert logo.evaluate("el=>getComputedStyle(el).display")!='none',f'{theme} brand logo hidden'
      page.set_viewport_size({'width':320,'height':900})
      render(page,'practice/01-P01')
      table=page.evaluate('''()=>{const table=document.querySelector('.article table');const wrapper=table?.parentElement;return {table:!!table,wrapped:wrapper?.classList.contains('table-wrap')||false,client:wrapper?.clientWidth||0,scroll:wrapper?.scrollWidth||0,overflow:getComputedStyle(wrapper||document.body).overflowX}}''')
      assert table['table'] and table['wrapped'] and table['overflow']=='auto' and table['scroll']>table['client'],table
      wrapper=page.locator('.article .table-wrap').first
      assert wrapper.get_attribute('role')=='group' and wrapper.get_attribute('tabindex')=='0'
      wrapper.focus()
      assert wrapper.evaluate('el=>document.activeElement===el'),'Wide tables must be keyboard-focusable'
      render(page,'practice')
      row=page.locator('.entry-row').first
      layout=row.evaluate('''el=>{const box=s=>{const r=el.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {title:box('.itext'),number:box('.number'),status:box('[data-topic-status]'),arrow:box('.ic-right')}}''')
      assert layout['title']['bottom']<=layout['number']['top'],layout
      assert layout['title']['right']<layout['arrow']['left'],layout
      assert layout['number']['top']<=layout['status']['bottom'] and layout['status']['top']<=layout['number']['bottom'],layout
      assert row.evaluate("el=>el.getBoundingClientRect().height")>=68,layout
      render(page,'settings')
      setting=page.locator('.settings-row').first
      setting_layout=setting.evaluate('''el=>{const text=el.firstElementChild.getBoundingClientRect(),action=el.lastElementChild.getBoundingClientRect();return {textBottom:text.bottom,actionTop:action.top,actionHeight:action.height}}''')
      assert setting_layout['actionTop']>=setting_layout['textBottom'] and setting_layout['actionHeight']>=44,setting_layout
      render(page,'lesson/01-001')
      page.set_viewport_size({'width':768,'height':900})
      assert page.locator('.toc-disclosure').evaluate("el=>getComputedStyle(el).display")!='none'
      assert page.locator('.toc-disclosure summary').evaluate("el=>el.getBoundingClientRect().height")>=44
      page.set_viewport_size({'width':1440,'height':900})
      assert page.locator('.toc-disclosure').evaluate("el=>getComputedStyle(el).display")=='none'
      assert page.locator('.reader-aside').evaluate("el=>getComputedStyle(el).display")!='none'
      if failures:
        print('\n'.join(failures[:30]));raise AssertionError(f'{len(failures)} responsive failures')
      print(f'PASS: {count} representative responsive views ({len(ROUTES)} routes × 5 widths) and {practice_views} practice views (72 routes × 320/390px), zero document-level overflow')
      print('PASS: light/dark foreground, background and accessible link color tokens')
      print('PASS: accessible wide tables, title-first practice rows, stacked mobile actions and compact TOC')
      browser.close()
if __name__=='__main__':main()
