# Science Lab

오송고 과학실 시약과 실험실 기구를 공간별로 확인하는 정적 HTML/CSS/JS 분류표입니다.

## 분류

- `시약`: 기존 시약 데이터
- `화학실`: `실험실 기구 목록.xlsx`의 `화학실(분)` 시트
- `생명실`: `실험실 기구 목록.xlsx`의 `생명실(노)` 시트
- `준비실`: `실험실 기구 목록.xlsx`의 `준비실(보)` 시트
- `전체`: 위 4개 분류 통합 검색

엑셀의 `물품명 / 갯수 / 위치` 표는 `data/lab-items.js`로 변환해 사용합니다.

로그인은 Supabase Auth 이메일/비밀번호 방식입니다. 이메일 인증 없이 바로 가입/로그인하려면 Supabase Dashboard > Authentication > Providers > Email에서 `Confirm email`을 꺼야 합니다.

관리자 패널은 `auth.js`의 `ADMIN_EMAILS`에 등록된 이메일로 로그인했을 때만 표시됩니다. 현재 관리자 이메일은 `rices2114@gmail.com`입니다.

## 로컬 실행

```bash
node dev-server.js
```

브라우저에서 `http://127.0.0.1:5500/`를 엽니다.

## Supabase 저장

예약 요청과 공지사항은 Supabase 테이블이 있으면 Supabase에 저장됩니다. 배포 전에 Supabase Dashboard > SQL editor에서 `supabase-schema.sql` 내용을 한 번 실행하세요. 테이블 연결에 실패하면 기존처럼 브라우저 로컬 저장소에 임시 저장됩니다.
