# 이유식 큐브 공유형 아키텍처 추천

## 결론

부부가 같이 써야 한다면 `local-only PWA`는 제외합니다. 이 조건에서는 `Cloudflare-first`가 맞고, 추천 기본안은 `Cloudflare Pages + Workers + D1 + Cloudflare Access`입니다.

Supabase는 필수 비교 대상입니다. 다만 “Supabase도 검토”가 아니라 “Supabase를 반드시 주 백엔드로 써야 한다”는 뜻이라면 추천은 `Cloudflare Pages + Supabase Auth + Postgres + RLS`로 바뀌고, D1은 primary data store에서 빠집니다.

이유:

- 이미 Cloudflare로 도메인을 관리하고 있으면 배포, 도메인, 인증 보호, API, DB를 한 계정에서 묶을 수 있습니다.
- 부부 2명 규모는 Cloudflare 무료 한도에 매우 작습니다. Workers Free는 100,000 requests/day, D1 Free는 5 million rows read/day, 100,000 rows written/day, 무료 계정 총 D1 5 GB storage입니다. 단, 무료 D1 단일 database 최대 크기는 500 MB라서 이 한도도 같이 봐야 합니다.
- Cloudflare Access Free는 “teams under 50 users” 용도로 제시되어 있어, 부부 이메일만 허용하는 private app 시작점으로 적합해 보입니다.
- Pages는 UI, Workers는 API, D1은 공유 DB 역할을 맡습니다. 별도 서버를 직접 운영하지 않아도 됩니다.

## 추천안 A: Cloudflare 중심

구성:

```text
custom domain
  -> Cloudflare Access
  -> Cloudflare Pages frontend
  -> Pages Functions or Workers API
  -> D1 SQLite database
```

데이터 흐름:

1. 부부가 각자 이메일/OTP/OAuth로 Cloudflare Access 로그인.
2. React/Vite PWA가 `/api/*`를 호출.
3. Worker가 Access JWT 또는 allowlist를 검증.
4. Worker가 D1에 event를 저장하고, 현재 재고/식단 view를 반환.
5. 다른 배우자 화면은 polling 또는 manual refresh로 최신 상태를 확인.

Cloudflare안의 장점:

- 비용 0원으로 시작 가능성이 가장 높음.
- 도메인/배포/DB/API가 한곳에 있음.
- GitHub Pages보다 개인정보 노출 위험을 줄이기 쉬움.
- D1이 SQL이라 재고, 식단, 이벤트 로그 모델링이 단순함.

주의점:

- Supabase처럼 완성된 앱 Auth/RLS/Realtime이 내장되어 있지는 않습니다.
- 실시간 동기화는 직접 polling, SSE, WebSocket, Durable Object 중 하나를 설계해야 합니다. 이유식 재고 앱은 실시간성이 높지 않으므로 10-30초 polling이나 화면 진입 시 refresh면 충분합니다.
- Access로 앱 전체를 막는 방식은 “부부 전용 내부 앱”에는 좋지만, 나중에 일반 사용자 가입형 서비스로 바꾸려면 별도 Auth 설계가 필요합니다.
- Cloudflare Access는 앱 입구를 보호하는 데 강하고, household별 row-level 권한 모델은 Worker 코드에서 직접 확인해야 합니다.

## 추천안 B: Supabase + Cloudflare Pages

구성:

```text
custom domain
  -> Cloudflare Pages frontend
  -> Supabase Auth
  -> Supabase Postgres
  -> Supabase Realtime optional
```

Supabase안의 장점:

- 개발이 더 빠릅니다. Auth, Postgres API, RLS, Realtime이 준비되어 있습니다.
- 부부 공유, row-level security, 초대 기반 household 모델을 만들기 쉽습니다.
- 실시간 반영이 필요하면 Supabase Realtime을 바로 쓸 수 있습니다.

주의점:

- Free plan은 500 MB database, 50,000 MAU, 5 GB egress, 1 GB storage 등으로 부부 앱에는 충분하지만, 무료 프로젝트는 낮은 활동 상태에서 pause될 수 있습니다.
- 앱이 “매일 열어보는 가족 도구”라면 pause 가능성은 크지 않지만, 오랫동안 안 쓰면 복구가 필요할 수 있습니다.
- Supabase 문서는 Free Plan 앱이 7일 동안 낮은 활동을 보이면 pause될 수 있고, Pro로 올리면 inactivity pause를 피할 수 있다고 안내합니다.
- Supabase를 쓰면 exposed schema의 table에 RLS를 켜고 household/member 정책을 걸어야 합니다. Supabase 문서는 RLS 없는 table이 client에서 접근/수정될 수 있다고 경고합니다.
- 데이터와 Auth는 Supabase에 둡니다. Cloudflare 도메인을 쓰더라도 백엔드는 Supabase 종속입니다.

## 최종 선택

1순위: `Cloudflare Pages + Workers + D1 + Access`

부부가 쓰는 private shared app, 비용 최소화, Cloudflare 도메인 보유 조건에는 이게 가장 자연스럽습니다. 다만 Auth/세션/API 검증을 직접 조금 만들어야 합니다.

2순위: `Cloudflare Pages + Supabase`

빨리 만들고 싶고, 로그인/권한/Realtime을 직접 만들기 싫다면 Supabase가 더 좋습니다. 무료 플랜으로 시작하고, 앱이 생활 필수 도구가 되면 Pro 전환 가능성을 열어둡니다.

Supabase-first가 더 나은 조건은 분명합니다. Auth, RLS, Realtime을 직접 만들고 싶지 않고 개발 속도가 최우선이면 Supabase를 주 백엔드로 고릅니다. Cloudflare는 도메인과 정적 프론트엔드 배포만 맡깁니다.

비추천: `GitHub Pages + GitHub repo as DB`

공유형 앱에서는 업데이트 지연, 충돌, Git history 개인정보, 모바일 UX, 인증 문제가 커집니다. GitHub는 코드 배포와 schema migration/audit 백업에만 쓰는 편이 낫습니다.

## 데이터 모델

핵심은 “현재 상태”를 직접 수정하기보다 event를 저장하고 현재 상태를 계산하는 방식입니다.

```sql
households (
  id text primary key,
  name text not null,
  created_at text not null
);

members (
  household_id text not null,
  email text not null,
  role text not null check (role in ('owner', 'caregiver')),
  primary key (household_id, email)
);

ingredients (
  id text primary key,
  household_id text not null,
  name text not null,
  status text not null check (status in ('not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction')),
  allergen_tags text,
  notes text
);

cube_lots (
  id text primary key,
  household_id text not null,
  ingredient_id text,
  combination_id text,
  made_at text not null,
  expires_at text,
  initial_count integer not null,
  remaining_count integer not null,
  grams_per_cube real
);

stock_rules (
  id text primary key,
  household_id text not null,
  ingredient_id text,
  min_cubes integer not null,
  min_days_coverage integer
);

combinations (
  id text primary key,
  household_id text not null,
  name text not null,
  stage text,
  texture text,
  notes text
);

combination_items (
  combination_id text not null,
  ingredient_id text not null,
  cube_count real not null,
  primary key (combination_id, ingredient_id)
);

meal_plan_slots (
  id text primary key,
  household_id text not null,
  date text not null,
  meal_type text not null,
  combination_id text,
  intro_ingredient_id text,
  status text not null default 'planned'
);

events (
  id text primary key,
  household_id text not null,
  actor_email text not null,
  type text not null,
  payload_json text not null,
  created_at text not null,
  undo_event_id text
);
```

## AI agent 업데이트 방식

Cloudflare안에서는 GitHub Pages 재배포를 기다리지 말고 DB를 업데이트해야 합니다.

권장 흐름:

1. 사용자가 AI에게 “소고기 큐브 6개 만들었어”라고 요청.
2. AI가 구조화된 변경안을 생성합니다.
3. GitHub Actions 또는 로컬 agent가 `POST /api/ai-events/propose`로 보냅니다.
4. Worker가 service token, schema, household, SKU, 수량 범위, 음수 재고 여부를 검증합니다.
5. 낮은 위험이면 바로 `events`에 append하고 materialized state를 갱신합니다.
6. 애매하면 앱의 “확인 필요” inbox에 넣고 부부 중 한 명이 승인합니다.
7. UI는 DB에서 바로 최신 상태를 읽습니다.

AI가 직접 D1 credential, Supabase service role key, GitHub admin token, broad Cloudflare token을 들고 있으면 안 됩니다. 좁은 endpoint와 service token만 허용하고, 모든 변경은 append-only event로 남깁니다. OWASP의 LLM Prompt Injection/Excessive Agency 리스크를 전제로, 모델 출력은 항상 untrusted input으로 취급합니다.

추가 guardrails:

- Worker나 Supabase Edge Function에서 household/member 권한을 다시 확인.
- schema validation, SKU 매핑, 수량 상한, 음수 재고 방지, 중복 요청 방지.
- 새 식재료 도입, 알레르기 의심 반응, 대량 삭제, 주간 식단 전체 교체는 자동 반영하지 않고 승인 필요.
- public assets, GitHub repository, Pages artifact에 raw baby/family data를 넣지 않음.
- 모든 이벤트에 actor, before/after, model/version, rollback handle을 저장.

## Cloudflare vs Supabase

| 기준 | Cloudflare Workers + D1 + Access | Supabase |
|---|---|---|
| 예상 비용 | 부부 앱은 무료 한도 안에 들어갈 가능성이 큼 | 무료로 충분히 시작 가능 |
| 도메인 | Cloudflare 관리 도메인과 가장 잘 맞음 | Cloudflare Pages 앞단 + Supabase 백엔드 |
| Auth | Access로 private app 보호 가능, 앱 Auth는 직접 설계 | Supabase Auth 내장 |
| 권한 모델 | Worker에서 household/member 체크 구현 | Postgres RLS로 구현 |
| Realtime | 직접 구현 또는 polling | Realtime 내장 |
| DB | D1 SQLite, 무료 단일 DB 500 MB / 계정 총 5 GB | Postgres, Free 500 MB |
| 개발 속도 | 중간 | 빠름 |
| 장기 통제 | 높음 | Supabase 종속 |
| 무료 플랜 리스크 | 한도 초과 시 요청 실패, Auth 직접 구현 부담 | free project pause, DB 500 MB 제한 |

## MVP 구현 순서

1. Cloudflare Pages에 PWA 배포.
2. Cloudflare Access로 `baby.yourdomain.com`을 부부 이메일 2개만 허용.
3. Workers API와 D1 database 생성.
4. 위 데이터 모델 중 `households`, `members`, `ingredients`, `cube_lots`, `stock_rules`, `combinations`, `meal_plan_slots`, `events`부터 구현.
5. UI 탭: `오늘`, `식단표`, `큐브`, `재료`, `조합`, `기록`.
6. 낮은 재고 계산: `remaining_count - 7일 식단 예약분 < min_cubes`.
7. AI endpoint는 마지막에 붙입니다. 먼저 손으로 쓰는 UI가 안정되어야 AI 변경 검증도 쉬워집니다.

## 한계와 확인 필요 사항

- 이 문서는 아키텍처 추천입니다. Cloudflare, Supabase, GitHub 설정이나 앱 구현은 수행하지 않았습니다.
- Cloudflare Access는 private app 입구 보호에는 적합하지만, 가족/household별 데이터 권한은 Worker에서 별도로 구현해야 합니다.
- Cloudflare D1 Free는 계정 총 D1 5 GB storage와 별개로 단일 database 500 MB 한도가 있습니다. 이유식 앱에는 충분할 가능성이 높지만, 사진/파일은 D1에 넣지 말고 R2나 별도 storage로 분리해야 합니다.
- Supabase Free는 부부 앱 규모에는 충분하지만 low activity로 pause될 수 있습니다. 매일 쓰는 앱이면 리스크가 낮고, 생활 필수 도구가 되면 Pro 전환을 검토합니다.
- 이 앱은 식재료 도입, 섭취 기록, 반응 기록을 도와주는 도구입니다. 알레르기, 의료, 영양 진단을 AI가 내리는 기능은 넣지 않는 것이 기본값입니다.
- 실시간 동기화가 꼭 필요하지 않다면 Cloudflare안은 polling/refresh로 충분합니다. “상대방이 입력한 즉시 내 화면에 떠야 함”이 핵심이면 Supabase Realtime 쪽이 더 단순합니다.

## 출처

- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Access pricing](https://www.cloudflare.com/sase/products/access/)
- [Cloudflare Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase billing docs](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase database size docs](https://supabase.com/docs/guides/platform/database-size)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime)
- [OWASP LLM Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP LLM Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
