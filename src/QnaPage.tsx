import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createQuestion,
  createQuestionAnswer,
  deleteQuestion,
  loadQuestionThreads,
  type QuestionSubmitStage,
} from "./supabase"
import {
  prepareQuestionImageFile,
  QUESTION_IMAGE_ACCEPT,
  QUESTION_IMAGE_MAX_COUNT,
} from "./questionImages"
import type { AuthUser, QuestionPost } from "./types"

interface QnaPageProps {
  user: AuthUser | null
  onRequireLogin: () => void
  onToast: (text: string, tone?: "default" | "success" | "error") => void
}

const QUESTION_LIMIT = 500
const ANSWER_LIMIT = 1000

interface QuestionImageDraft {
  id: string
  file: File
  previewUrl: string
}

type QuestionLoadError = "" | "schema" | "request"

function isMissingQuestionSchema(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["42703", "PGRST202", "PGRST204", "PGRST205"].includes(
      String((error as { code?: unknown }).code ?? ""),
    )
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

function questionSubmitErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (
    ["사진", "JPG", "질문에는", "질문을 등록", "이 브라우저"].some((prefix) =>
      message.startsWith(prefix),
    )
  ) {
    return message
  }
  return "질문을 서버에 저장하지 못했습니다."
}

export default function QnaPage({
  user,
  onRequireLogin,
  onToast,
}: QnaPageProps) {
  const [questions, setQuestions] = useState<QuestionPost[]>([])
  const [questionDraft, setQuestionDraft] = useState("")
  const [questionImages, setQuestionImages] = useState<QuestionImageDraft[]>([])
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [anonymousAnswers, setAnonymousAnswers] =
    useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<QuestionLoadError>("")
  const [processingImages, setProcessingImages] = useState(false)
  const [questionSubmitStage, setQuestionSubmitStage] =
    useState<"idle" | QuestionSubmitStage>("idle")
  const [submittingAnswer, setSubmittingAnswer] = useState<string | null>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  )
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(
    null,
  )
  const loadRequestRef = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageProcessRequestRef = useRef(0)
  const questionImagesRef = useRef<QuestionImageDraft[]>([])
  const questionSubmitRequestRef = useRef(0)
  const questionSubmitActiveRef = useRef(false)
  const previousUserIdRef = useRef(user?.id)
  const submittingQuestion = questionSubmitStage !== "idle"

  const answeredCount = useMemo(
    () => questions.filter((question) => question.answers.length > 0).length,
    [questions],
  )

  const clearQuestionImages = useCallback(() => {
    imageProcessRequestRef.current += 1
    setProcessingImages(false)
    setQuestionImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      return []
    })
    if (imageInputRef.current) imageInputRef.current.value = ""
  }, [])

  const handleQuestionImageSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    if (!selectedFiles.length) return

    const availableSlots = QUESTION_IMAGE_MAX_COUNT - questionImages.length
    if (availableSlots <= 0) {
      onToast("질문에는 사진을 최대 3장까지 첨부할 수 있습니다.", "error")
      return
    }
    if (selectedFiles.length > availableSlots) {
      onToast(`사진은 ${availableSlots}장 더 첨부할 수 있습니다.`, "error")
    }

    const requestId = ++imageProcessRequestRef.current
    setProcessingImages(true)
    try {
      const preparedFiles: File[] = []
      for (const file of selectedFiles.slice(0, availableSlots)) {
        preparedFiles.push(await prepareQuestionImageFile(file))
      }
      if (requestId !== imageProcessRequestRef.current) return

      const nextImages = preparedFiles.map((file, index) => ({
        id:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${index}-${file.size}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }))
      setQuestionImages((current) => [...current, ...nextImages])
    } catch (error) {
      if (requestId !== imageProcessRequestRef.current) return
      onToast(
        error instanceof Error ? error.message : "사진을 처리하지 못했습니다.",
        "error",
      )
    } finally {
      if (requestId === imageProcessRequestRef.current) {
        setProcessingImages(false)
      }
    }
  }

  const removeQuestionImage = (imageId: string) => {
    setQuestionImages((current) => {
      const target = current.find((image) => image.id === imageId)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== imageId)
    })
  }

  useEffect(() => {
    questionImagesRef.current = questionImages
  }, [questionImages])

  useEffect(
    () => () => {
      imageProcessRequestRef.current += 1
      questionSubmitRequestRef.current += 1
      questionSubmitActiveRef.current = false
      questionImagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      )
    },
    [],
  )

  const loadQuestions = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoading(true)
    setLoadError("")

    try {
      const nextQuestions = await loadQuestionThreads(Boolean(user?.isAdmin))
      if (loadRequestRef.current !== requestId) return
      setQuestions(nextQuestions)
    } catch (error) {
      if (loadRequestRef.current !== requestId) return
      setLoadError(isMissingQuestionSchema(error) ? "schema" : "request")
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false)
    }
  }, [user?.isAdmin])

  useEffect(() => {
    void loadQuestions()
    return () => {
      loadRequestRef.current += 1
    }
  }, [loadQuestions])

  useEffect(() => {
    const previousUserId = previousUserIdRef.current
    const nextUserId = user?.id
    if (previousUserId && previousUserId !== nextUserId) {
      questionSubmitRequestRef.current += 1
      questionSubmitActiveRef.current = false
      setQuestionSubmitStage("idle")
      setQuestionDraft("")
      clearQuestionImages()
      setIsAnonymous(false)
      setAnswerDrafts({})
      setAnonymousAnswers({})
      setDeleteCandidateId(null)
      setDeletingQuestionId(null)
    }
    previousUserIdRef.current = nextUserId
  }, [clearQuestionImages, user?.id])

  const handleQuestionSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!user) {
      onRequireLogin()
      return
    }
    if (questionSubmitActiveRef.current) return

    const content = questionDraft.trim()
    if (!content) {
      onToast("질문 내용을 입력해 주세요.", "error")
      return
    }
    if (processingImages) {
      onToast("사진 처리가 끝날 때까지 잠시 기다려 주세요.", "error")
      return
    }

    const requestId = ++questionSubmitRequestRef.current
    questionSubmitActiveRef.current = true
    const submitUser = user
    setQuestionSubmitStage(questionImages.length ? "uploading" : "saving")
    try {
      const created = await createQuestion(
        content,
        isAnonymous,
        questionImages.map((image) => image.file),
        (stage) => {
          if (requestId === questionSubmitRequestRef.current) {
            setQuestionSubmitStage(stage)
          }
        },
        submitUser.id,
      )
      if (requestId !== questionSubmitRequestRef.current) return
      loadRequestRef.current += 1
      setLoading(false)
      setQuestions((current) => [
        submitUser.isAdmin && isAnonymous
          ? {
            ...created,
            actualAuthorName: submitUser.name,
            authorEmail: submitUser.email,
          }
          : created,
        ...current,
      ])
      setQuestionDraft("")
      clearQuestionImages()
      setIsAnonymous(false)
      onToast("질문을 등록했습니다.", "success")
    } catch (error) {
      if (requestId !== questionSubmitRequestRef.current) return
      onToast(questionSubmitErrorMessage(error), "error")
    } finally {
      if (requestId === questionSubmitRequestRef.current) {
        questionSubmitActiveRef.current = false
        setQuestionSubmitStage("idle")
      }
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
      const submitAnonymously = Boolean(anonymousAnswers[questionId])
      const created = await createQuestionAnswer(
        questionId,
        content,
        submitAnonymously,
      )
      loadRequestRef.current += 1
      setLoading(false)
      setQuestions((current) =>
        current.map((question) =>
          question.id === questionId
            ? {
              ...question,

              answers: [
                ...question.answers,
                user.isAdmin && submitAnonymously
                  ? {
                    ...created,
                    actualAuthorName: user.name,
                    authorEmail: user.email,
                  }
                  : created,
              ],
            }
            : question,
        ),
      )
      setAnswerDrafts((current) => ({ ...current, [questionId]: "" }))
      setAnonymousAnswers((current) => ({
        ...current,
        [questionId]: false,
      }))
      onToast("답변을 등록했습니다.", "success")
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      onToast(
        message.startsWith("익명 답변")
          ? message
          : "답변을 서버에 저장하지 못했습니다.",
        "error",
      )
    } finally {
      setSubmittingAnswer(null)
    }
  }

  const handleQuestionDelete = async (question: QuestionPost) => {
    if (!user?.isAdmin || deletingQuestionId) return

    setDeletingQuestionId(question.id)
    try {
      await deleteQuestion(question.id)
      loadRequestRef.current += 1
      setQuestions((current) =>
        current.filter((candidate) => candidate.id !== question.id),
      )
      setDeleteCandidateId(null)
      onToast("질문과 답변을 삭제했습니다.", "success")
    } catch {
      void loadQuestions()
      onToast(
        "질문 삭제를 완료하지 못했습니다. 목록을 새로 확인했으니 다시 시도해 주세요.",
        "error",
      )
    } finally {
      setDeletingQuestionId(null)
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
                disabled={submittingQuestion}
                id="new-question"
                maxLength={QUESTION_LIMIT}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="궁금한것을 물어보세요!"
                rows={3}
                value={questionDraft}
              />
              <div className="question-image-tools">
                <input
                  accept={QUESTION_IMAGE_ACCEPT}
                  aria-describedby="question-image-help"
                  aria-label="질문 사진 선택"
                  className="sr-only"
                  disabled={
                    processingImages ||
                    submittingQuestion ||
                    questionImages.length >= QUESTION_IMAGE_MAX_COUNT
                  }
                  id="question-image-input"
                  multiple
                  onChange={(event) => void handleQuestionImageSelection(event)}
                  ref={imageInputRef}
                  type="file"
                />
                <label
                  aria-describedby="question-image-help"
                  aria-disabled={
                    processingImages ||
                    submittingQuestion ||
                    questionImages.length >= QUESTION_IMAGE_MAX_COUNT
                  }
                  className={`question-image-add${processingImages ||
                      submittingQuestion ||
                      questionImages.length >= QUESTION_IMAGE_MAX_COUNT
                      ? " is-disabled"
                      : ""
                    }`}
                  htmlFor="question-image-input"
                >
                  <span aria-hidden="true">▧</span>
                  {processingImages
                    ? "사진 준비 중…"
                    : questionImages.length >= QUESTION_IMAGE_MAX_COUNT
                      ? "사진 3장 첨부됨"
                      : "사진 첨부"}
                </label>
                <p id="question-image-help">
                  휴대폰 HEIC·AVIF 포함 · 원본 30MB까지 · 자동 압축 · 최대 3장
                </p>
              </div>

              {questionImages.length > 0 && (
                <div
                  aria-label={`첨부할 사진 ${questionImages.length}장`}
                  aria-live="polite"
                  className="question-image-preview-list"
                >
                  {questionImages.map((image, index) => (
                    <div className="question-image-preview" key={image.id}>
                      <img
                        alt={`질문에 첨부할 사진 미리보기 ${index + 1}`}
                        src={image.previewUrl}
                      />
                      <button
                        aria-label={`${index + 1}번째 첨부 사진 제거`}
                        disabled={processingImages || submittingQuestion}
                        onClick={() => removeQuestionImage(image.id)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <footer>
                <div className="question-composer-meta">
                  <div className="question-anonymous-option">
                    <button
                      aria-describedby="anonymous-question-note"
                      aria-pressed={isAnonymous}
                      className={`question-anonymous-toggle${isAnonymous ? " is-active" : ""
                        }`}
                      disabled={submittingQuestion}
                      onClick={() => setIsAnonymous((current) => !current)}
                      type="button"
                    >
                      <span aria-hidden="true">
                        <i />
                      </span>
                      익명으로 질문
                    </button>
                    <small id="anonymous-question-note">
                      다른 사용자에게 익명이며 관리자는 작성자를 확인할 수
                      있어요.
                    </small>
                  </div>
                  <span>
                    {questionDraft.length.toLocaleString("ko-KR")} /{" "}
                    {QUESTION_LIMIT.toLocaleString("ko-KR")}
                  </span>
                </div>
                <button
                  className="button primary"
                  disabled={
                    submittingQuestion ||
                    processingImages ||
                    !questionDraft.trim() ||
                    loadError === "schema"
                  }
                  type="submit"
                >
                  {questionSubmitStage === "uploading"
                    ? "사진 업로드 중…"
                    : questionSubmitStage === "saving"
                      ? "질문 등록 중…"
                      : "질문 올리기"}
                </button>
              </footer>
              <span aria-live="polite" className="sr-only" role="status">
                {processingImages
                  ? "사진을 안전하게 준비하고 있습니다."
                  : questionSubmitStage === "uploading"
                    ? "사진을 업로드하고 있습니다."
                    : questionSubmitStage === "saving"
                      ? "질문을 등록하고 있습니다."
                      : ""}
              </span>
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
              const publicAuthorName = question.isAnonymous
                ? "익명"
                : question.authorName

              return (
                <article className="question-thread" key={question.id}>
                  <header className="question-thread-header">
                    <span className="question-avatar" aria-hidden="true">
                      {avatarLabel(publicAuthorName)}
                    </span>
                    <div>
                      <strong>
                        {publicAuthorName}
                        {question.isAnonymous && (
                          <span className="question-anonymous-badge">
                            익명 질문
                          </span>
                        )}
                      </strong>
                      {user?.isAdmin &&
                        question.isAnonymous &&
                        question.actualAuthorName && (
                          <span className="question-admin-author">
                            관리자 확인 · {question.actualAuthorName}
                            {question.authorEmail
                              ? ` (${question.authorEmail})`
                              : ""}
                          </span>
                        )}
                      <time dateTime={question.createdAt}>
                        {formatDate(question.createdAt)}
                      </time>
                    </div>
                    <div className="question-thread-actions">
                      <span className="question-answer-count">
                        답변 {question.answers.length.toLocaleString("ko-KR")}개
                      </span>
                      {user?.isAdmin && (
                        <button
                          className="question-delete-button"
                          disabled={Boolean(deletingQuestionId)}
                          onClick={() => setDeleteCandidateId(question.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="question-message">
                    <span>질문</span>
                    <p>{question.content}</p>
                    {question.imageUrls.length > 0 && (
                      <div
                        aria-label={`질문 첨부 사진 ${question.imageUrls.length}장`}
                        className={`question-attachment-grid is-count-${question.imageUrls.length}`}
                      >
                        {question.imageUrls.map((imageUrl, index) => (
                          <img
                            alt={`질문 첨부 사진 ${index + 1}`}
                            decoding="async"
                            key={imageUrl}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            src={imageUrl}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {user?.isAdmin && deleteCandidateId === question.id && (
                    <div className="question-delete-confirm" role="alert">
                      <p>이 질문과 첨부 사진, 등록된 답변을 모두 삭제할까요?</p>
                      <div>
                        <button
                          disabled={deletingQuestionId === question.id}
                          onClick={() => setDeleteCandidateId(null)}
                          type="button"
                        >
                          취소
                        </button>
                        <button
                          disabled={deletingQuestionId === question.id}
                          onClick={() => void handleQuestionDelete(question)}
                          type="button"
                        >
                          {deletingQuestionId === question.id
                            ? "삭제 중…"
                            : "질문 삭제"}
                        </button>
                      </div>
                    </div>
                  )}

                  {question.answers.length > 0 ? (
                    <ol
                      aria-label={question.content + "의 답변"}
                      className="answer-list"
                    >
                      {question.answers.map((answer) => {
                        const publicAnswerName = answer.isAnonymous
                          ? "익명"
                          : answer.authorName

                        return (
                          <li key={answer.id}>
                            <div className="answer-meta">
                              <span aria-hidden="true">
                                {avatarLabel(publicAnswerName)}
                              </span>
                              <strong>{publicAnswerName}</strong>
                              {answer.isAnonymous && (
                                <span className="question-anonymous-badge">
                                  익명 답변
                                </span>
                              )}
                              {user?.isAdmin &&
                                answer.isAnonymous &&
                                answer.actualAuthorName && (
                                  <span className="answer-admin-author">
                                    관리자 확인 · {answer.actualAuthorName}
                                    {answer.authorEmail
                                      ? ` (${answer.authorEmail})`
                                      : ""}
                                  </span>
                                )}
                              <time dateTime={answer.createdAt}>
                                {formatDate(answer.createdAt)}
                              </time>
                            </div>
                            <p>{answer.content}</p>
                          </li>
                        )
                      })}
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
                      <div className="answer-composer-footer">
                        <div className="answer-anonymous-option">
                          <button
                            aria-describedby={`anonymous-answer-note-${question.id}`}
                            aria-pressed={Boolean(
                              anonymousAnswers[question.id],
                            )}
                            className={`question-anonymous-toggle${
                              anonymousAnswers[question.id] ? " is-active" : ""
                            }`}
                            disabled={submittingAnswer === question.id}
                            onClick={() =>
                              setAnonymousAnswers((current) => ({
                                ...current,
                                [question.id]: !current[question.id],
                              }))
                            }
                            type="button"
                          >
                            <span aria-hidden="true">
                              <i />
                            </span>
                            익명으로 답변
                          </button>
                          <small id={`anonymous-answer-note-${question.id}`}>
                            다른 사용자에게는 익명이며 관리자는 작성자를 확인할
                            수 있어요.
                          </small>
                        </div>
                        <div className="answer-composer-actions">
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
