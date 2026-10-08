"""Regression: final-project notes must survive a real v2 backup round trip.

This runs against the generated HTML and actual browser application script in a
Chromium DOM. It does not claim to replace origin-based Playwright E2E.
"""
import json
from playwright.sync_api import sync_playwright
from browser_helpers import launch_chromium
from test_user_data_embedded import load, upload_json, get_state


def main():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page()
        load(page, 'final-project')
        field = page.locator('[data-note="FINAL_PROJECT"]')
        assert field.count() == 1, 'The final project must have editable notes'
        field.fill('Мой итоговый проект: нашёл подходящую компанию.')
        page.wait_for_timeout(650)
        notes = page.evaluate("localStorage.getItem('sales-os-note-FINAL_PROJECT')")
        assert notes == 'Мой итоговый проект: нашёл подходящую компанию.'
        initial = page.evaluate('window.__testStorage')
        page.close()

        page = browser.new_page()
        load(page, 'settings', initial)
        backup = {'format': 'sales-os-v2', 'version': 2,
                  'lessonStatuses': {'01-001': 'theory_completed'},
                  'practiceStatuses': {'01-P01': 'completed'},
                  'bookmarks': ['01-001'],
                  'notes': {'FINAL_PROJECT': notes, '01-001': 'Тестовая заметка'}}
        upload_json(page, backup)
        assert get_state(page)['lessonStatuses']['01-001'] == 'theory_completed'
        assert page.evaluate("localStorage.getItem('sales-os-note-FINAL_PROJECT')") == notes
        assert 'Импорт завершён и сохранён на этом устройстве' in page.locator('#toast').inner_text()
        print('PASS: standalone final project note survives validated v2 import')

        # Prototype keys are not real lesson/answer IDs. Reject them instead of
        # allowing Object.prototype properties through permissive lookups.
        for malicious in [
            {'format':'sales-os-v2','version':2,'lessonStatuses':{},'practiceStatuses':{},
             'bookmarks':['constructor'],'notes':{}},
            {'format':'sales-os-v2','version':2,'lessonStatuses':{},'practiceStatuses':{},
             'bookmarks':[],'notes':{'constructor':'should be rejected'}}]:
            upload_json(page, malicious)
            assert 'Импорт не удался' in page.locator('#toast').inner_text()
            assert page.evaluate("localStorage.getItem('sales-os-note-FINAL_PROJECT')") == notes
        print('PASS: inherited JavaScript property names rejected as backup IDs')

        valid_state = page.evaluate('window.__testStorage')
        page.close()
        page = browser.new_page()
        load(page, 'final-project', valid_state)
        assert page.locator('[data-note="FINAL_PROJECT"]').input_value() == notes
        print('PASS: final project note restored on another page load')
        page.close()
        browser.close()


if __name__ == '__main__':
    main()
