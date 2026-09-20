const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function trainer(storage = {}) {
  const nodes = new Map(), cleared = [];
  const element = () => ({style: {}, dataset: {}, children: [], listeners: {},
    classList: {add(){}, remove(){}, toggle(){}, contains(){return false;}},
    appendChild(child){this.children.push(child); if(child.id) nodes.set(child.id, child);}, focus(){}, setAttribute(){},
    addEventListener(name, callback){this.listeners[name] = callback;}});
  const context = vm.createContext({
    document: { getElementById(id){if(id === 'storageNotice') return nodes.get(id) || null; if(!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);},
      createElement: element, querySelectorAll: () => [], querySelector: () => null, body: element()},
    window: {addEventListener(){}}, CSS: {escape: value => value},
    localStorage: {getItem: key => storage[key] ?? null, setItem: (key, value) => {storage[key] = value;}},
    performance: {now: () => 1000}, setInterval: () => 42,
    clearInterval: id => cleared.push(id), setTimeout(){}, prompt: () => 'custom practice',
  });
  vm.runInContext(script, context);
  return {context, nodes, cleared};
}

test('malformed and wrong-shaped saved data do not prevent startup', () => {
  for (const value of ['{', 'null', '{}', '42', '"text"']) {
    const {context} = trainer({wpmHist: value, wpmKeyErr: value});
    assert.equal(vm.runInContext('getHist().length', context), 0);
    assert.equal(vm.runInContext('Object.keys(getKeyErrors()).length', context), 0);
  }
});

test('invalid entries are discarded while valid history and key counts survive', () => {
  const {context} = trainer({wpmHist: JSON.stringify([null, {wpm:'bad',acc:80}, {wpm:55,acc:98}]),
    wpmKeyErr: JSON.stringify({a: 3, b: -1, c: '2', d: null})});
  assert.equal(vm.runInContext('getHist().length', context), 1);
  assert.equal(vm.runInContext('JSON.stringify(getKeyErrors())', context), '{"a":3}');
});

test('blocked writes do not interrupt errors or completion', () => {
  const {context, nodes} = trainer();
  context.localStorage.setItem = () => {throw new Error('Storage blocked');};
  assert.doesNotThrow(() => context.logKeyError('a'));
  assert.doesNotThrow(() => context.saveResult(45, 95));
  assert.equal(vm.runInContext('getHist()[0].wpm', context), 45);
  assert.equal(vm.runInContext('getKeyErrors().a', context), 1);
  assert.match(nodes.get('storageNotice').textContent, /session only/);
});

test('blocked reads return usable defaults', () => {
  const {context} = trainer();
  context.localStorage.getItem = () => {throw new Error('Storage blocked');};
  assert.doesNotThrow(() => context.refreshProgress());
  assert.equal(vm.runInContext('getHist().length', context), 0);
});

test('cancelling custom text keeps the current timer running', () => {
  const {context, nodes, cleared} = trainer();
  context.start();
  context.prompt = () => null;
  nodes.get('customBtn').listeners.click();
  assert.equal(cleared.includes(42), false);
  assert.equal(vm.runInContext('started', context), true);
});

test('custom text stops the old timer and resets the test', () => {
  const {context, nodes, cleared} = trainer();
  context.start();
  nodes.get('customBtn').listeners.click();
  assert.ok(cleared.includes(42));
  assert.equal(vm.runInContext('started', context), false);
  assert.equal(vm.runInContext('target', context), 'custom practice');
  assert.equal(nodes.get('time').textContent, 30);
});

test('keyboard shortcuts and IME composition do not start or score a test', () => {
  for (const extra of [{ctrlKey: true}, {metaKey: true}, {isComposing: true}]) {
    const {context, nodes} = trainer();
    let prevented = false;
    nodes.get('box').listeners.keydown({key: 'a', ...extra,
      preventDefault(){prevented = true;}});
    assert.equal(vm.runInContext('started', context), false);
    assert.equal(vm.runInContext('typed', context), 0);
    assert.equal(prevented, false);
  }
});

test('ordinary typing and AltGraph input still reach the trainer', () => {
  for (const extra of [{}, {ctrlKey: true, altKey: true, getModifierState: key => key === 'AltGraph'}]) {
    const {context, nodes} = trainer();
    nodes.get('box').listeners.keydown({key: 'a', ...extra, preventDefault(){}});
    assert.equal(vm.runInContext('started', context), true);
    assert.equal(vm.runInContext('typed', context), 1);
  }
});
