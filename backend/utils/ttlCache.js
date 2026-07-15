// Tiny in-process TTL cache for GLOBAL (not per-user) computed responses.
//
// The dashboard + analytics aggregates scan the whole candidates table. At 50
// branches many users hit those at once; without caching that's one full scan
// PER request. Wrapping them here collapses concurrent + repeated loads into ONE
// scan per TTL window (default 30s), which is the dominant server/DB-load win.
// (A SQL-side aggregation RPC would remove the scan entirely — a future step.)
//
// In-process: each instance keeps its own cache. That's fine — the data is global
// and a few seconds of staleness across instances is harmless.

const store = new Map(); // key -> { value, expires }

/**
 * Return the cached value for `key`, or compute + cache it. Concurrent callers
 * within the same tick share ONE in-flight computation (no thundering herd).
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any>} compute
 */
async function getOrCompute(key, ttlMs, compute) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    if (hit.value && typeof hit.value.then === 'function') return hit.value; // in-flight promise
    return hit.value;
  }
  const promise = Promise.resolve().then(compute);
  // Cache the in-flight promise so parallel requests dedupe onto it.
  store.set(key, { value: promise, expires: now + ttlMs });
  try {
    const value = await promise;
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  } catch (err) {
    store.delete(key); // don't cache failures
    throw err;
  }
}

// Drop a cached entry (e.g. to force-refresh). Called by the analytics "Refresh".
function invalidate(key) { store.delete(key); }

module.exports = { getOrCompute, invalidate };
