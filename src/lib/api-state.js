const DEV_ACTOR_EMAIL = 'caregiver-a@example.com';

export async function fetchSharedState() {
  const response = await fetch('/api/state', { headers: authHeaders() });
  if (!response.ok) throw new Error(`state_fetch_failed:${response.status}`);
  return response.json();
}

export async function persistSharedState(state) {
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (response.status === 409) {
    const conflict = new Error('state_save_conflict');
    conflict.status = 409;
    conflict.state = (await response.json()).state;
    throw conflict;
  }
  if (!response.ok) {
    const error = new Error(`state_save_failed:${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function createSharedStateSync({ getState, setState, cacheKey, render, warn }) {
  let saving = false;
  let queued = false;
  async function flush() {
    if (saving) return;
    saving = true;
    try {
      while (queued) {
        queued = false;
        const saved = await persistSharedState(getState());
        if (queued) {
          setState({ ...getState(), syncVersion: saved.syncVersion });
          localStorage.setItem(cacheKey, JSON.stringify(getState()));
          continue;
        }
        setState(saved);
        localStorage.setItem(cacheKey, JSON.stringify(saved));
        render();
      }
    } catch (error) {
      if (error.status === 409 && error.state) {
        if (queued) {
          setState({ ...getState(), syncVersion: error.state.syncVersion });
          localStorage.setItem(cacheKey, JSON.stringify(getState()));
        } else {
          setState(error.state);
          localStorage.setItem(cacheKey, JSON.stringify(error.state));
          render();
          warn('다른 기기에서 먼저 저장된 내용이 있어 최신 데이터로 다시 불러왔어요.');
        }
      } else {
        warn('공유 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      saving = false;
      if (queued) flush();
    }
  }
  return {
    save() {
      const current = getState();
      localStorage.setItem(cacheKey, JSON.stringify(current));
      render();
      queued = true;
      flush();
    },
    async load() {
      try {
        const shared = await fetchSharedState();
        setState(shared);
        localStorage.setItem(cacheKey, JSON.stringify(shared));
        render();
      } catch {
        warn('공유 데이터를 불러오지 못해 저장된 화면을 표시해요.');
      }
    },
  };
}

function authHeaders() {
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return { 'x-authenticated-user-email': DEV_ACTOR_EMAIL };
  return {};
}
