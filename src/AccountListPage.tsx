import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ACCOUNT_LIST_VIEWER_EMAIL,
  loadAccountList,
} from "./supabase"
import type { AccountListItem } from "./types"

type AccountLoadError = "" | "permission" | "schema" | "request"

const ACCOUNT_LOAD_ERROR_MESSAGE: Record<Exclude<AccountLoadError, "">, string> = {
  permission:
    "로그인 세션이 만료되었거나 계정 목록을 확인할 권한이 없습니다. 다시 로그인해 주세요.",
  schema:
    "계정 목록 기능이 아직 서버에 적용되지 않았습니다. 최신 Supabase 스키마를 먼저 실행해 주세요.",
  request:
    "계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
}

function classifyAccountLoadError(error: unknown): Exclude<AccountLoadError, ""> {
  if (!error || typeof error !== "object") return "request"

  const code = "code" in error ? String(error.code ?? "") : ""
  const status = "status" in error ? Number(error.status) : 0
  const message =
    "message" in error ? String(error.message ?? "").toLowerCase() : ""

  if (["42883", "PGRST202"].includes(code) || message.includes("schema cache")) {
    return "schema"
  }
  if (
    code === "42501" ||
    status === 401 ||
    status === 403 ||
    message.includes("jwt") ||
    message.includes("권한")
  ) {
    return "permission"
  }
  return "request"
}

function formatAccountDate(value: string | null): string {
  if (!value) return "기록 없음"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "기록 없음"

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function avatarLabel(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

export default function AccountListPage() {
  const [accounts, setAccounts] = useState<AccountListItem[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<AccountLoadError>("")
  const loadRequestRef = useRef(0)

  const loadAccounts = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoading(true)
    setLoadError("")

    try {
      const nextAccounts = await loadAccountList()
      if (loadRequestRef.current !== requestId) return
      setAccounts(nextAccounts)
    } catch (error) {
      if (loadRequestRef.current !== requestId) return
      setAccounts([])
      setLoadError(classifyAccountLoadError(error))
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
    return () => {
      loadRequestRef.current += 1
    }
  }, [loadAccounts])

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR")
    if (!normalizedQuery) return accounts

    return accounts.filter((account) =>
      `${account.name} ${account.email}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery),
    )
  }, [accounts, query])

  const adminCount = accounts.filter((account) => account.isAdmin).length
  const renameCount = accounts.filter(
    (account) => account.canChangeName,
  ).length
  const formatCount = (count: number) =>
    loading || loadError ? "—" : count.toLocaleString("ko-KR")

  return (
    <main className="account-list-page" id="main-content">
      <div className="account-list-shell">
        <header className="account-list-hero">
          <div>
            <p className="eyebrow">Private account directory</p>
            <h1>계정 목록</h1>
            <p>
              가입한 계정의 이름과 이메일, 가입일과 최근 로그인 기록을
              확인합니다.
            </p>
          </div>
          <div className="account-list-lock">
            <span aria-hidden="true">⌁</span>
            <div>
              <strong>소유자 전용</strong>
              <small>{ACCOUNT_LIST_VIEWER_EMAIL}</small>
            </div>
          </div>
        </header>

        <section aria-label="계정 현황" className="account-list-stats">
          <div>
            <span>전체 계정</span>
            <strong>{formatCount(accounts.length)}</strong>
          </div>
          <div>
            <span>관리자</span>
            <strong>{formatCount(adminCount)}</strong>
          </div>
          <div>
            <span>이름 변경 가능</span>
            <strong>{formatCount(renameCount)}</strong>
          </div>
        </section>

        <section className="ios-card account-list-card">
          <header className="account-list-toolbar">
            <label>
              <span>계정 검색</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름 또는 이메일 검색"
                type="search"
                value={query}
              />
            </label>
            <div>
              <span aria-live="polite">
                {filteredAccounts.length.toLocaleString("ko-KR")}명 표시
              </span>
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void loadAccounts()}
                type="button"
              >
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>
          </header>

          {loading ? (
            <div
              aria-live="polite"
              className="account-list-state"
              role="status"
            >
              <span aria-hidden="true" className="button-spinner" />
              <p>계정 정보를 안전하게 불러오고 있습니다.</p>
            </div>
          ) : loadError ? (
            <div className="account-list-state is-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{ACCOUNT_LOAD_ERROR_MESSAGE[loadError]}</p>
              <button
                className="button secondary"
                onClick={() => void loadAccounts()}
                type="button"
              >
                다시 시도
              </button>
            </div>
          ) : filteredAccounts.length ? (
            <div className="account-record-grid">
              {filteredAccounts.map((account, index) => (
                <article
                  aria-labelledby={`account-record-${index}-name`}
                  className="account-record-card"
                  key={`${account.email}-${account.createdAt}`}
                >
                  <header>
                    <span className="account-record-avatar" aria-hidden="true">
                      {avatarLabel(account.name)}
                    </span>
                    <div className="account-record-identity">
                      <h2 id={`account-record-${index}-name`}>
                        {account.name}
                      </h2>
                      <span>{account.email || "이메일 없음"}</span>
                    </div>
                    <div className="account-record-badges">
                      {account.email === ACCOUNT_LIST_VIEWER_EMAIL && (
                        <span className="is-owner">소유자</span>
                      )}
                      {account.isAdmin && <span>관리자</span>}
                    </div>
                  </header>

                  <dl>
                    <div>
                      <dt>가입일</dt>
                      <dd>{formatAccountDate(account.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>최근 로그인</dt>
                      <dd>{formatAccountDate(account.lastSignInAt)}</dd>
                    </div>
                    <div>
                      <dt>이름 상태</dt>
                      <dd>
                        {account.canChangeName ? "1회 변경 가능" : "이름 확정"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="account-list-state">
              <span aria-hidden="true">⌕</span>
              <p>
                {query
                  ? "검색 조건에 맞는 계정이 없습니다."
                  : "등록된 계정이 없습니다."}
              </p>
            </div>
          )}

          <footer className="account-list-privacy-note">
            <span aria-hidden="true">✓</span>
            <p>
              비밀번호와 인증 토큰은 Supabase에서 보호되며 이 화면에서는
              조회하거나 표시하지 않습니다.
            </p>
          </footer>
        </section>
      </div>
    </main>
  )
}
