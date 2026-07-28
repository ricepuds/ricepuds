import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createQuestion,
  createQuestionAnswer,
  loadQuestionThreads,
} from "./supabase"
import type { AuthUser, QuestionPost } from "./types"

interface QnaPageProps {
  user: AuthUser | null
  onRequireLogin: () => void
  onToast: (text: string, tone?: "default" | "success" | "error") => void
}

const QUESTION_LIMIT = 500
const ANSWER_LIMIT = 1000

type QuestionLoadError = "" | "schema" | "request"

function isMissingQuestionSchema(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST205"
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function avatarLabel(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

export default function QnaPage({
  user,
  onRequireLogin,
  onToast,
}: QnaPageProps) {
  const [questions, setQuestions] = useState<QuestionPost[]>([])
  const [questionDraft, setQuestionDraft] = useState("")
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<QuestionLoadError>("")
  const [submittingQuestion, setSubmittingQuestion] = useState(false)
  const [submittingAnswer, setSubmittingAnswer] = useState<string | null>(null)

  const answeredCount = useMemo(
    () => questions.filter((question) => question.answers.length > 0).length,
    [questions],
  )

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setLoadError("")

    try {
      setQuestions(await loadQuestionThreads())
    } catch (error) {
      setLoadError(isMissingQuestionSchema(error) ? "schema" : "request")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  const handleQuestionSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!user) {
      onRequireLogin()
      return
    }

    const content = questionDraft.trim()
    if (!content) {
      onToast("질문 내용을 입력해 주세요.", "error")
      return
    }

    setSubmittingQuestion(true)
    try {
      const created = await createQuestion(content)
      setQuestions((current) => [created, ...current])
      setQuestionDraft("")
      onToast("질문을 등록했습니다.", "success")
    } catch {
      onToast("질문을 서버에 저장하지 못했습니다.", "error")
    } finally {
      setSubmittingQuestion(false)
    }
  }

  const handleAnswerSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    questionId: string,
  ) => {
    event.preventDefault()
    if (!user) {
      onRequireLogin()
      return
    }

    const content = (answerDrafts[questionId] ?? "").trim()
    if (!content) {
      onToast("답변 내용을 입력해 주세요.", "error")
      return
    }

    setSubmittingAnswer(questionId)
    try {
      const created = await createQuestionAnswer(questionId, content)
      setQuestions((current) =>
        current.map((question) =>
          question.id === questionId
            ? {
                ...question,
                answers: [...question.answers, created],
              }
            : question,
        ),
      )
      setAnswerDrafts((current) => ({ ...current, [questionId]: "" }))
      onToast("답변을 등록했습니다.", "success")
    } catch {
      onToast("답변을 서버에 저장하지 못했습니다.", "error")
    } finally {
      setSubmittingAnswer(null)
    }
  }

  return (
    <main className="questions-page" id="main-content">
      <div className="questions-shell">
        <section className="questions-hero">
          <div>
            <p className="eyebrow">Ask &amp; answer</p>
            <h1>오송도손</h1>
            <p>
              모르는 내용은 편하게 묻고, 알고 있는 내용은 친절하게 답해 주세요.
            </p>
          </div>
          <div className="questions-summary" aria-label="오송도손 현황">
            <span>
              <strong>{questions.length.toLocaleString("ko-KR")}</strong>
              질문
            </span>
            <span>
              <strong>{answeredCount.toLocaleString("ko-KR")}</strong>
              답변 완료
            </span>
            <button
              disabled={loading}
              onClick={() => void loadQuestions()}
              type="button"
            >
              {loading ? "불러오는 중" : "새로고침"}
            </button>
          </div>
        </section>

        <section className="ios-card question-composer">
          {user ? (
            <form onSubmit={handleQuestionSubmit}>
              <label htmlFor="new-question">무엇이 궁금한가요?</label>
              <textarea
                id="new-question"
                maxLength={QUESTION_LIMIT}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="예: 산과 염기를 섞으면 왜 온도가 변하나요?"
                rows={3}
                value={questionDraft}
              />
              <footer>
                <span>
                  {questionDraft.length.toLocaleString("ko-KR")} /{" "}
                  {QUESTION_LIMIT.toLocaleString("ko-KR")}
                </span>
                <button
                  className="button primary"
                  disabled={
                    submittingQuestion ||
                    !questionDraft.trim() ||
                    loadError === "schema"
                  }
                  type="submit"
                >
                  {submittingQuestion ? "등록 중…" : "질문 올리기"}
                </button>
              </footer>
            </form>
          ) : (
            <div className="questions-login-prompt">
              <div>
                <span aria-hidden="true">?</span>
                <div>
                  <strong>질문이나 답변을 남기고 싶나요?</strong>
                  <p>로그인하면 바로 대화에 참여할 수 있어요.</p>
                </div>
              </div>
              <button
                className="button primary"
                onClick={onRequireLogin}
                type="button"
              >
                로그인
              </button>
            </div>
          )}
        </section>

        {loadError && (
          <section className="questions-error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>
                {loadError === "schema"
                  ? "오송도손 설정이 필요합니다"
                  : "연결을 확인해 주세요"}
              </strong>
              <p>
                {loadError === "schema"
                  ? "오송도손의 질문·답변 데이터베이스가 아직 준비되지 않았습니다. 관리자에게 문의해 주세요."
                  : "오송도손을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
              </p>
            </div>
            <button onClick={() => void loadQuestions()} type="button">
              {loadError === "schema" ? "다시 확인" : "다시 시도"}
            </button>
          </section>
        )}

        <section
          aria-busy={loading}
          aria-live="polite"
          className="question-thread-list"
        >
          {loading ? (
            [0, 1, 2].map((item) => (
              <div className="question-thread is-loading" key={item}>
                <i />
                <i />
                <i />
              </div>
            ))
          ) : questions.length ? (
            questions.map((question) => {
              const answerDraft = answerDrafts[question.id] ?? ""

              return (
                <article className="question-thread" key={question.id}>
                  <header className="question-thread-header">
                    <span className="question-avatar" aria-hidden="true">
                      {avatarLabel(question.authorName)}
                    </span>
                    <div>
                      <strong>{question.authorName}</strong>
                      <time dateTime={question.createdAt}>
                        {formatDate(question.createdAt)}
                      </time>
                    </div>
                    <span className="question-answer-count">
                      답변 {question.answers.length.toLocaleString("ko-KR")}개
                    </span>
                  </header>

                  <div className="question-message">
                    <span>질문</span>
                    <p>{question.content}</p>
                  </div>

                  {question.answers.length > 0 ? (
                    <ol
                      aria-label={question.content + "의 답변"}
                      className="answer-list"
                    >
                      {question.answers.map((answer) => (
                        <li key={answer.id}>
                          <div className="answer-meta">
                            <span aria-hidden="true">
                              {avatarLabel(answer.authorName)}
                            </span>
                            <strong>{answer.authorName}</strong>
                            <time dateTime={answer.createdAt}>
                              {formatDate(answer.createdAt)}
                            </time>
                          </div>
                          <p>{answer.content}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="answer-empty">
                      아직 답변이 없습니다. 알고 있다면 첫 답변을 남겨 주세요.
                    </p>
                  )}

                  {user ? (
                    <form
                      className="answer-composer"
                      onSubmit={(event) =>
                        void handleAnswerSubmit(event, question.id)
                      }
                    >
                      <label
                        className="sr-only"
                        htmlFor={"answer-" + question.id}
                      >
                        {question.content}에 답변하기
                      </label>
                      <textarea
                        id={"answer-" + question.id}
                        maxLength={ANSWER_LIMIT}
                        onChange={(event) =>
                          setAnswerDrafts((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="아는 내용을 답변해 주세요"
                        rows={2}
                        value={answerDraft}
                      />
                      <div>
                        <span>
                          {answerDraft.length.toLocaleString("ko-KR")} /{" "}
                          {ANSWER_LIMIT.toLocaleString("ko-KR")}
                        </span>
                        <button
                          disabled={
                            submittingAnswer === question.id ||
                            !answerDraft.trim()
                          }
                          type="submit"
                        >
                          {submittingAnswer === question.id
                            ? "등록 중…"
                            : "답변 등록"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="answer-login-button"
                      onClick={onRequireLogin}
                      type="button"
                    >
                      로그인하고 답변하기
                    </button>
                  )}
                </article>
              )
            })
          ) : !loadError ? (
            <div className="questions-empty">
              <span aria-hidden="true">?</span>
              <h2>아직 등록된 질문이 없습니다</h2>
              <p>궁금했던 과학 질문을 가장 먼저 남겨 보세요.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
