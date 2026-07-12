function storageFailure(error) {
  return {
    code: 'storage_unavailable',
    name: String(error?.name || 'Error'),
    message: String(error?.message || 'Storage is unavailable'),
  };
}

function defaultStorage() {
  return globalThis.localStorage;
}

export function get(storageOrKey, maybeKey) {
  try {
    const storage = maybeKey === undefined ? defaultStorage() : storageOrKey;
    const key = maybeKey === undefined ? storageOrKey : maybeKey;
    return { ok: true, value: storage.getItem(key) };
  } catch (error) {
    return { ok: false, value: null, error: storageFailure(error) };
  }
}

export function set(storageOrKey, keyOrValue, maybeValue) {
  try {
    const storage = maybeValue === undefined ? defaultStorage() : storageOrKey;
    const key = maybeValue === undefined ? storageOrKey : keyOrValue;
    const value = maybeValue === undefined ? keyOrValue : maybeValue;
    storage.setItem(key, value);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, value: null, error: storageFailure(error) };
  }
}

export function remove(storageOrKey, maybeKey) {
  try {
    const storage = maybeKey === undefined ? defaultStorage() : storageOrKey;
    const key = maybeKey === undefined ? storageOrKey : maybeKey;
    storage.removeItem(key);
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, value: null, error: storageFailure(error) };
  }
}

export const safeStorage = Object.freeze({ get, set, remove });
