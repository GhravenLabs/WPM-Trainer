const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function trainer(storage = {}) {
  const nodes = new Map(), cleared = [];
  const element = () => {const classes = new Set(); return ({style: {}, dataset: {}, children: [], listeners: {},
    classList: {add(...names){names.forEach(n => classes.add(n));}, remove(...names){names.forEach(n => classes.delete(n));}, toggle(){}, contains(n){return classes.has(n);}},
    appendChild(child){this.children.push(child); if(child.id) nodes.set(child.id, child);}, remove(){this.removed = true;}, focus(){}, setAttribute(){},
    addEventListener(name, callback){this.listeners[name] = callback;}});};
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

test('expired tests reject input even before the delayed timer callback runs', () => {
  for (const lateKey of ['b', 'Backspace']) {
    const {context, nodes} = trainer();
    context.prompt = () => 'abc';
    nodes.get('customBtn').listeners.click();
    const type = key => nodes.get('box').listeners.keydown({key, preventDefault(){}});
    type('a');
    context.performance.now = () => 31000; // Exactly the 30-second deadline.
    type(lateKey);
    assert.equal(vm.runInContext('finished', context), true);
    assert.equal(vm.runInContext('typed', context), 1);
    assert.equal(vm.runInContext('correct', context), 1);
    assert.equal(nodes.get('time').textContent, 0);
    assert.equal(vm.runInContext('getHist().length', context), 1);
  }
});

test('delayed completion scores only the configured duration', () => {
  const {context, nodes} = trainer();
  context.start();
  vm.runInContext('correct = 50; correctAttempts = 50; typed = 50;', context);
  context.performance.now = () => 61000;
  context.finish();
  assert.equal(vm.runInContext('getHist().at(-1).wpm', context), 20);
  assert.equal(nodes.get('wpm').textContent, 20);
});

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

test('multiline custom text can be completed with ordinary spaces', () => {
  const {context, nodes} = trainer();
  context.prompt = () => '  alpha\r\n beta\tgamma\u00a0delta  ';
  nodes.get('customBtn').listeners.click();
  assert.equal(vm.runInContext('target', context), 'alpha beta gamma delta');
  for (const key of 'alpha beta gamma delta') {
    nodes.get('box').listeners.keydown({key, preventDefault(){}});
  }
  assert.equal(vm.runInContext('finished', context), true);
  assert.equal(vm.runInContext('errors', context), 0);
  assert.equal(vm.runInContext('getHist().at(-1).acc', context), 100);
});

test('whitespace-only custom text keeps the current session intact', () => {
  const {context, nodes, cleared} = trainer();
  context.start();
  const previousTarget = vm.runInContext('target', context);
  context.prompt = () => '\r\n\t\u00a0';
  nodes.get('customBtn').listeners.click();
  assert.equal(vm.runInContext('target', context), previousTarget);
  assert.equal(vm.runInContext('started', context), true);
  assert.equal(cleared.includes(42), false);
});

test('Tab dismisses the result overlay before restarting practice', () => {
  const {context, nodes} = trainer();
  context.start();
  context.finish();
  const overlay = context.document.body.children.find(el => el.className === 'overlay');
  assert.ok(overlay);
  nodes.get('box').listeners.keydown({key: 'Tab', preventDefault(){}});
  assert.equal(overlay.removed, true);
  assert.equal(vm.runInContext('finished', context), false);
  assert.equal(vm.runInContext('started', context), false);
  assert.equal(vm.runInContext('getHist().length', context), 1);
  nodes.get('box').listeners.keydown({key: 'a', preventDefault(){}});
  assert.equal(vm.runInContext('started', context), true);
});

test('clicking Go again dismisses the result and resets practice', () => {
  const {context} = trainer();
  context.start();
  context.finish();
  const overlay = context.document.body.children.find(el => el.className === 'overlay');
  overlay.listeners.click({target: {id: 'again'}});
  assert.equal(overlay.removed, true);
  assert.equal(vm.runInContext('finished', context), false);
  assert.equal(vm.runInContext('started', context), false);
});

test('backspacing and retyping cannot inflate completed-character WPM', () => {
  const {context, nodes} = trainer();
  context.prompt = () => 'abc';
  nodes.get('customBtn').listeners.click();
  const type = key => nodes.get('box').listeners.keydown({key, preventDefault(){}});
  type('a');
  context.performance.now = () => 11000;
  type('Backspace');
  assert.equal(nodes.get('wpm').textContent, 0);
  for (let i = 0; i < 10; i++) {type('a'); type('Backspace');}
  type('a'); type('b'); type('c');
  assert.equal(vm.runInContext('getHist().at(-1).wpm', context), 4);
  assert.equal(vm.runInContext('getHist().at(-1).acc', context), 100);
});

test('correcting a mistake preserves attempt accuracy and error history', () => {
  const {context, nodes} = trainer();
  context.prompt = () => 'ab';
  nodes.get('customBtn').listeners.click();
  for (const key of ['x', 'Backspace', 'a', 'b']) {
    nodes.get('box').listeners.keydown({key, preventDefault(){}});
  }
  assert.equal(vm.runInContext('getHist().at(-1).acc', context), 67);
  assert.equal(vm.runInContext('errors', context), 1);
  assert.equal(vm.runInContext('getKeyErrors().a', context), 1);
});
