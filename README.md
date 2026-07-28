# 오송고 사이언스 랩크루

오송고 과학실의 시약과 실험 기구를 검색하고, 과학실 예약과 공지사항을 관리하는 React 기반 통합 서비스입니다.

## 주요 기능

- Google Sheets 기반 시약·기구 재고 동기화
- 이름, 화학식, 이명, 위치를 이용한 시약 조사
- 조사 가이드와 시약 분류 기준 실시간 표시
- 학생용 폐수 분리배출 안내
- 모든 사용자의 시약 잔량 수정
- 과학실 예약 신청과 관리자 승인·거절
- 관리자 공지, 예약 차단, 재고 및 시트 리포트 관리
- 데스크톱·모바일 반응형 iOS 스타일 UI

## 로컬 실행

```bash
pnpm install
pnpm dev
```

기본 개발 주소는 `http://localhost:8443`이며, 환경에 따라 Vite가 다른 포트를 사용할 수 있습니다.

## 빌드

```bash
pnpm build
```

## Supabase 설정

예약, 공지, 예약 차단과 공유 잔량을 여러 기기에서 사용하려면 Supabase Dashboard의 SQL Editor에서 `supabase-schema.sql`을 한 번 실행해야 합니다.
질문·답변 테이블만 추가하거나 질문방에서 `PGRST205` 오류가 표시되면 `supabase-qna-schema.sql`을 실행하세요.

시약·기구 원본 정보는 공개 Google Sheets에서 읽고, 사용자가 수정한 잔량은 Supabase overlay로 안전하게 분리해 저장합니다.
