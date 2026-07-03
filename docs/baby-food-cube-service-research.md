# 이유식 큐브 재고관리 서비스 리서치 보고서

## 결론

추천 기본안은 `GitHub Pages + Git 데이터베이스`가 아니라 `정적 PWA + IndexedDB local-first + 암호화 export/import`입니다. GitHub Pages나 Cloudflare Pages에는 앱 UI만 올리고, 아이 식단·재고·반응 데이터는 기본적으로 브라우저 로컬에 둡니다.

이유는 간단합니다. GitHub Pages는 정적 사이트 호스팅이고, 일반 published Pages 사이트는 인터넷에 공개됩니다. GitHub Docs도 private repository에서 만든 Pages라도 published site가 공개될 수 있고, 민감한 데이터를 제거하라고 경고합니다. Private Pages access control은 GitHub Enterprise Cloud 조직용 기능입니다.

다만 사용자가 원한 “AI agent가 데이터 수정하고 GitHub에 반영, 이후 Pages에서 확인”은 제한적으로 가능합니다. 안전한 방식은 GitHub를 데이터베이스가 아니라 PR 기반 변경 로그로 쓰는 것입니다. AI가 append-only event를 만들고, 검증 workflow가 통과하면 PR을 merge하고, Pages는 앱 셸 또는 public-safe/encrypted artifact만 배포합니다.

## 추천 아키텍처

### 1단계 MVP

- `React/Vite` 또는 비슷한 정적 PWA.
- Hosting: GitHub Pages 또는 Cloudflare Pages.
- Primary data: IndexedDB.
- Backup: JSON/CSV export, optional encrypted backup.
- UI tabs: `오늘`, `식단표`, `큐브`, `재료`, `조합`, `기록`.
- AI: 직접 쓰기 대신 import patch 생성과 확인 UI.

### 공유/동기화가 필요해질 때

- 가장 단순: Firebase Firestore.
- 개발자 제어권 중시: Cloudflare Pages + Workers + D1.
- 브라우저 local-first sync 중시: Dexie Cloud.

Firestore는 오프라인 지속성과 재동기화를 공식 지원하지만 같은 문서 충돌은 last-write-wins입니다. Cloudflare D1은 저렴하고 통제 가능하지만 auth, query, index 설계 책임이 더 큽니다.

## 요구 기능 대응

| 요구 | 설계 |
|---|---|
| 재고관리 | `CubeLot`에 제조일, 소비기한, 남은 큐브 수, g/ml per cube |
| 수량 미달 확인 | `StockRule`로 최소 큐브 수와 주간 식단 예약분 반영 |
| 아직 안먹어본 식재료 등록 | `Ingredient.status = not_tried/planned/testing/tolerated` |
| 큐브 조합 관리 | `Combination`에 필요한 큐브와 알레르기 태그 |
| 1주일 식단 관리 | `MealPlanSlot`으로 날짜, 식사 종류, 조합, 도입 식재료 |
| UI + AI 업데이트 | 모바일 PWA + AI 변경안 preview/import |
| GitHub Pages 확인 | 앱 셸 배포에는 적합, 원본 개인정보 데이터 배포에는 부적합 |

## AI 업데이트 파이프라인

안전한 흐름:

1. 사용자가 “소고기 큐브 6개 만들었어”라고 요청.
2. AI가 `{ op: "add_stock", product: "소고기 큐브", quantity: 6 }` 같은 구조화 변경안 생성.
3. validator가 SKU, 단위, 수량, 권한, 음수 재고, 중복 요청을 검사.
4. 애매하거나 큰 변경은 확인 요청.
5. append-only event로 저장.
6. 현재 재고와 식단을 재계산.
7. 감사 로그와 rollback handle 남김.

LLM이 GitHub token이나 DB credential을 직접 들고 쓰는 구조는 피해야 합니다.

## GitHub 기반을 꼭 쓰는 경우

Repo shape:

```text
schemas/
data/
  products/
  events/
  generated/
scripts/
  validate-data.mjs
  materialize-inventory.mjs
  redact-public-data.mjs
.github/
  workflows/validate.yml
  workflows/pages.yml
```

원칙:

- direct push to `main` 금지.
- AI는 branch + PR만 생성.
- event는 파일 하나당 하나로 append-only.
- raw baby/family data는 `public/`에 배포하지 않음.
- Pages에는 앱 셸 또는 암호화/public-safe snapshot만 배포.

## 최종 추천

처음 만들 때는 `local-first PWA`로 시작하세요. 이게 가장 적은 비용으로 가장 안전합니다. 가족 간 실시간 공유가 실제 요구가 되면 Firestore 또는 Dexie Cloud로 sync를 붙이고, 운영/비용 통제를 더 원하면 Cloudflare Workers + D1로 갑니다.

GitHub Pages + AI commit 방식은 “앱 배포와 변경 감사”에는 좋지만 “아이 식단 데이터 원본 저장소”로는 기본값이 아닙니다.

## 한계와 확인 필요 사항

- 이 보고서는 desk research 기반입니다. 실제 부모 사용성은 “빠른 기록”과 “AI 변경 확인” 사이의 마찰을 사용자 인터뷰나 프로토타입 테스트로 확인해야 합니다.
- 앱은 식재료 도입과 반응을 기록할 수는 있지만 알레르기나 영양 상태를 진단하면 안 됩니다. AI 영양 분석이나 의료적 조언을 넣는다면 별도 법률·의료 검토가 필요합니다.
- 암호화 백업은 추천 방향이지만, 실제 비밀번호 복구 정책과 휴대폰 성능에서의 KDF 비용은 구현 전에 측정해야 합니다.
- GitHub 기반 업데이트는 감사/배포 워크플로로는 유용하지만 실시간 동기화 DB가 아닙니다. 가족 다중기기 동기화가 핵심 요구가 되면 Firestore, Dexie Cloud, Cloudflare D1 같은 동기화 계층을 별도로 선택해야 합니다.

## 주요 출처

- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages site creation and warnings](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [GitHub Enterprise private Pages](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)
- [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents)
- [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [Firebase Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase Firestore quotas](https://firebase.google.com/docs/firestore/quotas)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [OWASP LLM Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
