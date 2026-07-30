import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type InvalidEvent,
  type MouseEvent,
} from "react"
import {
  getAuthErrorMessage,
  normalizeDisplayName,
  signIn,
  signOut,
  signUp,
  updateDisplayName,
} from "./supabase"
import type { AuthUser } from "./types"

type ToastTone = "default" | "success" | "error"
type ToastHandler = (text: string, tone?: ToastTone) => void
type AuthMode = "login" | "signup"

export interface AuthModalProps {
  onClose(): void
  onToast: ToastHandler
}

export interface AccountModalProps {
  user: AuthUser
  inventorySummary: {
    total: number
    reagents: number
    equipment: number
    alerts: number
  }
  onClose(): void
  onOpenAdmin(): void
  onProfileUpdated(name: string): void
  onToast: ToastHandler
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function useDialogAccessibility(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow

    const getFocusableElements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      )

    const focusTimer = window.setTimeout(() => {
      const autofocusTarget = dialog?.querySelector<HTMLElement>(
        "[data-dialog-autofocus]",
      )
      const firstFocusable = getFocusableElements()[0]
      ;(autofocusTarget ?? firstFocusable ?? dialog)?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== "Tab" || !dialog) {
        return
      }

      const focusableElements = getFocusableElements()

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus()
    }
  }, [])

  return dialogRef
}

function getAvatarLabel(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function handleBackdropMouseDown(
  event: MouseEvent<HTMLDivElement>,
  onClose: () => void,
) {
  if (event.target === event.currentTarget) {
    onClose()
  }
}

export function AuthModal({ onClose, onToast }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const dialogRef = useDialogAccessibility(onClose)
  const titleId = useId()
  const subtitleId = useId()
  const loginTabId = useId()
  const signupTabId = useId()
  const panelId = useId()

  const selectMode = (nextMode: AuthMode) => {
    if (loading || nextMode === mode) {
      return
    }

    setMode(nextMode)
    setPasswordConfirmation("")
    setErrorMessage("")
  }

  const handleNameInvalid = (event: InvalidEvent<HTMLInputElement>) => {
    event.preventDefault()
    setErrorMessage(
      event.currentTarget.validity.valueMissing
        ? "이름을 입력해 주세요."
        : "이름은 40자 이하로 입력해 주세요.",
    )
  }

  const handleEmailInvalid = (event: InvalidEvent<HTMLInputElement>) => {
    event.preventDefault()
    setErrorMessage(
      event.currentTarget.validity.valueMissing
        ? "이메일을 입력해 주세요."
        : "올바른 이메일 주소를 입력해 주세요.",
    )
  }

  const handlePasswordInvalid = (event: InvalidEvent<HTMLInputElement>) => {
    event.preventDefault()
    setErrorMessage(
      event.currentTarget.validity.valueMissing
        ? "비밀번호를 입력해 주세요."
        : "비밀번호는 6자 이상 입력해 주세요.",
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setErrorMessage("")
    const displayName = normalizeDisplayName(name)

    if (!displayName || displayName.length > 40) {
      setErrorMessage("이름은 1자 이상 40자 이하로 입력해 주세요.")
      return
    }

    if (mode === "signup" && password !== passwordConfirmation) {
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
      return
    }

    setLoading(true)
    let keepOpen = true

    try {
      if (mode === "login") {
        const result = await signIn(email, password, displayName)
        onToast(
          result.nameWasSet
            ? "로그인하고 이름을 설정했습니다."
            : "로그인했습니다.",
          "success",
        )
        keepOpen = false
        onClose()
        return
      }

      const hasSession = await signUp(email, password, displayName)

      if (hasSession) {
        onToast("회원가입과 로그인이 완료되었습니다.", "success")
        keepOpen = false
        onClose()
        return
      }

      onToast(
        "회원가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.",
        "success",
      )
      setMode("login")
      setPassword("")
      setPasswordConfirmation("")
    } catch (error) {
      const message = getAuthErrorMessage(error, mode)
      setErrorMessage(message)
      onToast(message, "error")
    } finally {
      if (keepOpen) {
        setLoading(false)
      }
    }
  }

  return (
    <div
      className="modal-overlay auth-modal-overlay"
      onMouseDown={(event) => handleBackdropMouseDown(event, onClose)}
    >
      <section
        aria-busy={loading}
        aria-describedby={subtitleId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-content auth-modal-content"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-heading">
            <p className="modal-kicker">Science Lab Account</p>
            <h2 id={titleId}>{mode === "login" ? "로그인" : "회원가입"}</h2>
            <p className="modal-subtitle" id={subtitleId}>
              계정으로 분류표와 예약 상태를 안전하게 이어서 확인하세요.
            </p>
          </div>
          <button
            aria-label="계정 창 닫기"
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div aria-label="계정 모드" className="auth-tabs" role="tablist">
          <button
            aria-controls={panelId}
            aria-selected={mode === "login"}
            className={`auth-tab${mode === "login" ? " is-active" : ""}`}
            disabled={loading}
            id={loginTabId}
            onClick={() => selectMode("login")}
            role="tab"
            type="button"
          >
            로그인
          </button>
          <button
            aria-controls={panelId}
            aria-selected={mode === "signup"}
            className={`auth-tab${mode === "signup" ? " is-active" : ""}`}
            disabled={loading}
            id={signupTabId}
            onClick={() => selectMode("signup")}
            role="tab"
            type="button"
          >
            회원가입
          </button>
        </div>

        <form
          aria-labelledby={mode === "login" ? loginTabId : signupTabId}
          className="modal-form auth-form"
          id={panelId}
          onSubmit={handleSubmit}
          role="tabpanel"
        >
          <label className="form-field">
            <span>이름</span>
            <input
              autoComplete="name"
              data-dialog-autofocus
              disabled={loading}
              maxLength={40}
              onChange={(event) => {
                setName(event.target.value)
                setErrorMessage("")
              }}
              onInvalid={handleNameInvalid}
              placeholder="사용할 이름을 입력해 주세요"
              required
              type="text"
              value={name}
            />
          </label>

          <label className="form-field">
            <span>이메일</span>
            <input
              autoComplete="email"
              disabled={loading}
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value)
                setErrorMessage("")
              }}
              onInvalid={handleEmailInvalid}
              placeholder="example@email.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="form-field">
            <span>비밀번호</span>
            <input
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              disabled={loading}
              minLength={6}
              onChange={(event) => {
                setPassword(event.target.value)
                setErrorMessage("")
              }}
              onInvalid={handlePasswordInvalid}
              placeholder="6자 이상 입력해 주세요"
              required
              type="password"
              value={password}
            />
          </label>

          {mode === "signup" && (
            <label className="form-field">
              <span>비밀번호 확인</span>
              <input
                autoComplete="new-password"
                disabled={loading}
                minLength={6}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value)
                  setErrorMessage("")
                }}
                onInvalid={handlePasswordInvalid}
                placeholder="비밀번호를 한 번 더 입력해 주세요"
                required
                type="password"
                value={passwordConfirmation}
              />
            </label>
          )}

          <p
            aria-live="assertive"
            className={`error-msg auth-error${
              errorMessage ? " is-visible" : ""
            }`}
            role={errorMessage ? "alert" : undefined}
          >
            {errorMessage}
          </p>

          <p className="auth-helper">
            {mode === "login"
              ? "기존 계정은 첫 로그인 때 입력한 이름으로 한 번만 이름을 정할 수 있습니다."
              : "이 이름은 질문과 답변의 작성자명으로 표시됩니다."}
          </p>

          <div className="modal-actions">
            <button
              className="button primary auth-submit"
              disabled={loading}
              type="submit"
            >
              {loading && (
                <span aria-hidden="true" className="button-spinner" />
              )}
              {loading
                ? mode === "login"
                  ? "로그인 중…"
                  : "가입 중…"
                : mode === "login"
                  ? "로그인"
                  : "가입하기"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function AccountModal({
  user,
  inventorySummary,
  onClose,
  onOpenAdmin,
  onProfileUpdated,
  onToast,
}: AccountModalProps) {
  const [loading, setLoading] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(user.name)
  const [errorMessage, setErrorMessage] = useState("")
  const dialogRef = useDialogAccessibility(onClose)
  const titleId = useId()
  const subtitleId = useId()
  const metrics = [
    { label: "전체 물품", value: inventorySummary.total },
    { label: "시약", value: inventorySummary.reagents },
    { label: "기구", value: inventorySummary.equipment },
    { label: "주의 항목", value: inventorySummary.alerts },
  ]

  const handleNameUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading || savingName || !user.canChangeName) return

    const displayName = normalizeDisplayName(nameDraft)
    if (!displayName || displayName.length > 40) {
      setErrorMessage("이름은 1자 이상 40자 이하로 입력해 주세요.")
      return
    }

    setSavingName(true)
    setErrorMessage("")
    try {
      const profile = await updateDisplayName(displayName)
      setNameDraft(profile.name)
      onProfileUpdated(profile.name)
      onToast(
        "이름을 변경했습니다. 이 이름은 다시 변경할 수 없습니다.",
        "success",
      )
    } catch (error) {
      const message = getAuthErrorMessage(error, "login")
      setErrorMessage(message)
      onToast(message, "error")
    } finally {
      setSavingName(false)
    }
  }

  const handleLogout = async () => {
    if (loading) {
      return
    }

    setLoading(true)
    setErrorMessage("")
    let keepOpen = true

    try {
      await signOut()
      onToast("로그아웃했습니다.", "success")
      keepOpen = false
      onClose()
    } catch (error) {
      const authMessage = getAuthErrorMessage(error, "login")
      const message =
        authMessage === "로그인에 실패했습니다."
          ? "로그아웃에 실패했습니다."
          : authMessage
      setErrorMessage(message)
      onToast(message, "error")
    } finally {
      if (keepOpen) {
        setLoading(false)
      }
    }
  }

  return (
    <div
      className="modal-overlay account-modal-overlay"
      onMouseDown={(event) => handleBackdropMouseDown(event, onClose)}
    >
      <section
        aria-busy={loading || savingName}
        aria-describedby={subtitleId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-content account-modal-content"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-heading">
            <p className="modal-kicker">My Account</p>
            <h2 id={titleId}>내 계정</h2>
            <p className="modal-subtitle" id={subtitleId}>
              현재 로그인된 계정과 이용 권한입니다.
            </p>
          </div>
          <button
            aria-label="내 계정 창 닫기"
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="account-profile-card">
          <span
            aria-hidden="true"
            className="account-avatar account-avatar-large"
          >
            {getAvatarLabel(user.name)}
          </span>
          <div className="account-profile-copy">
            <strong>{user.name}</strong>
            <span className="account-email">{user.email}</span>
            <span className={`account-role${user.isAdmin ? " is-admin" : ""}`}>
              {user.isAdmin ? "관리자" : "일반 사용자"}
            </span>
          </div>
        </div>

        <dl className="account-details">
          <div className="account-detail-row">
            <dt>계정 상태</dt>
            <dd>
              <span className="account-state-dot" aria-hidden="true" />
              로그인됨
            </dd>
          </div>
          <div className="account-detail-row">
            <dt>표시 이름</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="account-detail-row">
            <dt>이용 권한</dt>
            <dd>
              {user.isAdmin ? "재고·예약·공지 관리" : "재고 열람·예약 신청"}
            </dd>
          </div>
        </dl>

        {user.canChangeName && (
          <form className="account-name-editor" onSubmit={handleNameUpdate}>
            <div>
              <strong>이름을 한 번 변경할 수 있어요</strong>
              <span>기존 계정에 제공되는 1회 변경 기회입니다.</span>
            </div>
            <label className="form-field">
              <span>새 이름</span>
              <input
                autoComplete="name"
                disabled={loading || savingName}
                maxLength={40}
                onChange={(event) => {
                  setNameDraft(event.target.value)
                  setErrorMessage("")
                }}
                placeholder="새 이름을 입력해 주세요"
                required
                type="text"
                value={nameDraft}
              />
            </label>
            <button
              className="button primary"
              disabled={loading || savingName}
              type="submit"
            >
              {savingName && (
                <span aria-hidden="true" className="button-spinner" />
              )}
              {savingName ? "변경 중…" : "이 이름으로 확정"}
            </button>
          </form>
        )}

        {user.isAdmin && (
          <section
            aria-label="관리자 재고 요약"
            className="account-admin-summary"
          >
            <div className="account-admin-heading">
              <div>
                <p className="modal-kicker">Admin overview</p>
                <h3>관리자 요약</h3>
              </div>
              <span className="account-admin-badge">관리자</span>
            </div>

            <div className="account-metrics">
              {metrics.map((metric) => (
                <div className="account-metric" key={metric.label}>
                  <strong>{metric.value.toLocaleString("ko-KR")}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>

            <button
              className="button secondary account-admin-open"
              disabled={loading || savingName}
              onClick={onOpenAdmin}
              type="button"
            >
              관리자 패널 열기
            </button>
          </section>
        )}

        <p
          aria-live="assertive"
          className={`error-msg account-error${
            errorMessage ? " is-visible" : ""
          }`}
          role={errorMessage ? "alert" : undefined}
        >
          {errorMessage}
        </p>

        <div className="modal-actions modal-actions-split">
          <button
            className="button secondary"
            disabled={loading || savingName}
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
          <button
            className="button danger account-logout"
            disabled={loading || savingName}
            onClick={handleLogout}
            type="button"
          >
            {loading && <span aria-hidden="true" className="button-spinner" />}
            {loading ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
      </section>
    </div>
  )
}
