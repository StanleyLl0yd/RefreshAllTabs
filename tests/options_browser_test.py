"""Run with python tests/options_browser_test.py (requires Playwright and Chromium)."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
URL='http://rat.test/options.html'

def test_locale(browser, locale, stored):
    messages=json.loads((ROOT/'_locales'/locale/'messages.json').read_text(encoding='utf-8'))
    context=browser.new_context()
    page=context.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content((ROOT/'options.html').read_text(encoding='utf-8'))
    # Even if scripts fail to load, the tab must not show __MSG_...__.
    assert page.title()=='Refresh All Tabs - Settings'
    # Inject a chrome API stub to test the actual UI in Chromium's DOM.
    page.evaluate("""({locale, messages, values}) => {
      const memory={...values};
      window.__testMemory=memory;
      window.chrome={
        i18n: {getUILanguage:()=>locale,getMessage:(key)=>messages[key]?.message || ''},
        storage:{sync:{get:async(defaults)=>({...defaults,...memory}),set:async(next)=>Object.assign(memory,next)}}
      };
    }""", {"locale":locale,"messages":messages,"values":stored})
    page.add_script_tag(content=(ROOT/'exclusions.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT/'options.js').read_text(encoding='utf-8'))
    page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
    page.wait_for_function("document.querySelector('#auto-refresh-interval').value !== ''")
    assert page.title()==messages['optionsTitle']['message'], (locale,page.title())
    assert page.locator('.note').get_by_text(messages['optExcludeHint']['message'], exact=True).count()==1
    assert page.locator('html').get_attribute('lang')==locale.replace('_','-')
    assert page.locator('html').get_attribute('dir')==('rtl' if locale=='ar' else 'ltr')
    assert page.locator('input[name="refresh-mode"]:checked').input_value()==stored.get('refreshMode','all-tabs')
    assert page.locator('#auto-refresh-enabled').is_checked()==stored.get('autoRefreshEnabled',False)
    assert page.locator('#excluded-domains').input_value() == '\n'.join(stored.get('excludedDomains', []))
    page.locator('#excluded-domains').fill('chatgpt.com\nhttps://example.org/a\n*.chatgpt.com')
    page.locator('#auto-refresh-interval').fill('7')
    page.locator('input[name="refresh-mode"][value="current-window"]').check()
    if not page.locator('#auto-refresh-enabled').is_checked():
        page.locator('#auto-refresh-enabled').check()
    page.locator('#save-button').click()
    page.get_by_role('status').get_by_text(messages['optSavedStatus']['message']).wait_for()
    values=page.evaluate('window.__testMemory')
    assert values['refreshMode']=='current-window', values
    assert values['autoRefreshEnabled'] is True, values
    assert values['autoRefreshIntervalMinutes']==7, values
    assert values['excludedDomains']==['chatgpt.com','example.org'], values
    page.locator('#excluded-domains').fill('ftp://forbidden.example')
    page.locator('#save-button').click()
    page.get_by_role('status').get_by_text(messages['optExcludeInvalid']['message'], exact=False).wait_for()
    assert page.evaluate('window.__testMemory')['excludedDomains']==['chatgpt.com','example.org']
    page.locator('#excluded-domains').fill('')
    page.locator('#save-button').click()
    page.get_by_role('status').get_by_text(messages['optSavedStatus']['message']).wait_for()
    assert page.evaluate('window.__testMemory')['excludedDomains']==[]
    assert not errors, errors
    context.close()


def test_missing_title_translation(browser):
    context=browser.new_context()
    page=context.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content((ROOT/'options.html').read_text(encoding='utf-8'))
    messages=json.loads((ROOT/'_locales'/'en'/'messages.json').read_text(encoding='utf-8'))
    messages.pop('optionsTitle')
    page.evaluate("""(messages) => {
      window.chrome={
        i18n: {getUILanguage:()=> 'en',getMessage:(key)=>messages[key]?.message || ''},
        storage:{sync:{get:async(defaults)=>defaults,set:async()=>{}}}
      };
    }""", messages)
    page.add_script_tag(content=(ROOT/'exclusions.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT/'options.js').read_text(encoding='utf-8'))
    page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
    assert page.title()=='Refresh All Tabs - Settings'
    assert not errors, errors
    context.close()

if __name__ == '__main__':
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        for locale, data in [('en',{}),('ru',{'refreshMode':'current-tab','autoRefreshEnabled':True,'autoRefreshIntervalMinutes':15,'excludedDomains':['chatgpt.com']}),('ar',{})]:
            test_locale(browser,locale,data)
            print('PASS',locale,'localization/settings/save')
        test_missing_title_translation(browser)
        print('PASS missing title translation fallback')
        browser.close()
