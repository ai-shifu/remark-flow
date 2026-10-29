import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const merge = require('../../vendor/deepmerge');
const payload = () => JSON.parse('{"__proto__":{"admin":true}}');

function assertUnpoisoned(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.admin, undefined);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal({}.admin, undefined);
}

test('Jest resolves the checked-in security fork', () => {
  const jestRequire = createRequire(require.resolve('jest-config'));
  const expected = fileURLToPath(
    new URL('../../vendor/deepmerge/index.js', import.meta.url)
  );
  assert.equal(realpathSync(jestRequire.resolve('deepmerge')), expected);
  assert.equal(jestRequire('deepmerge'), merge);
});

test('rejects source poisoning for null-prototype and own-key targets', () => {
  for (const target of [{}, Object.create(null), payload()]) {
    const result = merge(target, payload());
    assertUnpoisoned(result);
    assert.deepEqual(Object.keys(result), []);
  }
});

test('rejects nested poisoning with null, undefined, primitive and object targets', () => {
  for (const session of [
    null,
    undefined,
    false,
    0,
    '',
    {},
    Object.create(null),
  ]) {
    const result = merge({ session }, { session: payload() });
    assertUnpoisoned(result);
    assertUnpoisoned(result.session);
  }
});

test('rejects poisoned keys copied from the target, including nested arrays', () => {
  const result = merge(
    { ...payload(), session: payload(), sessions: [payload()] },
    { allowed: true }
  );
  assertUnpoisoned(result);
  assertUnpoisoned(result.session);
  assertUnpoisoned(result.sessions[0]);
  assert.equal(result.allowed, true);
});

test('rejects poisoning through source cloning and merge.all', () => {
  assertUnpoisoned(merge([], payload()));
  const result = merge.all([{ session: null }, { session: payload() }]);
  assertUnpoisoned(result.session);
  assertUnpoisoned(merge({}, { sessions: [payload()] }).sessions[0]);
});

test('preserves recursive merging and clones concatenated arrays', () => {
  const target = { nested: { a: 1 }, list: [{ a: 1 }] };
  const source = { nested: { b: 2 }, list: [{ b: 2 }] };
  const result = merge(target, source);
  assert.deepEqual(result, {
    nested: { a: 1, b: 2 },
    list: [{ a: 1 }, { b: 2 }],
  });
  assert.notEqual(result.nested, target.nested);
  assert.notEqual(result.list[0], target.list[0]);
  assert.notEqual(result.list[1], source.list[0]);
  assert.deepEqual(target, { nested: { a: 1 }, list: [{ a: 1 }] });
  assert.deepEqual(source, { nested: { b: 2 }, list: [{ b: 2 }] });
});

test('preserves enumerable symbols, dates, regular expressions and data keys', () => {
  const key = Symbol('key');
  const date = new Date(0);
  const regexp = /valid/;
  const result = merge(
    { constructor: { a: 1 }, prototype: { a: 1 }, [key]: { a: 1 } },
    {
      constructor: { b: 2 },
      prototype: { b: 2 },
      [key]: { b: 2 },
      date,
      regexp,
    }
  );
  assert.deepEqual(result.constructor, { a: 1, b: 2 });
  assert.deepEqual(result.prototype, { a: 1, b: 2 });
  assert.deepEqual(result[key], { a: 1, b: 2 });
  assert.equal(result.date, date);
  assert.equal(result.regexp, regexp);
});

test('preserves custom merge options, clone=false and merge.all errors', () => {
  const nested = { value: 1 };
  assert.equal(merge({}, { nested }, { clone: false }).nested, nested);
  assert.deepEqual(
    merge({ list: [1] }, { list: [2] }, { arrayMerge: (_a, b) => b }),
    { list: [2] }
  );
  assert.deepEqual(
    merge(
      { nested: { a: 1 } },
      { nested: { b: 2 } },
      { customMerge: key => (key === 'nested' ? (_a, b) => b : undefined) }
    ),
    { nested: { b: 2 } }
  );
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  assert.throws(() => merge.all({}), /first argument should be an array/);
});
