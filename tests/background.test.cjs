'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const baseTabs = [
  {id:1, windowId:10, active:true, url:'https://example.com/a'},
  {id:2, windowId:10, active:false, url:'https://example.com/b'},
  {id:3, windowId:20, active:true, url:'http://example.net/'},
  {id:4, windowId:20, active:false, url:'chrome://settings/'},
  {id:5, windowId:20, active:false, url:'chrome-extension://x/options.html'},
  {id:6, windowId:20, active:false, url:'edge://newtab/'},
  {id:7, windowId:20, active:false, url:'https://extension.invalid/'},
  {id:8, windowId:10, active:false, url:'file:///tmp/sample.html'},
  {id:9, windowId:10, active:false, url:'about:blank'}
];

function makeHarness(options={}) {
  const listeners={};
  const storage={autoRefreshEnabled:false,autoRefreshIntervalMinutes:5,refreshMode:'all-tabs',...options.storage};
  const tabs=structuredClone(options.tabs??baseTabs);
  const state={storage,tabs,reloaded:[],errors:[],warnings:[],alarms:new Map(),menus:new Map(),lastFocusedId:options.lastFocusedId===undefined?10:options.lastFocusedId,
    maxConcurrent:0, concurrent:0};
  const event=(key)=>({addListener(fn){listeners[key]=fn;}});
  const chrome={
    runtime:{lastError:null,onInstalled:event('installed'),onStartup:event('startup'),
      async openOptionsPage(){state.optionsOpened=true;}},
    action:{onClicked:event('clicked')},
    commands:{onCommand:event('command')},
    contextMenus:{
      onClicked:event('menu'),
      async removeAll(){state.menus.clear();},
      create(prop, cb){state.menus.set(prop.id,prop);queueMicrotask(cb);return prop.id;}
    },
    i18n:{getMessage:key=>key},
    windows:{async getLastFocused(){
      if (options.focusError) throw new Error('No focused browser window');
      return state.lastFocusedId==null?{}:{id:state.lastFocusedId,type:'normal'};
    }},
    tabs:{
      async query(query){
        if (query.windowId!==undefined)return structuredClone(tabs.filter(t=>t.windowId===query.windowId&&t.active===true));
        return structuredClone(tabs);
      },
      async reload(id){
        state.concurrent++;
        state.maxConcurrent=Math.max(state.maxConcurrent,state.concurrent);
        try {
          if (options.reloadDelay) await new Promise(r=>setTimeout(r,2));
          if (options.rejectTab===id)throw new Error('Tab closed');
          state.reloaded.push(id);
        } finally {state.concurrent--;}
      }
    },
    storage:{
      sync:{
        async get(defaults){return {...defaults,...storage};},
        async set(values){
          const changes={};
          for(const [k,v] of Object.entries(values)){
            if(storage[k]!==v)changes[k]={oldValue:storage[k],newValue:v};
            storage[k]=v;
          }
          if(Object.keys(changes).length)listeners.storageChanged?.(changes,'sync');
        }
      },
      onChanged:event('storageChanged')
    },
    alarms:{
      onAlarm:event('alarm'),
      async get(name){return state.alarms.get(name)??null;},
      async clear(name){return state.alarms.delete(name);},
      async create(name, info){state.alarms.set(name,{name,...info});}
    }
  };
  const context=vm.createContext({chrome,URL,console:{error:(...a)=>state.errors.push(a),warn:(...a)=>state.warnings.push(a),log:()=>{}},Promise,Set,Array,Number,Math});
  context.importScripts=(filename)=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),context,{filename});
  vm.runInContext(script,context,{filename:'background.js'});
  return {state,listeners,context,run:(src)=>vm.runInContext(src,context)};
}

test('all-tabs reloads normal http, https, and file tabs, but skips internal pages',async()=>{
  const h=makeHarness(); await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,2,3,7,8]);
});
test('current-window uses the clicked tab window, not last focused window',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-window'},lastFocusedId:20});
  await h.run('runRefresh({id:2,windowId:10})');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,2,8]);
});
test('current-tab reloads only the selected tab',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab'},lastFocusedId:20});
  await h.run('runRefresh({id:1,windowId:10})');
  assert.deepEqual(h.state.reloaded,[1]);
});
test('all-except-current excludes precisely one selected tab',async()=>{
  const h=makeHarness({storage:{refreshMode:'all-except-current'},lastFocusedId:10});
  await h.run('runRefresh({id:3,windowId:20})');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,2,7,8]);
});
test('auto mode finds the last focused normal window active tab',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab'},lastFocusedId:20});
  await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded,[3]);
});
test('missing active window fails closed instead of refreshing all tabs',async()=>{
  for(const mode of ['current-window','current-tab','all-except-current']){
    const h=makeHarness({storage:{refreshMode:mode},lastFocusedId:null});
    await h.run('runRefresh()');assert.deepEqual(h.state.reloaded,[]);
  }
});
test('lookup error fails closed',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab'},focusError:true});
  await h.run('runRefresh()');assert.deepEqual(h.state.reloaded,[]);assert.equal(h.state.errors.length,1);
});
test('invalid mode falls back to all tabs',async()=>{
  const h=makeHarness({storage:{refreshMode:'invalid-value'}});
  await h.run('runRefresh()');assert.equal(h.state.reloaded.length,5);
});
test('per-tab failure does not prevent later tabs from refreshing',async()=>{
  const h=makeHarness({rejectTab:2});await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,3,7,8]);
  assert.equal(h.state.warnings.length,1);
});
test('limits parallel reloading to 4',async()=>{
  const tabs=Array.from({length:25},(_,i)=>({id:i+1,windowId:10,url:`https://example.org/${i}`}));
  const h=makeHarness({tabs,reloadDelay:true});await h.run('runRefresh()');
  assert.equal(h.state.reloaded.length,25);assert.ok(h.state.maxConcurrent<=4);
});
test('timer enabled, updated, disabled, and invalid interval sanitized',async()=>{
  const h=makeHarness({storage:{autoRefreshEnabled:true,autoRefreshIntervalMinutes:5}});
  await h.run('reconcileAlarm()');
  assert.equal(h.state.alarms.get('auto-refresh-all-tabs').periodInMinutes,5);
  h.state.storage.autoRefreshIntervalMinutes=120;
  await h.run('reconcileAlarm()');
  assert.equal(h.state.alarms.get('auto-refresh-all-tabs').periodInMinutes,120);
  h.state.storage.autoRefreshIntervalMinutes=Infinity;
  await h.run('reconcileAlarm()');
  assert.equal(h.state.alarms.get('auto-refresh-all-tabs').periodInMinutes,5);
  h.state.storage.autoRefreshEnabled=false;
  await h.run('reconcileAlarm()');
  assert.equal(h.state.alarms.size,0);
});
test('installation builds three localized context menu items and restores timer',async()=>{
  const h=makeHarness({storage:{autoRefreshEnabled:true}});
  await h.run('initialize()');
  assert.deepEqual([...h.state.menus.keys()],['enable-auto-refresh','disable-auto-refresh','open-options']);
  assert.equal(h.state.alarms.size,1);
});
test('timer event does not refresh when disabled',async()=>{
  const h=makeHarness();
  h.listeners.alarm({name:'auto-refresh-all-tabs'});
  await new Promise(r=>setTimeout(r,4));
  assert.deepEqual(h.state.reloaded,[]);
});
test('commands route a tab to refresh operation',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab'}});
  h.listeners.command('refresh-all-tabs',{id:3,windowId:20});
  await new Promise(r=>setTimeout(r,4));
  assert.deepEqual(h.state.reloaded,[3]);
});
test('skip non-URL and non-integer tab IDs and accept pending http URL',async()=>{
  const h=makeHarness({tabs:[
    {id:0,windowId:10,pendingUrl:'https://example.test'},
    {id:8,windowId:10,url:'javascript:alert(1)'},
    {id:null,windowId:10,url:'https://example.test'},
    {id:9,windowId:10,url:''}
  ]});
  await h.run('runRefresh()');assert.deepEqual(h.state.reloaded,[0]);
});
test('concurrent refresh operations never overlap',async()=>{
  const tabs=Array.from({length:10},(_,i)=>({id:i+1,windowId:10,url:'https://a.test'}));
  const h=makeHarness({tabs,reloadDelay:true});
  await Promise.all([h.run('runRefresh()'),h.run('runRefresh()')]);
  assert.equal(h.state.reloaded.length,10);
});

test('context menu switches timer on and off and preserves interval',async()=>{
  const h=makeHarness({storage:{autoRefreshIntervalMinutes:9}});
  h.listeners.menu({menuItemId:'enable-auto-refresh'});
  await new Promise(r=>setTimeout(r,8));
  assert.equal(h.state.storage.autoRefreshEnabled,true);
  assert.equal(h.state.storage.autoRefreshIntervalMinutes,9);
  assert.equal(h.state.alarms.get('auto-refresh-all-tabs').periodInMinutes,9);
  h.listeners.menu({menuItemId:'disable-auto-refresh'});
  await new Promise(r=>setTimeout(r,8));
  assert.equal(h.state.storage.autoRefreshEnabled,false);
  assert.equal(h.state.alarms.size,0);
});
test('sync setting updates reconfigure active timer',async()=>{
  const h=makeHarness({storage:{autoRefreshEnabled:true,autoRefreshIntervalMinutes:5}});
  await h.run('reconcileAlarm()');
  h.state.storage.autoRefreshIntervalMinutes=12;
  h.listeners.storageChanged({autoRefreshIntervalMinutes:{oldValue:5,newValue:12}},'sync');
  await h.run('alarmUpdateQueue');
  assert.equal(h.state.alarms.get('auto-refresh-all-tabs').periodInMinutes,12);
});
test('alarm event refreshes when enabled',async()=>{
  const h=makeHarness({storage:{autoRefreshEnabled:true,refreshMode:'current-tab'}});
  h.listeners.alarm({name:'auto-refresh-all-tabs'});
  await new Promise(r=>setTimeout(r,7));
  assert.deepEqual(h.state.reloaded,[1]);
});
test('missing preferred tab is handled by last focused window',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab'},lastFocusedId:20});
  await h.run('runRefresh({id:null,windowId:10})');
  assert.deepEqual(h.state.reloaded,[3]);
});


test('excludes five chatgpt tabs from twenty in all-tabs mode',async()=>{
  const tabs=Array.from({length:20},(_,i)=>({id:i+1,windowId:10,active:i===0,
    url:i<5?`https://chatgpt.com/c/${i}`:`https://site${i}.example/path`}));
  const h=makeHarness({tabs,storage:{excludedDomains:['chatgpt.com']}});
  await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),Array.from({length:15},(_,i)=>i+6));
});

test('excludes listed domains in all-except-current mode without including current tab',async()=>{
  const tabs=[
    {id:1,windowId:10,active:true,url:'https://example.net/'},
    {id:2,windowId:10,url:'https://chatgpt.com/c/123'},
    {id:3,windowId:10,url:'https://sub.chatgpt.com/'},
    {id:4,windowId:10,url:'https://notchatgpt.com/'},
    {id:5,windowId:10,url:'https://example.org/'},
    {id:6,windowId:10,url:'https://chatgpt.com.evil.example/'},
  ];
  const h=makeHarness({tabs,storage:{refreshMode:'all-except-current',excludedDomains:['chatgpt.com']}});
  await h.run('runRefresh({id:1,windowId:10})');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[4,5,6]);
});

test('current-window excludes matching websites but refreshes other tabs in that window',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-window',excludedDomains:['example.com']}});
  await h.run('runRefresh({id:1,windowId:10})');
  assert.deepEqual(h.state.reloaded,[8]); // two example.com tabs excluded; file tab remains
});

test('current-tab skips refresh when the active website is excluded',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab',excludedDomains:['example.com']}});
  await h.run('runRefresh({id:1,windowId:10})');
  assert.deepEqual(h.state.reloaded,[]);
});

test('current-tab refreshes a non-excluded active website as usual',async()=>{
  const h=makeHarness({storage:{refreshMode:'current-tab',excludedDomains:['example.com']}});
  await h.run('runRefresh({id:3,windowId:20})');
  assert.deepEqual(h.state.reloaded,[3]);
});

test('all four modes honor exclusions even when the current tab is excluded',async()=>{
  const expected={
    'all-tabs':[3,7,8],
    'all-except-current':[3,7,8],
    'current-window':[8],
    'current-tab':[],
  };
  for(const [mode, allowed] of Object.entries(expected)) {
    const h=makeHarness({storage:{refreshMode:mode,excludedDomains:['example.com']}});
    await h.run('runRefresh({id:1,windowId:10})');
    assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),allowed,mode);
  }
});

test('all four modes preserve original tab selection when exclusions are empty',async()=>{
  const expected={
    'all-tabs':[1,2,3,7,8],
    'all-except-current':[2,3,7,8],
    'current-window':[1,2,8],
    'current-tab':[1]
  };
  for(const [mode, allowed] of Object.entries(expected)) {
    const h=makeHarness({storage:{refreshMode:mode,excludedDomains:[]}});
    await h.run('runRefresh({id:1,windowId:10})');
    assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),allowed,mode);
  }
});

test('all four modes skip tabs navigating to an excluded site',async()=>{
  const tabs=[
    {id:1,windowId:10,active:true,url:'https://safe.example/',pendingUrl:'https://chatgpt.com/c/new'},
    {id:2,windowId:10,url:'https://other.example/'},
    {id:3,windowId:20,active:true,url:'https://chatgpt.com/'},
    {id:4,windowId:20,url:'https://another.example/'}
  ];
  const expected={
    'all-tabs':[2,4],
    'all-except-current':[2,4],
    'current-window':[2],
    'current-tab':[]
  };
  for(const [mode, allowed] of Object.entries(expected)) {
    const h=makeHarness({tabs,storage:{refreshMode:mode,excludedDomains:['chatgpt.com']}});
    await h.run('runRefresh({id:1,windowId:10})');
    assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),allowed,mode);
  }
});

test('timer applies exclusions to current-window and current-tab modes',async()=>{
  for(const mode of ['current-window','current-tab']) {
    const h=makeHarness({storage:{autoRefreshEnabled:true,refreshMode:mode,excludedDomains:['example.com']}});
    h.listeners.alarm({name:'auto-refresh-all-tabs'});
    await new Promise(r=>setTimeout(r,15));
    assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),mode==='current-window'?[8]:[],mode);
  }
});

test('old users with no exclusion settings retain old refresh behavior',async()=>{
  const h=makeHarness();await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,2,3,7,8]);
});

test('exclusions include subdomains and IDN, but not deceptive or partial hostnames',async()=>{
  const h=makeHarness({tabs:[
    {id:1,windowId:10,url:'https://CHATGPT.com/'},
    {id:2,windowId:10,url:'https://api.chatgpt.com/'},
    {id:3,windowId:10,url:'https://notchatgpt.com/'},
    {id:4,windowId:10,url:'https://chatgpt.com.evil.example/'},
    {id:5,windowId:10,url:'https://пример.рф/'},
    {id:6,windowId:10,url:'https://other.example/'},
  ],storage:{excludedDomains:['ChatGPT.COM','пример.рф']}});
  await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[3,4,6]);
});

test('pending excluded navigation is not refreshed even if prior URL was allowed',async()=>{
  const h=makeHarness({tabs:[
    {id:1,windowId:10,url:'https://safe.example',pendingUrl:'https://chatgpt.com/'},
    {id:2,windowId:10,url:'https://other.example'},
  ],storage:{excludedDomains:['chatgpt.com']}});
  await h.run('runRefresh()');
  assert.deepEqual(h.state.reloaded,[2]);
});

test('invalid stored exclusion data cannot break or block all tab refreshes',async()=>{
  for(const data of [null,{},true,['not allowed URL','ftp://chatgpt.com',null,42]]) {
    const h=makeHarness({storage:{excludedDomains:data}});
    await h.run('runRefresh()');
    assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[1,2,3,7,8]);
  }
});

test('URL normalization validates schemes, credentials, ports, wildcards and duplicate domains',()=>{
  const h=makeHarness();
  const result=h.run('RefreshExclusions.parseInput("https://chatgpt.com/c/23\\n*.CHATGPT.com, https://example.org:8443/x,пример.рф")');
  assert.equal(result.error,null);
  assert.equal(result.domains.length,3);
  assert.equal(result.domains[0],'chatgpt.com');
  assert.equal(result.domains[1],'example.org');
  assert.equal(result.domains[2],'xn--e1afmkfd.xn--p1ai');
  for(const input of ['ftp://example.org','http://user:pass@example.org','something .org',
      'https://','https://-bad.example','javascript://example.org']) {
    assert.equal(h.run(`RefreshExclusions.parseInput(${JSON.stringify(input)}).error`),'invalid',input);
  }
  assert.equal(h.run('RefreshExclusions.parseInput(Array.from({length:101},(_,i)=>`example${i}.org`).join("\\n")).error'),'limit');
});

test('auto-refresh also observes excluded domains',async()=>{
  const h=makeHarness({storage:{autoRefreshEnabled:true,excludedDomains:['example.com']}});
  h.listeners.alarm({name:'auto-refresh-all-tabs'});
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(h.state.reloaded.sort((a,b)=>a-b),[3,7,8]);
});
