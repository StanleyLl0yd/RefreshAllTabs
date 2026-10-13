'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const html=fs.readFileSync(path.join(root,'options.html'),'utf8');
const js=fs.readFileSync(path.join(root,'options.js'),'utf8');
const locales=fs.readdirSync(path.join(root,'_locales'));

test('valid MV3 manifest and permissions without host access',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.version,'1.9');
  assert.equal(manifest.background.service_worker,'background.js');
  assert.deepEqual(manifest.permissions,['tabs','contextMenus','alarms','storage']);
  assert.ok(!manifest.host_permissions);
});
test('supported locale directories have complete message catalogs',()=>{
  assert.equal(locales.length,19);
  assert.ok(locales.includes('pt_BR')&&locales.includes('zh_CN')&&locales.includes('no')&&locales.includes('pt_PT')&&locales.includes('zh_TW'));
  const messages=Object.fromEntries(locales.map(loc=>[loc,JSON.parse(fs.readFileSync(path.join(root,'_locales',loc,'messages.json')))]));
  const keys=Object.keys(messages.en).sort();
  for(const [loc,data] of Object.entries(messages)){
    assert.deepEqual(Object.keys(data).sort(),keys,`locale ${loc}`);
    for(const [k,v] of Object.entries(data)){
      assert.equal(typeof v.message,'string',`${loc}/${k}`);
      assert.ok(v.message.length>0,`${loc}/${k}`);
    }
  }
  for(const key of [...html.matchAll(/__MSG_(\w+)__/g)].map(x=>x[1]))assert.ok(messages.en[key],key);
  for(const key of [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(x=>x[1]))assert.ok(messages.en[key],key);
});
test('options title is readable before scripts run and translated explicitly after load',()=>{
  assert.match(html,/<title>Refresh All Tabs - Settings<\/title>/);
  assert.doesNotMatch(html,/<title>__MSG_/);
  assert.match(js,/document\.title\s*=\s*chrome\.i18n\.getMessage\("optionsTitle"\)/);
});
test('options UI exposes 4 modes, interval bounds, save action, a status role',()=>{
  assert.equal((html.match(/name="refresh-mode"/g)||[]).length,4);
  assert.match(html,/min="1" max="1440"/);
  assert.match(html,/role="status"/);
  assert.match(js,/document\.documentElement\.lang/);
  assert.match(js,/document\.documentElement\.dir/);
});


test('exclusion UI shares its parser with background and no extra permissions',()=>{
  const bg=fs.readFileSync(path.join(root,'background.js'),'utf8');
  const parser=fs.readFileSync(path.join(root,'exclusions.js'),'utf8');
  assert.match(html,/id="excluded-domains"/);
  assert.match(html,/<script src="exclusions.js"><\/script>/);
  assert.match(bg,/importScripts\("exclusions.js"\)/);
  assert.match(js,/RefreshExclusions\.parseInput/);
  assert.match(parser,/matchesTab/);
  assert.deepEqual(manifest.permissions,['tabs','contextMenus','alarms','storage']);
});


test('site exclusions are applied before mode-specific selection for all four modes',()=>{
  const bg=fs.readFileSync(path.join(root,'background.js'),'utf8');
  assert.match(bg,/if \(RefreshExclusions\.matchesTab\(tab, exclusions\)\) return false;/);
  const selection=bg.slice(bg.indexOf('const selected = tabs.filter'),bg.indexOf('await reloadTabs(selected)'));
  assert.ok(selection.indexOf('RefreshExclusions.matchesTab') < selection.indexOf('mode === "current-tab"'));
  for (const locale of locales) {
    const messages=JSON.parse(fs.readFileSync(path.join(root,'_locales',locale,'messages.json')));
    assert.ok(messages.optExcludeHint.message.trim().length>0);
  }
});
