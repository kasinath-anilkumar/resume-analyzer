const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getOrCompute, invalidate } = require('../utils/ttlCache');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('computes once and serves subsequent calls from cache within the TTL', async () => {
  let calls = 0;
  const compute = async () => { calls += 1; return { n: calls }; };
  const a = await getOrCompute('k1', 1000, compute);
  const b = await getOrCompute('k1', 1000, compute);
  assert.equal(calls, 1);       // second call hit the cache
  assert.deepEqual(a, b);
});

test('concurrent callers share ONE in-flight computation (no thundering herd)', async () => {
  let calls = 0;
  const compute = async () => { calls += 1; await sleep(20); return calls; };
  const [x, y, z] = await Promise.all([
    getOrCompute('k2', 1000, compute),
    getOrCompute('k2', 1000, compute),
    getOrCompute('k2', 1000, compute),
  ]);
  assert.equal(calls, 1);
  assert.equal(x, 1); assert.equal(y, 1); assert.equal(z, 1);
});

test('recomputes after the TTL expires', async () => {
  let calls = 0;
  const compute = async () => { calls += 1; return calls; };
  await getOrCompute('k3', 20, compute);
  await sleep(35);
  const v = await getOrCompute('k3', 20, compute);
  assert.equal(calls, 2);
  assert.equal(v, 2);
});

test('invalidate forces a recompute', async () => {
  let calls = 0;
  const compute = async () => { calls += 1; return calls; };
  await getOrCompute('k4', 1000, compute);
  invalidate('k4');
  await getOrCompute('k4', 1000, compute);
  assert.equal(calls, 2);
});

test('failures are NOT cached', async () => {
  let calls = 0;
  const compute = async () => { calls += 1; if (calls === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(() => getOrCompute('k5', 1000, compute), /boom/);
  const v = await getOrCompute('k5', 1000, compute); // retries, succeeds
  assert.equal(v, 'ok');
  assert.equal(calls, 2);
});
