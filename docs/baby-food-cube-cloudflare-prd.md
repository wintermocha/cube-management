# 이유식 큐브 재고관리 서비스 PRD

## 1. 문서 목적

이 문서는 부부가 함께 사용하는 이유식 큐브 재고관리 서비스를 개발하기 위한 제품 요구사항 문서다. 1순위 아키텍처는 `Cloudflare Pages + Workers + D1 + Cloudflare Access`이며, 첫 릴리즈의 핵심 목표는 재고 부족으로 당장 이유식을 준비하지 못하는 상황을 막는 것이다.

이 PRD는 구현팀이 바로 설계, 개발, QA 계획을 세울 수 있을 정도의 범위, 데이터 모델, API, 화면, 수용 기준을 정의한다.

## 2. 배경과 문제

이유식 큐브는 종류가 많고 냉동 보관되며, 실제 식사 준비 시점에 특정 식재료 큐브가 부족하면 대체가 어렵다. 사용자는 “재고 부족 방지”를 최우선 문제로 정의했다. 특히 재고가 거의 떨어진 식재료를 미리 알아야 하고, 1주일 식단을 짤 때 예정된 조합 때문에 어떤 식재료가 부족해질지도 별도로 확인해야 한다.

부부가 함께 같은 데이터를 봐야 하므로 local-only PWA는 적합하지 않다. 앱은 Cloudflare Access로 보호되는 private app이어야 하며, 원본 가족/아이 데이터는 public asset이나 GitHub Pages artifact에 배포되지 않아야 한다.

비용 목표는 0원 또는 매우 낮은 월 비용으로 시작하는 것이다. 부부 2명, 단일 household, 텍스트 중심 데이터라는 규모에서는 Cloudflare Pages, Workers/Pages Functions, D1, Access의 무료 한도 안에서 시작할 가능성이 높다. 사진/OCR, 외부 알림, 대용량 로그를 MVP에서 제외하는 것도 이 비용 목표를 지키기 위한 제품 결정이다.

## 3. 목표

### 제품 목표

- 식재료별 큐브 재고 부족을 미리 드러내 이유식 준비 실패를 줄인다.
- 부부가 같은 재고, 큐브 조합, 1주일 식단 데이터를 공유한다.
- 주간 식단으로 인해 부족해질 식재료를 현재 재고 경고와 별도로 보여준다.
- 낮은 위험의 AI 재고 추가 요청은 안전장치와 함께 자동 반영한다.

### 첫 릴리즈 성공 조건

첫 릴리즈는 아래 네 가지가 모두 동작해야 한다.

1. 부부가 각자 로그인해 같은 재고와 식단 데이터를 볼 수 있다.
2. 식재료별 현재 큐브 재고가 `3개 이하`이면 `warn`, `1개 이하`이면 `error`로 표시된다.
3. 1주일 식단을 만들면 조합에 필요한 큐브 기준으로 `부족 예정` 식재료가 보인다.
4. AI에게 “소고기 큐브 6개 만들었어” 같은 낮은 위험 요청을 보내면 안전장치와 함께 자동 반영된다.

## 4. 사용자와 사용 맥락

### Primary Users

- 부모 2명 또는 보호자 2명.
- 같은 household에 속하며 동일한 아이의 이유식 큐브 재고를 관리한다.

### 핵심 사용 장면

- 이유식 만들기 후 큐브 수량을 빠르게 추가한다.
- 식사 준비 전에 현재 부족하거나 거의 부족한 식재료를 확인한다.
- 주간 식단을 구성하면서 부족 예정인 식재료를 확인한다.
- 새 식재료를 미리 등록하고 추후 먹여본 상태로 바꾼다.
- AI에게 자연어로 재고 추가를 요청한다.

## 5. 범위

### MVP In Scope

- 단일 household.
- 단일 child profile.
- 부부 2명 중심의 caregiver access.
- Cloudflare Access 기반 private app 보호.
- Cloudflare Pages frontend.
- Workers 또는 Pages Functions API.
- Cloudflare D1 database.
- 식재료 관리.
- 식재료별 큐브 lot 재고 관리.
- 현재 재고 `warn/error` 표시.
- 큐브 조합 관리.
- 1주일 식단 관리.
- 식단 기반 `부족 예정` forecast.
- 아직 안 먹어봤지만 먹일 식재료의 planned/not_tried 상태 관리.
- AI 기반 낮은 위험 재고 추가 자동 반영.
- AI 변경 이벤트 로그, 3초 취소, rollback.
- 승인 대기 inbox.

### MVP Out of Scope

- 푸시, 카카오톡, 문자, 이메일 등 외부 알림.
- 여러 아이 프로필.
- 알레르기, 의료, 영양 진단.
- 사진, 영수증, 라벨 OCR.
- GitHub Pages 또는 public repository를 원본 데이터 저장소로 사용.
- AI가 broad Cloudflare token, D1 credential, GitHub admin token을 직접 보유.
- 식단 자동 추천 또는 AI 조합 추천.
- 일반 사용자 가입형 SaaS.

## 6. 핵심 개념

### 현재 재고 경고

현재 재고 경고는 식재료별 큐브 현재 개수만 기준으로 계산한다. 주간 식단 예약분을 차감하지 않는다.

- `ok`: 현재 큐브 수 4개 이상.
- `warn`: 현재 큐브 수 3개 이하.
- `error`: 현재 큐브 수 1개 이하.

### 부족 예정 경고

부족 예정 경고는 1주일 식단과 큐브 조합을 기준으로 계산한다. 현재 재고 경고와 별도 표시한다.

예: 소고기 큐브 현재 5개, 이번 주 식단 조합에서 소고기 큐브 7개 필요하면 `부족 예정 2개`로 표시한다. 이 경우 현재 재고 경고는 `ok`일 수 있고, 부족 예정 경고는 별도로 표시된다.

### 낮은 위험 AI 자동 반영

AI 자동 반영은 재고 추가에만 허용한다.

자동 반영 가능 예:

- “소고기 큐브 6개 만들었어”
- “브로콜리 큐브 4개 추가”

승인 필요 예:

- “소고기 큐브 3개 삭제해”
- “오늘 반응이 이상했어”
- “다음 주 식단 전부 바꿔줘”
- “큐브 전부 정리해”
- 식재료 매칭이 애매한 요청
- 비정상적으로 큰 수량 요청

## 7. 기능 요구사항

### 7.1 인증과 household 공유

요구사항:

- 앱은 Cloudflare Access로 보호한다.
- 허용된 caregiver email만 앱에 접근할 수 있다.
- API는 Cloudflare Access 통과만 믿지 않고 household/member 권한을 다시 확인한다.
- 첫 릴리즈는 하나의 household와 하나의 child profile만 지원한다.

수용 기준:

- caregiver A가 재고를 추가하면 caregiver B가 refresh 후 같은 값을 볼 수 있다.
- 허용되지 않은 사용자는 앱과 API에 접근할 수 없다.
- API 요청에는 actor email이 기록된다.

단일 child profile:

- 첫 릴리즈는 household당 child profile 1개를 가진다.
- child profile은 표시 이름, 생년월일, 메모만 가진다.
- 여러 child profile 생성, 전환, 비교 UI는 제공하지 않는다.
- 모든 재고, 식단, 이벤트는 이 단일 child profile의 맥락으로 해석한다.

### 7.2 식재료 관리

식재료 상태:

- `not_tried`: 아직 먹어보지 않음.
- `planned`: 먹일 예정.
- `testing`: 도입 중.
- `tolerated`: 먹어봤고 문제 없음.
- `suspected_reaction`: 반응 의심. 진단이 아니라 기록 상태다.

요구사항:

- 식재료 이름, 카테고리, 상태, 메모를 관리한다.
- 아직 먹어보지 않았지만 먹일 식재료를 미리 등록할 수 있다.
- 알레르기/영양 진단은 제공하지 않는다.

수용 기준:

- 사용자는 식재료를 만들고 상태를 변경할 수 있다.
- `suspected_reaction` 상태는 경고성 표시만 하고 의학적 판단 문구를 제공하지 않는다.

### 7.3 큐브 lot 재고 관리

요구사항:

- 큐브는 lot 단위로 관리한다.
- lot은 반드시 하나의 식재료에 연결된다.
- 조합은 재고 단위가 아니라 식단과 필요 큐브 수량을 계산하는 템플릿이다.
- 조합을 만들어 보관하더라도 재고에는 조합 lot이 아니라 조합을 구성하는 식재료별 cube_lot으로 기록한다.
- lot은 제조일, 소비기한, 최초 수량, 남은 수량, 큐브당 g/ml, 보관 위치를 가진다.
- 재고 추가, 사용, 수정은 이벤트 로그로 기록한다.

기본 정책:

- 기본 단위는 `cube`.
- 큐브당 g/ml은 선택 입력으로 둔다.
- 소비기한은 선택 입력으로 둔다.
- 재고 사용 시 기본 차감은 oldest-first, 소비기한이 있으면 FEFO(first-expire-first-out)를 우선한다.

수용 기준:

- 식재료별 현재 큐브 합계가 계산된다.
- 현재 수량 3개 이하인 식재료는 `warn`으로 표시된다.
- 현재 수량 1개 이하인 식재료는 `error`로 표시된다.

### 7.4 현재 재고 경고

요구사항:

- 모든 식재료 목록, 큐브 목록, 오늘 화면에서 경고 상태를 볼 수 있어야 한다.
- `warn`과 `error`는 시각적으로 분명히 구분한다.
- 경고 기준은 식재료별 현재 재고 합계만 사용한다.

수용 기준:

- 4개인 식재료는 `ok`.
- 3개인 식재료는 `warn`.
- 1개인 식재료는 `error`.
- 0개인 식재료는 `error`이며 “재고 없음”으로 표시한다.

### 7.5 큐브 조합 관리

요구사항:

- 조합은 여러 식재료 큐브와 필요 수량을 가진다.
- 조합은 이름, 단계, 질감, 메모를 가진다.
- 조합은 주간 식단 슬롯에 배치될 수 있다.

예:

- “소고기 브로콜리 죽”
  - 소고기 1 cube
  - 브로콜리 1 cube
  - 쌀미음 2 cube

수용 기준:

- 사용자는 조합을 생성, 수정, 삭제할 수 있다.
- 조합의 식재료 큐브 수량 합계가 식단 forecast에 반영된다.

### 7.6 1주일 식단 관리

요구사항:

- 사용자는 7일 단위 식단을 볼 수 있다.
- 기본 meal type은 `아침`, `점심`, `저녁`이다.
- 각 슬롯에는 조합, 단일 식재료 큐브, 새 식재료 도입 표시를 넣을 수 있다.
- 식단은 재고를 즉시 차감하지 않는다. 실제 먹임 기록 또는 수동 사용 처리 시 차감한다.

수용 기준:

- 사용자는 이번 주 식단에 조합을 배치할 수 있다.
- 식단에 배치된 조합의 필요 큐브 수량이 집계된다.
- 집계 결과 현재 재고보다 많이 필요한 식재료는 `부족 예정`으로 표시된다.

### 7.7 부족 예정 forecast

요구사항:

- forecast 기간은 기본 7일이다.
- forecast는 `현재 재고 - 7일 식단 필요량`을 계산한다.
- 음수이면 부족 예정으로 표시한다.
- forecast는 현재 재고 `warn/error`를 대체하지 않는다.

수용 기준:

- 현재 재고 5개, 7일 필요량 7개이면 `부족 예정 2개`.
- 현재 재고 5개, 7일 필요량 4개이면 부족 예정 없음.
- 현재 재고 1개, 7일 필요량 0개이면 현재 재고 `error`만 표시하고 부족 예정은 표시하지 않는다.

### 7.8 AI 재고 추가

요구사항:

- 사용자는 자연어로 재고 추가를 요청할 수 있다.
- AI parser는 요청을 구조화된 intent로 변환한다.
- 자동 반영은 inventory addition만 허용한다.
- 자동 반영 후 3초 동안 undo/cancel toast를 보여준다.
- 같은 actor, 같은 식재료, 같은 수량, 유사 문장은 짧은 시간 안에 중복 반영하지 않는다.
- 기본 dedupe window는 60초다.
- 모든 자동 반영은 event log에 기록하고 rollback 가능해야 한다.

자동 반영 intent 예:

```json
{
  "type": "add_stock",
  "ingredient_name": "소고기",
  "quantity": 6,
  "unit": "cube"
}
```

자동 반영 거부 또는 승인 대기 조건:

- ingredient match confidence가 낮으면 승인 대기로 보낸다.
- 수량이 1 이상 30 이하 범위를 벗어나면 자동 반영하지 않는다. 비정상적으로 큰 수량은 거부한다.
- 차감, 큐브 lot 삭제, 반응 기록, 식단 변경은 승인 대기로 보낼 수 있다.
- 권한 변경, credential 요청, 외부 알림 생성, OCR 처리, 의료/영양 진단 요청은 MVP에서 거부한다.
- 같은 요청이 dedupe window 안에 이미 반영되었으면 거부한다.

수용 기준:

- “소고기 큐브 6개 만들었어”는 소고기 6개 재고 추가 event를 만든다.
- 3초 undo를 누르면 event가 rollback되고 재고가 원복된다.
- 같은 요청을 즉시 반복하면 중복 반영되지 않는다.
- “소고기 큐브 삭제해”는 승인 대기로 처리되고 자동 반영되지 않는다.
- “배우자 계정 추가해줘” 같은 권한 변경 요청은 거부된다.

### 7.9 승인 대기 inbox

요구사항:

- allowlist에 포함되는 고위험 또는 애매한 AI 요청만 승인 대기 상태로 저장한다.
- caregiver는 승인 또는 거부할 수 있다.
- 승인 시 event log에 승인자와 원본 요청을 기록한다.
- 승인 대기는 arbitrary command executor가 아니다. allowlist 밖 요청은 approval request를 만들지 않거나 `rejected`로 저장한다.

승인 가능 allowlist:

- `add_stock_after_review`
- `stock_decrement`
- `cube_lot_delete`
- `single_meal_slot_change`
- `week_meal_plan_change`
- `ingredient_status_note`

항상 거부:

- household/member 권한 변경
- credential, token, secret 요청
- 외부 알림 생성
- OCR 처리
- 의료/알레르기/영양 진단

수용 기준:

- 삭제/차감/반응 기록/주간 식단 전체 변경 요청은 inbox에 쌓인다.
- 승인 전에는 실제 데이터가 변경되지 않는다.
- 권한 변경 또는 진단 요청은 승인 가능 항목으로 표시되지 않는다.

### 7.10 이벤트 로그와 rollback

요구사항:

- 모든 쓰기 작업은 event로 기록한다.
- event는 actor, type, payload, before/after, created_at, source를 가진다.
- AI event는 raw_text, parsed_intent, validation_result, model/version을 추가로 가진다.
- rollback은 원 event를 삭제하지 않고 보상 event를 생성한다.

수용 기준:

- 사용자는 최근 변경 내역을 볼 수 있다.
- AI 자동 반영은 즉시 rollback 가능하다.
- rollback 후 재고와 forecast가 재계산된다.

## 8. 화면 요구사항

### 8.1 오늘

목적:

- 지금 당장 확인해야 할 재고 문제를 보여준다.

구성:

- 단일 child profile 표시.
- `error` 재고 목록.
- `warn` 재고 목록.
- `부족 예정` 목록.
- 오늘 식단 슬롯.
- 빠른 재고 추가 버튼.
- AI 입력 버튼 또는 입력창.

### 8.2 큐브

구성:

- 식재료별 현재 재고.
- `ok/warn/error` badge.
- lot 목록.
- 재고 추가, 사용 처리, 수정.

### 8.3 식단표

구성:

- 7일 calendar.
- 아침/점심/저녁 슬롯.
- 슬롯별 조합 선택.
- 부족 예정 표시.

### 8.4 재료

구성:

- 식재료 목록.
- 상태 필터: not_tried, planned, testing, tolerated, suspected_reaction.
- 새 식재료 등록.

### 8.5 조합

구성:

- 조합 목록.
- 조합 생성/수정.
- 필요한 식재료와 cube count.

### 8.6 기록

구성:

- 최근 event log.
- AI 자동 반영 기록.
- rollback 가능한 항목.
- 승인 대기 inbox.

### 8.7 설정

구성:

- 단일 child profile 표시 이름, 생년월일, 메모 수정.
- caregiver email 목록 read-only 표시.
- 여러 아이 추가 버튼은 제공하지 않는다.

## 9. 정보 구조와 네비게이션

기본 탭:

1. `오늘`
2. `큐브`
3. `식단표`
4. `재료`
5. `조합`
6. `기록`

첫 화면은 `오늘`이다. 재고 부족 방지가 최우선이므로 `error`, `warn`, `부족 예정`이 첫 화면 상단에 보여야 한다. `설정`은 기본 탭이 아니라 header menu에서 접근한다.

## 10. 기술 아키텍처 요구사항

### 10.1 Runtime

- Frontend: Cloudflare Pages에 배포되는 정적 PWA.
- API: Cloudflare Workers 또는 Pages Functions.
- Database: Cloudflare D1.
- Auth perimeter: Cloudflare Access.
- Repository: GitHub 또는 사용자가 선택한 Git remote.

### 10.1.1 비용과 대안 포지션

1순위 아키텍처는 Cloudflare-first다. 이유는 다음과 같다.

- 사용자가 Cloudflare로 domain을 관리하고 있어 배포와 private app 보호가 자연스럽다.
- 부부 2명 규모의 request, row read/write, storage는 무료 한도 안에서 시작할 가능성이 높다.
- Cloudflare Access로 앱 입구를 닫고, Worker에서 household/member 권한을 추가 검증할 수 있다.
- 데이터 원본이 D1에 있으므로 GitHub Pages처럼 public artifact에 가족/아이 데이터가 섞일 위험을 줄인다.

Supabase는 검토된 2순위 대안이다.

- Supabase Auth, Postgres RLS, Realtime을 직접 만들고 싶지 않다면 Supabase-first가 더 빠르다.
- Cloudflare Pages frontend + Supabase Auth/Postgres/RLS 구조도 MVP 구현은 가능하다.
- 단, Supabase를 쓰면 백엔드와 Auth의 주 종속성이 Supabase로 이동하고, 무료 프로젝트 pause/DB 용량 제한을 고려해야 한다.
- 이 PRD의 구현 대상은 1순위 Cloudflare architecture다. Supabase 전환은 별도 PRD 또는 architecture decision record가 필요하다.

### 10.2 권한 모델

Cloudflare Access는 앱 입구 보호를 담당한다. API는 다음을 추가로 수행해야 한다.

- Access identity에서 email을 추출한다.
- `members` table에서 household membership을 확인한다.
- 모든 read/write query는 household_id로 scope를 제한한다.
- 브라우저에서 호출하는 AI endpoint는 Access-authenticated caregiver flow로 처리한다. 이때 `actor_email`은 request body가 아니라 Access identity에서만 결정한다.
- 외부/local AI agent가 호출하는 proposal endpoint는 별도 service-token endpoint로 분리한다. 이때 `actor_email`은 body에 포함할 수 있지만 Worker가 `members` table에서 household membership을 다시 검증해야 한다.
- AI agent는 D1 credential, GitHub admin token, broad Cloudflare token을 직접 받지 않는다. agent는 proposal만 보낼 수 있고, 최종 validation과 event 생성은 Worker가 담당한다.

### 10.3 데이터 저장 원칙

- public static assets에는 원본 가족/아이 데이터를 넣지 않는다.
- D1에는 구조화 데이터만 저장한다.
- 사진/OCR은 MVP 범위가 아니므로 storage 설계에서 제외한다.
- event log는 감사와 rollback의 source of truth다.

## 11. 데이터 모델

초기 D1 schema는 아래 엔티티를 포함한다.

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
  created_at text not null,
  primary key (household_id, email)
);

child_profiles (
  id text primary key,
  household_id text not null unique,
  display_name text not null,
  birth_date text,
  notes text,
  created_at text not null,
  updated_at text not null
);

ingredients (
  id text primary key,
  household_id text not null,
  name text not null,
  category text,
  status text not null check (status in ('not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction')),
  notes text,
  created_at text not null,
  updated_at text not null
);

cube_lots (
  id text primary key,
  household_id text not null,
  ingredient_id text not null,
  made_at text not null,
  expires_at text,
  initial_count integer not null,
  remaining_count integer not null,
  grams_per_cube real,
  storage_location text,
  created_at text not null,
  updated_at text not null
);

combinations (
  id text primary key,
  household_id text not null,
  name text not null,
  stage text,
  texture text,
  notes text,
  created_at text not null,
  updated_at text not null
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
  meal_type text not null check (meal_type in ('아침', '점심', '저녁')),
  target_type text not null check (target_type in ('combination', 'ingredient')),
  combination_id text,
  ingredient_id text,
  cube_count real,
  status text not null default 'planned',
  created_at text not null,
  updated_at text not null
);

events (
  id text primary key,
  household_id text not null,
  actor_email text not null,
  source text not null check (source in ('manual', 'ai', 'system')),
  type text not null,
  payload_json text not null,
  before_json text,
  after_json text,
  created_at text not null,
  undo_event_id text
);

ai_commands (
  id text primary key,
  household_id text not null,
  actor_email text not null,
  raw_text text not null,
  parsed_intent_json text,
  validation_result_json text,
  status text not null check (status in ('auto_applied', 'pending_approval', 'rejected', 'rolled_back')),
  event_id text,
  dedupe_key text,
  model_name text,
  created_at text not null
);

approval_requests (
  id text primary key,
  household_id text not null,
  actor_email text not null,
  request_type text not null,
  payload_json text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  reviewer_email text,
  created_at text not null,
  reviewed_at text
);
```

데이터 invariant:

- `child_profiles.household_id`는 unique이며 첫 릴리즈에서는 household당 child profile 1개만 허용한다.
- `cube_lots`는 식재료별 큐브 현재 재고를 나타내므로 `ingredient_id`가 항상 필요하다. 조합은 재고 단위가 아니라 식단/필요량 계산 단위다.
- `cube_lots.initial_count`와 `remaining_count`는 0 이상의 정수이며, `remaining_count <= initial_count`여야 한다.
- `combination_items.cube_count`와 `meal_plan_slots.cube_count`는 0보다 커야 한다.
- `meal_plan_slots.target_type = 'combination'`이면 `combination_id`만 사용하고 `ingredient_id`, `cube_count`는 null이다.
- `meal_plan_slots.target_type = 'ingredient'`이면 `ingredient_id`와 `cube_count`가 필요하고 `combination_id`는 null이다. 이 방식은 새 식재료 단독 도입 식단에도 사용한다.

## 12. API 요구사항

API는 JSON 기반으로 제공한다. 모든 endpoint는 household scope와 actor authorization을 검증한다.

공통 규칙:

- 모든 write endpoint는 성공 시 `event_id`를 반환한다.
- 모든 list endpoint는 첫 릴리즈에서 pagination 없이 전체 household 데이터를 반환해도 된다.
- 모든 mutation payload는 server-side schema validation을 통과해야 한다.
- `401/403`은 Access identity 또는 household membership 실패에 사용한다.
- `409`는 AI dedupe, 동시 수정 충돌, 이미 rollback된 event에 사용한다.
- `422`는 schema validation 또는 business rule 실패에 사용한다.
- request body의 `household_id` 또는 `actor_email`은 신뢰하지 않는다. 브라우저 요청에서는 Access identity와 `members` 조회 결과로만 결정한다.

### Child Profile

- `GET /api/child-profile`
  - Response: `{ id, display_name, birth_date?, notes? }`.
- `PATCH /api/child-profile`
  - 첫 릴리즈의 단일 child profile만 수정한다. 추가 profile 생성은 제공하지 않는다.
  - Body: `{ display_name?, birth_date?, notes? }`.
  - Response: `{ child_profile, event_id }`.

### Inventory

- `GET /api/inventory`
  - 식재료별 현재 재고, `ok/warn/error`, lot 요약 반환.
  - Response item: `{ ingredient_id, ingredient_name, current_count, severity, lots[] }`.
- `POST /api/cube-lots`
  - 수동 재고 추가.
  - Body: `{ ingredient_id, made_at, initial_count, grams_per_cube?, expires_at?, storage_location? }`.
  - `initial_count`는 1-200 범위의 정수여야 한다.
  - Response: `{ lot, event_id }`.
- `PATCH /api/cube-lots/:id`
  - lot 메타데이터 수정.
  - Body: `{ remaining_count?, expires_at?, storage_location?, notes? }`.
  - Response: `{ lot, event_id }`.
- `POST /api/inventory/use`
  - 수동 사용 처리. oldest-first/FEFO 정책 적용.
  - Body: `{ ingredient_id, quantity, used_at?, reason? }`.
  - Response: `{ consumed_lots[], remaining_count, event_id }`.

### Ingredients

- `GET /api/ingredients`
  - Response item: `{ id, name, category, status, notes }`.
- `POST /api/ingredients`
  - Body: `{ name, category?, status, notes? }`.
  - Response: `{ ingredient, event_id }`.
- `PATCH /api/ingredients/:id`
  - Body: `{ name?, category?, status?, notes? }`.
  - Response: `{ ingredient, event_id }`.

### Combinations

- `GET /api/combinations`
  - Response item: `{ id, name, stage, texture, items[] }`.
- `POST /api/combinations`
  - Body: `{ name, stage?, texture?, notes?, items: [{ ingredient_id, cube_count }] }`.
  - Response: `{ combination, event_id }`.
- `PATCH /api/combinations/:id`
  - Body: `{ name?, stage?, texture?, notes?, items? }`.
  - Response: `{ combination, event_id }`.
- `DELETE /api/combinations/:id`
  - Allowed only if no future meal_plan_slot references it.
  - Response: `{ event_id }`.

### Meal Plan

- `GET /api/meal-plan?week=YYYY-MM-DD`
  - `week` is the Monday or start date of a 7-day window.
  - Response: `{ week_start, slots[] }`.
- `PUT /api/meal-plan/slots/:id`
  - Body for combination slot: `{ date, meal_type, target_type: "combination", combination_id, status? }`.
  - Body for single-ingredient slot: `{ date, meal_type, target_type: "ingredient", ingredient_id, cube_count, status? }`.
  - Response: `{ slot, event_id, forecast_summary }`.
- `GET /api/forecast?week=YYYY-MM-DD`
  - Response item: `{ ingredient_id, ingredient_name, available, needed, shortage }`.

### AI

- `POST /api/ai-commands`
  - Browser caregiver flow.
  - Caller: Cloudflare Access로 로그인한 caregiver browser.
  - Parsing: Worker 내부 parser adapter가 `raw_text`를 intent로 변환한다. 외부 모델 출력은 untrusted input으로 취급하고 Worker schema validation을 다시 통과해야 한다.
  - Actor binding: `actor_email`은 Access identity에서만 가져온다. body에 들어온 actor/household 값은 무시하거나 거부한다.
  - low-risk add_stock이면 자동 반영한다.
  - high-risk 또는 ambiguous이면 승인 가능한 request type인지 allowlist로 판단하고 approval request 또는 rejected status를 생성한다.
  - Body: `{ raw_text }`.
  - Auto-applied response: `{ status: "auto_applied", command_id, event_id, undo_expires_at, inventory_delta }`.
  - Approval response: `{ status: "pending_approval", command_id, approval_request_id, reason }`.
  - Rejected response: `{ status: "rejected", command_id, reason }`.
- `POST /api/agent/ai-commands`
  - External/local AI agent proposal flow.
  - Caller: 좁은 service token을 가진 local agent 또는 GitHub Actions.
  - Body: `{ actor_email, raw_text, parsed_intent }`.
  - Worker는 service token, actor household membership, parsed_intent schema, 수량 범위, dedupe, 승인 필요 여부를 다시 검증한다.
  - 이 endpoint도 직접 DB mutation을 받지 않고 intent proposal만 받는다.
  - Response shape은 `POST /api/ai-commands`와 동일하다.
- `POST /api/ai-commands/:id/undo`
  - 3초 toast 또는 기록 화면에서 rollback.
  - Response: `{ status: "rolled_back", rollback_event_id }`.

### Approvals

- `GET /api/approval-requests`
  - Response item: `{ id, request_type, payload, status, actor_email, created_at }`.
- `POST /api/approval-requests/:id/approve`
  - 승인 가능 allowlist: `add_stock_after_review`, `stock_decrement`, `cube_lot_delete`, `single_meal_slot_change`, `week_meal_plan_change`, `ingredient_status_note`.
  - allowlist 밖의 request type은 승인할 수 없고 `422 unsupported_request_type`을 반환한다.
  - 승인 후에도 payload schema validation, household scope, 음수 재고 방지, forecast 재계산이 다시 실행된다.
  - Response: `{ status: "approved", event_id }`.
- `POST /api/approval-requests/:id/reject`
  - Response: `{ status: "rejected" }`.

### Events

- `GET /api/events`
  - Response item: `{ id, actor_email, source, type, payload, before, after, created_at, undo_event_id }`.
- `POST /api/events/:id/rollback`
  - Response: `{ rollback_event_id, recalculated_inventory, recalculated_forecast? }`.

## 13. 계산 규칙

### Current Stock Severity

```text
count = sum(cube_lots.remaining_count where ingredient_id = X)

if count <= 1: error
else if count <= 3: warn
else: ok
```

### Planned Shortage

```text
available = current ingredient cube count
needed = sum(required cubes from meal_plan_slots for next 7 days)
shortage = needed - available

if shortage > 0:
  show planned_shortage_alert(shortage)
```

### AI Dedupe

기본 dedupe window는 60초다.

```text
dedupe_key = household_id + actor_email + normalized_intent_type + ingredient_id + quantity
reject duplicate if same dedupe_key exists within 60 seconds
```

## 14. 비기능 요구사항

### 성능

- `오늘` 화면의 초기 데이터 로딩은 일반 네트워크에서 2초 이내를 목표로 한다.
- forecast 계산은 첫 릴리즈에서는 API 요청 시 계산해도 된다.
- 데이터 규모는 단일 household 기준 수천 event 수준을 가정한다.

### 보안

- Cloudflare Access로 앱 접근을 제한한다.
- API는 Access identity와 `members` table을 모두 검증한다.
- external agent proposal endpoint는 좁은 service token만 허용한다.
- broad Cloudflare token, D1 credential, GitHub admin token은 LLM context에 제공하지 않는다.
- 모든 write에는 event log가 있어야 한다.
- Browser AI flow와 external agent proposal flow는 별도 endpoint와 별도 인증 규칙을 사용한다.

### 개인정보

- public asset에 raw family/baby data를 포함하지 않는다.
- 로그에는 필요 최소한의 actor email과 operation만 저장한다.
- 의료/영양 진단 문구를 생성하지 않는다.

### 접근성

- `warn`과 `error`는 색상만으로 구분하지 않는다.
- badge text를 함께 제공한다.
- 주요 버튼은 모바일 한 손 조작을 고려한다.

## 15. 수용 기준

### AC1. 부부 공유

Given caregiver A와 caregiver B가 같은 household member일 때  
When caregiver A가 소고기 큐브 6개를 추가하면  
Then caregiver B는 refresh 후 소고기 재고 6개 증가를 볼 수 있다.

### AC2. 현재 재고 경고

Given 브로콜리 큐브가 4개일 때 Then 상태는 `ok`다.  
Given 브로콜리 큐브가 3개일 때 Then 상태는 `warn`이다.  
Given 브로콜리 큐브가 1개일 때 Then 상태는 `error`다.  
Given 브로콜리 큐브가 0개일 때 Then 상태는 `error`이고 “재고 없음”으로 표시된다.

### AC3. 부족 예정 forecast

Given 소고기 큐브 현재 재고가 5개이고 다음 7일 식단 필요량이 7개일 때  
Then 앱은 현재 재고 severity와 별도로 `부족 예정 2개`를 표시한다.

### AC4. AI 자동 재고 추가

Given caregiver가 “소고기 큐브 6개 만들었어”라고 입력했을 때  
When ingredient match가 단일하고 quantity가 1-30 범위이면  
Then 앱은 add_stock event를 생성하고 소고기 재고를 6개 증가시키며 3초 undo toast를 보여준다.

### AC5. AI 중복 방지

Given 같은 caregiver가 같은 문장을 60초 안에 다시 보냈을 때  
Then 앱은 중복으로 재고를 늘리지 않고 이미 처리된 요청임을 표시한다.

### AC6. AI rollback

Given AI add_stock event가 자동 반영되었을 때  
When 사용자가 3초 undo 또는 기록 화면 rollback을 실행하면  
Then 보상 event가 생성되고 재고가 이전 값으로 돌아간다.

### AC7. 고위험 AI 요청 승인 대기

Given caregiver가 “소고기 큐브 3개 삭제해”라고 입력했을 때  
Then 앱은 데이터를 변경하지 않고 approval request를 생성한다.

### AC8. Non-goal 보호

Then 첫 릴리즈에는 푸시/카카오/문자 알림, 여러 아이 프로필, 알레르기/영양 진단, OCR 기능이 없어야 한다.

### AC9. 권한과 household 격리

Given Access로 인증되지 않았거나 `members`에 없는 사용자가 API를 호출할 때  
Then API는 `401` 또는 `403`을 반환하고 데이터를 반환하지 않는다.  
Given 다른 household member가 임의의 household_id를 body/query에 넣어 호출할 때  
Then API는 요청 body의 household_id를 신뢰하지 않고 해당 actor의 household 범위 데이터만 접근한다.

### AC10. 단일 child profile

Given household가 초기화되었을 때  
Then `GET /api/child-profile`은 해당 household의 단일 child profile 하나를 반환한다.  
When caregiver가 child profile을 수정하면  
Then 같은 profile row가 업데이트되고 두 번째 child profile 생성은 제공되지 않는다.

## 16. 구현 단계

### Phase 0. Project Setup

- Cloudflare Pages project.
- Workers or Pages Functions setup.
- D1 database and migrations.
- Access policy for allowed caregiver emails.
- Local development seed data.
- single child profile seed.

### Phase 1. Shared Core

- household/member authorization.
- child_profile.
- ingredients.
- cube_lots.
- event log.
- current stock severity.
- `오늘` and `큐브` basic screens.

### Phase 2. Weekly Planning

- combinations.
- meal_plan_slots.
- weekly calendar UI.
- planned shortage forecast.
- `식단표`, `조합`, `재료` screens.

### Phase 3. AI Updates

- `POST /api/ai-commands`.
- intent schema and validation.
- add_stock auto-apply.
- 3초 undo toast.
- dedupe window.
- approval inbox.
- rollback.

### Phase 4. Hardening

- authorization tests.
- forecast edge cases.
- event/rollback consistency.
- mobile UX polish.
- backup/export if needed.

## 17. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| Access만 믿고 API 권한 검증 누락 | 다른 household 데이터 노출 | 모든 query에 household_id scope, members check |
| AI 중복 실행 | 재고 과대 계산 | dedupe_key와 60초 window |
| AI 오인식 | 잘못된 재고 반영 | 단일 ingredient match, 수량 1-30, undo, rollback |
| forecast와 현재 경고 혼동 | 사용자 오해 | `warn/error`와 `부족 예정`을 UI에서 별도 badge로 표시 |
| D1 schema 변경 어려움 | 개발 지연 | migrations와 event log 중심 모델 |
| 앱이 의학적 판단처럼 보임 | 안전/법적 리스크 | 진단 문구 금지, 기록/관리 도구로 제한 |

## 18. Open Decisions

PRD author가 기본값으로 정한 정책이며, 구현 중 필요하면 조정 가능하다.

- AI dedupe window: 60초.
- AI 자동 반영 수량 상한: 30 cube.
- 기본 meal types: 아침, 점심, 저녁.
- forecast window: 7일.
- 첫 릴리즈 refresh: 실시간 push 없이 manual refresh 또는 화면 진입 시 refresh.

## 19. 명시적 제외 문구

첫 릴리즈는 의료 조언 앱이 아니다. 앱은 식재료, 큐브 재고, 식단, 기록을 관리하지만 알레르기나 영양 상태를 진단하지 않는다.

첫 릴리즈는 외부 notification app이 아니다. `warn`, `error`, `부족 예정`은 앱 내부 화면에서만 표시한다.

첫 릴리즈는 multi-child SaaS가 아니다. 단일 household, 단일 child, 부부 공유에 최적화한다.

## 20. Definition of Done

- PRD의 AC1-AC10을 테스트할 수 있는 구현이 존재한다.
- Cloudflare Access로 보호된 환경에서 부부 두 계정이 같은 데이터를 본다.
- 현재 재고 `warn/error`와 식단 기반 `부족 예정`이 분리되어 표시된다.
- AI add_stock 자동 반영이 3초 undo, dedupe, rollback과 함께 동작한다.
- 모든 write operation이 event log에 남는다.
- public assets와 repository artifact에 raw family/baby data가 포함되지 않는다.
