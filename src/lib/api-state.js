const DEV_ACTOR_EMAIL = 'caregiver-a@example.com';
const REQUESTED_WITH = 'XMLHttpRequest';

class StateRequestError extends Error {
  constructor(code, status = null, body = null, cause = null) {
    super(code, cause ? { cause } : undefined);
    this.name = 'StateRequestError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export async function fetchSharedState() {
  return requestSharedState('GET');
}

export async function persistSharedState(state) {
  return requestSharedState('PUT', state);
}

async function requestSharedState(method, state) {
  let response;
  try {
    response = await fetch('/api/state', {
      method,
      credentials: 'include',
      headers: method === 'PUT'
        ? { ...authHeaders(), 'content-type': 'application/json' }
        : authHeaders(),
      ...(method === 'PUT' ? { body: JSON.stringify(state) } : {}),
    });
  } catch (error) {
    throw new StateRequestError('network_error', null, null, error);
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new StateRequestError('invalid_response', response.status, null, error);
  }

  if (!response.ok) {
    const fallback = method === 'GET' ? 'state_fetch_failed' : 'state_save_failed';
    throw new StateRequestError(String(body?.error || fallback), response.status, body);
  }
  if (!isCanonicalState(body)) throw new StateRequestError('invalid_state_response', response.status, body);
  return body;
}

export function createSharedStateSync() {
  let loading = false;
  let ready = false;
  let saving = false;

  return {
    isReady() {
      return ready;
    },

    isSaving() {
      return saving;
    },

    async load() {
      if (loading) return { status: 'busy', state: null, error: { code: 'load_in_progress' } };
      loading = true;
      try {
        const state = await fetchSharedState();
        ready = true;
        return { status: 'authenticated', state };
      } catch (error) {
        ready = false;
        return failureResult(error);
      } finally {
        loading = false;
      }
    },

    async save(nextState) {
      if (loading || !ready) return { status: 'busy', state: null, error: { code: 'state_not_loaded' } };
      if (saving) return { status: 'busy', state: null, error: { code: 'save_in_progress' } };
      saving = true;
      try {
        return { status: 'acknowledged', state: await persistSharedState(nextState) };
      } catch (error) {
        const result = error?.status === 409 && error.body ? conflictResult(error.body) : null;
        if (result) return result;
        const failure = failureResult(error);
        if (failure.status === 'auth-required' || failure.status === 'forbidden') ready = false;
        return failure;
      } finally {
        saving = false;
      }
    },
  };
}

function conflictResult(body) {
  if (body?.error === 'ingredient_referenced') {
    if (!Array.isArray(body.ingredient_ids) || body.ingredient_ids.some((ingredientId) => typeof ingredientId !== 'string') || !isNonnegativeInteger(body.combination_count) || !isNonnegativeInteger(body.slot_count)) {
      return failureResult(new StateRequestError('invalid_conflict_response', 409, body));
    }
    return {
      status: 'conflict',
      state: null,
      conflict: {
        type: 'ingredient_referenced',
        ingredient_ids: Array.isArray(body.ingredient_ids) ? body.ingredient_ids : [],
        combination_count: body.combination_count,
        slot_count: body.slot_count,
      },
    };
  }
  if (body?.error === 'version_conflict') {
    if (!isCanonicalState(body.state)) return failureResult(new StateRequestError('invalid_conflict_response', 409, body));
    return { status: 'conflict', state: body.state, conflict: { type: 'version_conflict' } };
  }
  return null;
}

function failureResult(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;
  const code = String(error?.code || 'network_error');
  const resultStatus = status === 401 ? 'auth-required' : status === 403 ? 'forbidden' : 'error';
  return {
    status: resultStatus,
    state: null,
    error: {
      code,
      status,
      message: errorMessage(code, status),
    },
  };
}

function errorMessage(code, status) {
  if (status === 401) return '로그인 세션이 끝났어요. 로그인 후 계속해 주세요.';
  if (status === 403) return '로그인한 이메일이 이 공유 가정의 멤버로 등록되어 있지 않아요.';
  if (status === 404) return '공유 API를 찾지 못했어요. Cloudflare Pages dev 또는 배포 주소로 열어 주세요.';
  if (code === 'invalid_response') return '공유 API 응답을 확인하지 못했어요.';
  if (code === 'network_error') return '공유 API에 연결하지 못했어요.';
  return '공유 데이터를 처리하지 못했어요. 잠시 후 다시 눌러 주세요.';
}

function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isCanonicalState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Number.isInteger(value.syncVersion) || value.syncVersion < 1) return false;
  if (!value.childProfile || typeof value.childProfile !== 'object' || Array.isArray(value.childProfile)) return false;
  return ['ingredients','cubeLots','combinations','combinationItems','mealPlanSlots','events'].every((name) => Array.isArray(value[name]));
}

function authHeaders() {
  const headers = { 'X-Requested-With': REQUESTED_WITH };
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    headers['x-authenticated-user-email'] = DEV_ACTOR_EMAIL;
  }
  return headers;
}
