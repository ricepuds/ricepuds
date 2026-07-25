import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react"

import { fetchSurveySheet, SURVEY_SPREADSHEET_ID, type GvizTab } from "./survey"
import type {
  InventoryItem,
  Notice,
  Reservation,
  ReservationBlock,
} from "./types"

export type ReservationBlockInput = Omit<ReservationBlock, "id" | "createdAt">

export interface AdminDashboardProps {
  items: InventoryItem[]
  notices: Notice[]
  reservations: Reservation[]
  blocks: ReservationBlock[]
  onAddNotice(content: string): Promise<boolean>
  onDeleteNotice(id: string): Promise<boolean>
  onCreateBlock(input: ReservationBlockInput): Promise<boolean>
  onDeleteBlock(id: string): Promise<boolean>
  onOpenInventory(): void
  onOpenReservations(): void
}

type DashboardTab = "overview" | "notices" | "reservations" | "reports"
type Feedback = {
  tone: "success" | "error"
  text: string
}
type BlockForm = ReservationBlockInput

const DASHBOARD_TABS: {
  id: DashboardTab
  label: string
  shortLabel: string
}[] = [
  { id: "overview", label: "개요", shortLabel: "개요" },
  { id: "notices", label: "공지 관리", shortLabel: "공지" },
  { id: "reservations", label: "예약·차단", shortLabel: "예약" },
  { id: "reports", label: "시트 리포트", shortLabel: "리포트" },
]

const REPORT_SHEETS = [
  "요약",
  "재고 현황",
  "재구매 목록",
  "점검 리포트",
  "사용 기록",
  "선반 배치 목록",
  "보관위치 미기록",
] as const

type ReportSheet = typeof REPORT_SHEETS[number]

const LAB_AREAS = ["시약", "화학실", "생명실", "준비실"] as const
const RESERVATION_ROOMS = ["화학실", "생명실", "준비실", "전체 과학실"] as const
const TIME_SLOTS = [
  "1교시",
  "2교시",
  "3교시",
  "4교시",
  "5교시",
  "6교시",
  "7교시",
  "방과후",
  "야자 1",
  "야자 2",
] as const

const RESERVATION_STATUS_LABEL: Record<Reservation["status"], string> = {
  pending: "대기",
  approved: "승인",
  rejected: "거절",
}

function getLocalDateValue(date = new Date()): string {
  const localDate = new Date(date)
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 10)
}

function formatDate(dateValue: string): string {
  if (!dateValue) {
    return "날짜 미정"
  }

  const date = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  })
}

function splitNoticeContent(
  content: string,
): {
  title: string
  body: string
} {
  const [firstLine = "", ...remainingLines] = content.trim().split(/\r?\n/)
  return {
    title: firstLine,
    body: remainingLines.join("\n").trim(),
  }
}

function formatReportCell(
  formattedValue: string | null | undefined,
  value: string | number | boolean | null | undefined,
): string {
  if (formattedValue !== null && formattedValue !== undefined) {
    return formattedValue
  }

  if (value === null || value === undefined || value === "") {
    return "—"
  }

  if (typeof value === "boolean") {
    return value ? "예" : "아니요"
  }

  return String(value)
}

function OverviewPanel({
  items,
  notices,
  reservations,
  blocks,
  onOpenInventory,
  onOpenReservations,
}: Pick<AdminDashboardProps, "items" | "notices" | "reservations" | "blocks" | "onOpenInventory" | "onOpenReservations">) {
  const reagents = items.filter((item) => item.type === "reagent")
  const equipment = items.filter((item) => item.type === "equipment")
  const alertItems = items.filter((item) => item.toxic || item.lowStock)
  const missingLocations = items.filter(
    (item) =>
      !item.location.trim() ||
      item.location === "-" ||
      item.location.includes("미정"),
  )
  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "pending",
  )
  const areaSummary = LAB_AREAS.map((area) => ({
    area,
    count: items.filter((item) => item.area === area).length,
  }))
  const maximumAreaCount = Math.max(
    1,
    ...areaSummary.map((summary) => summary.count),
  )
  const overviewStats = [
    {
      label: "전체 물품",
      value: items.length,
      detail: `시약 ${reagents.length.toLocaleString("ko-KR")} · 기구 ${equipment.length.toLocaleString("ko-KR")}`,
      tone: "blue",
    },
    {
      label: "주의 재고",
      value: alertItems.length,
      detail: `위치 미기록 ${missingLocations.length.toLocaleString("ko-KR")}`,
      tone: "orange",
    },
    {
      label: "대기 예약",
      value: pendingReservations.length,
      detail: `차단 일정 ${blocks.length.toLocaleString("ko-KR")}`,
      tone: "purple",
    },
    {
      label: "공지사항",
      value: notices.length,
      detail: notices[0]?.createdAt
        ? `최근 ${notices[0].createdAt}`
        : "등록된 공지 없음",
      tone: "green",
    },
  ]

  return (
    <div className="admin-overview">
      <section aria-label="관리 현황" className="admin-stat-grid">
        {overviewStats.map((stat) => (
          <article
            className={`admin-stat-card is-${stat.tone}`}
            key={stat.label}
          >
            <span>{stat.label}</span>
            <strong>{stat.value.toLocaleString("ko-KR")}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </section>

      <div className="admin-overview-grid">
        <section className="ios-card admin-area-card">
          <header className="admin-section-heading">
            <div>
              <p className="eyebrow">Inventory by room</p>
              <h2>공간별 재고</h2>
            </div>
            <button
              className="text-button"
              onClick={onOpenInventory}
              type="button"
            >
              전체 재고 열기
            </button>
          </header>

          <div className="admin-area-chart">
            {areaSummary.map((summary) => (
              <div className="admin-area-row" key={summary.area}>
                <span>{summary.area}</span>
                <div
                  aria-label={`${summary.area} ${summary.count}개`}
                  className="admin-area-track"
                  role="img"
                >
                  <i
                    style={{
                      width: `${(summary.count / maximumAreaCount) * 100}%`,
                    }}
                  />
                </div>
                <strong>{summary.count.toLocaleString("ko-KR")}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="ios-card admin-attention-card">
          <header className="admin-section-heading">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>확인이 필요한 항목</h2>
            </div>
            <span className="count-pill">{alertItems.length}</span>
          </header>

          <div className="admin-attention-list">
            {alertItems.length ? alertItems.slice(0, 6).map((item) => (
                <article className="admin-attention-item" key={item.id}>
                  <span
                    aria-hidden="true"
                    className={`admin-attention-dot ${
                      item.toxic ? "is-toxic" : "is-low"
                    }`}
                  />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.area} · {item.location || "위치 미정"}
                    </small>
                  </div>
                  <span>{item.toxic ? "유독" : "잔량 부족"}</span>
                </article>
              )) : <p className="admin-empty-state">
                현재 확인이 필요한 재고가 없습니다.
              </p>}
          </div>
        </section>
      </div>

      <section className="ios-card admin-quick-actions">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Quick actions</p>
            <h2>바로가기</h2>
          </div>
        </header>
        <div className="admin-action-grid">
          <button
            className="admin-action-card"
            onClick={onOpenInventory}
            type="button"
          >
            <span aria-hidden="true">⌕</span>
            <div>
              <strong>재고 관리</strong>
              <small>검색·필터·보관 위치 확인</small>
            </div>
            <i aria-hidden="true">›</i>
          </button>
          <button
            className="admin-action-card"
            onClick={onOpenReservations}
            type="button"
          >
            <span aria-hidden="true">✓</span>
            <div>
              <strong>예약 처리</strong>
              <small>
                대기 요청 {pendingReservations.length.toLocaleString("ko-KR")}건
              </small>
            </div>
            <i aria-hidden="true">›</i>
          </button>
        </div>
      </section>
    </div>
  )
}

function NoticePanel({
  notices,
  onAddNotice,
  onDeleteNotice,
}: Pick<AdminDashboardProps, "notices" | "onAddNotice" | "onDeleteNotice">) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [busyId, setBusyId] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedTitle = title.trim()
    const normalizedBody = body.trim()

    if (!normalizedTitle || !normalizedBody || busyId) {
      return
    }

    setBusyId("new")
    setFeedback(null)
    const saved = await onAddNotice(`${normalizedTitle}\n${normalizedBody}`)
    setBusyId("")

    if (saved) {
      setTitle("")
      setBody("")
      setFeedback({
        tone: "success",
        text: "공지사항을 등록했습니다.",
      })
    } else {
      setFeedback({
        tone: "error",
        text: "공지사항을 저장하지 못했습니다.",
      })
    }
  }

  const handleDelete = async (notice: Notice) => {
    if (busyId) {
      return
    }

    setBusyId(notice.id)
    setFeedback(null)
    const deleted = await onDeleteNotice(notice.id)
    setBusyId("")
    setFeedback(
      deleted
        ? { tone: "success", text: "공지사항을 삭제했습니다." }
        : { tone: "error", text: "공지사항을 삭제하지 못했습니다." },
    )
  }

  return (
    <div className="admin-notice-layout">
      <section className="ios-card admin-notice-form-card">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Publish notice</p>
            <h2>새 공지 등록</h2>
          </div>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>제목</span>
            <input
              disabled={Boolean(busyId)}
              maxLength={80}
              onChange={(event) => {
                setTitle(event.target.value)
                setFeedback(null)
              }}
              placeholder="공지 제목을 입력하세요"
              required
              value={title}
            />
          </label>
          <label className="form-field">
            <span>내용</span>
            <textarea
              disabled={Boolean(busyId)}
              maxLength={1000}
              onChange={(event) => {
                setBody(event.target.value)
                setFeedback(null)
              }}
              placeholder="학생과 교직원에게 안내할 내용을 입력하세요"
              required
              rows={7}
              value={body}
            />
          </label>
          <div className="admin-form-footer">
            <span>{body.length.toLocaleString("ko-KR")} / 1,000</span>
            <button
              className="button primary"
              disabled={Boolean(busyId)}
              type="submit"
            >
              {busyId === "new" ? "등록 중…" : "공지 등록"}
            </button>
          </div>
          {feedback && (
            <p
              aria-live="polite"
              className={`admin-feedback is-${feedback.tone}`}
              role="status"
            >
              {feedback.text}
            </p>
          )}
        </form>
      </section>

      <section className="ios-card admin-notice-list-card">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Published</p>
            <h2>등록된 공지</h2>
          </div>
          <span className="count-pill">{notices.length}</span>
        </header>

        <div className="admin-notice-list">
          {notices.length ? (
            notices.map((notice) => {
              const parsed = splitNoticeContent(notice.content)
              return (
                <article className="admin-notice-item" key={notice.id}>
                  <div>
                    <strong>{parsed.title || "제목 없는 공지"}</strong>
                    {parsed.body && <p>{parsed.body}</p>}
                    <time>{notice.createdAt}</time>
                  </div>
                  <button
                    aria-label={`${parsed.title || "공지"} 삭제`}
                    className="button danger subtle"
                    disabled={Boolean(busyId)}
                    onClick={() => void handleDelete(notice)}
                    type="button"
                  >
                    {busyId === notice.id ? "삭제 중…" : "삭제"}
                  </button>
                </article>
              )
            })
          ) : (
            <p className="admin-empty-state">
              아직 등록된 공지사항이 없습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function ReservationPanel({
  reservations,
  blocks,
  onCreateBlock,
  onDeleteBlock,
  onOpenReservations,
}: Pick<AdminDashboardProps, "reservations" | "blocks" | "onCreateBlock" | "onDeleteBlock" | "onOpenReservations">) {
  const [form, setForm] = useState<BlockForm>({
    date: getLocalDateValue(),
    room: "화학실",
    startTime: "1교시",
    endTime: "1교시",
    reason: "",
  })
  const [busyId, setBusyId] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort(
        (first, second) =>
          first.date.localeCompare(second.date) ||
          TIME_SLOTS.indexOf(first.startTime as typeof TIME_SLOTS[number]) -
            TIME_SLOTS.indexOf(second.startTime as typeof TIME_SLOTS[number]),
      ),
    [blocks],
  )
  const recentReservations = reservations.slice(0, 6)
  const pendingCount = reservations.filter(
    (reservation) => reservation.status === "pending",
  ).length

  const updateForm = <Key extends keyof BlockForm,>(
    key: Key,
    value: BlockForm[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFeedback(null)
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const startIndex = TIME_SLOTS.indexOf(
      form.startTime as typeof TIME_SLOTS[number],
    )
    const endIndex = TIME_SLOTS.indexOf(
      form.endTime as typeof TIME_SLOTS[number],
    )

    if (startIndex < 0 || endIndex < startIndex) {
      setFeedback({
        tone: "error",
        text: "종료 교시는 시작 교시와 같거나 늦어야 합니다.",
      })
      return
    }

    if (!form.reason.trim() || busyId) {
      return
    }

    setBusyId("new-block")
    setFeedback(null)
    const created = await onCreateBlock({
      ...form,
      reason: form.reason.trim(),
    })
    setBusyId("")

    if (created) {
      setForm((current) => ({ ...current, reason: "" }))
      setFeedback({
        tone: "success",
        text: "예약 차단 일정을 등록했습니다.",
      })
    } else {
      setFeedback({
        tone: "error",
        text: "예약 차단 일정을 저장하지 못했습니다.",
      })
    }
  }

  const handleDelete = async (block: ReservationBlock) => {
    if (busyId) {
      return
    }

    setBusyId(block.id)
    setFeedback(null)
    const deleted = await onDeleteBlock(block.id)
    setBusyId("")
    setFeedback(
      deleted
        ? { tone: "success", text: "예약 차단 일정을 삭제했습니다." }
        : {
            tone: "error",
            text: "예약 차단 일정을 삭제하지 못했습니다.",
          },
    )
  }

  return (
    <div className="admin-reservation-layout">
      <section className="ios-card admin-block-form-card">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Block schedule</p>
            <h2>예약 차단 등록</h2>
          </div>
        </header>

        <form className="admin-form" onSubmit={handleCreate}>
          <div className="admin-form-grid">
            <label className="form-field">
              <span>날짜</span>
              <input
                disabled={Boolean(busyId)}
                min={getLocalDateValue()}
                onChange={(event) => updateForm("date", event.target.value)}
                required
                type="date"
                value={form.date}
              />
            </label>
            <label className="form-field">
              <span>공간</span>
              <select
                disabled={Boolean(busyId)}
                onChange={(event) => updateForm("room", event.target.value)}
                required
                value={form.room}
              >
                {RESERVATION_ROOMS.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>시작 교시</span>
              <select
                disabled={Boolean(busyId)}
                onChange={(event) =>
                  updateForm("startTime", event.target.value)
                }
                required
                value={form.startTime}
              >
                {TIME_SLOTS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>종료 교시</span>
              <select
                disabled={Boolean(busyId)}
                onChange={(event) => updateForm("endTime", event.target.value)}
                required
                value={form.endTime}
              >
                {TIME_SLOTS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>차단 사유</span>
            <textarea
              disabled={Boolean(busyId)}
              maxLength={300}
              onChange={(event) => updateForm("reason", event.target.value)}
              placeholder="시설 점검, 교내 행사 등 차단 사유를 입력하세요"
              required
              rows={4}
              value={form.reason}
            />
          </label>
          <div className="admin-form-footer">
            <span>차단된 시간에는 새 예약을 받을 수 없습니다.</span>
            <button
              className="button primary"
              disabled={Boolean(busyId)}
              type="submit"
            >
              {busyId === "new-block" ? "등록 중…" : "차단 등록"}
            </button>
          </div>
          {feedback && (
            <p
              aria-live="polite"
              className={`admin-feedback is-${feedback.tone}`}
              role="status"
            >
              {feedback.text}
            </p>
          )}
        </form>
      </section>

      <section className="ios-card admin-block-list-card">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Blocked times</p>
            <h2>예약 차단 일정</h2>
          </div>
          <span className="count-pill">{blocks.length}</span>
        </header>

        <div className="admin-block-list">
          {sortedBlocks.length ? (
            sortedBlocks.map((block) => (
              <article className="admin-block-item" key={block.id}>
                <time dateTime={block.date}>{formatDate(block.date)}</time>
                <div>
                  <strong>{block.room}</strong>
                  <span>
                    {block.startTime === block.endTime
                      ? block.startTime
                      : `${block.startTime} ~ ${block.endTime}`}
                  </span>
                  <p>{block.reason}</p>
                  <small>{block.createdAt}</small>
                </div>
                <button
                  aria-label={`${formatDate(block.date)} ${block.room} 차단 삭제`}
                  className="button danger subtle"
                  disabled={Boolean(busyId)}
                  onClick={() => void handleDelete(block)}
                  type="button"
                >
                  {busyId === block.id ? "삭제 중…" : "삭제"}
                </button>
              </article>
            ))
          ) : (
            <p className="admin-empty-state">
              등록된 예약 차단 일정이 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className="ios-card admin-reservation-card">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Recent requests</p>
            <h2>최근 예약 요청</h2>
          </div>
          <button
            className="text-button"
            onClick={onOpenReservations}
            type="button"
          >
            전체 관리 · 대기 {pendingCount}
          </button>
        </header>

        <div className="admin-reservation-list">
          {recentReservations.length ? (
            recentReservations.map((reservation) => (
              <article className="admin-reservation-item" key={reservation.id}>
                <div>
                  <strong>{reservation.room}</strong>
                  <span>
                    {reservation.date} · {reservation.time}
                  </span>
                  <small>
                    {reservation.className || "소속 미입력"} ·{" "}
                    {reservation.applicantName || "신청자 미입력"}
                  </small>
                </div>
                <span className={`reservation-state is-${reservation.status}`}>
                  {RESERVATION_STATUS_LABEL[reservation.status]}
                </span>
              </article>
            ))
          ) : (
            <p className="admin-empty-state">접수된 예약 요청이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function ReportPanel() {
  const [selectedSheet, setSelectedSheet] = useState<ReportSheet>("요약")
  const [report, setReport] = useState<GvizTab | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [loadedAt, setLoadedAt] = useState("")

  const loadReport = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setErrorMessage("")

      try {
        const nextReport = await fetchSurveySheet({
          sheet: selectedSheet,
          signal,
        })

        if (signal?.aborted) {
          return
        }

        setReport(nextReport)
        setLoadedAt(
          new Date().toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        setReport(null)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Google 시트 리포트를 불러오지 못했습니다.",
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [selectedSheet],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadReport(abortController.signal)
    return () => abortController.abort()
  }, [loadReport])

  return (
    <section aria-busy={loading} className="ios-card admin-report-card">
      <header className="admin-section-heading admin-report-heading">
        <div>
          <p className="eyebrow">Google Sheets</p>
          <h2>시트 리포트</h2>
          <small>
            {loadedAt
              ? `마지막 불러오기 ${loadedAt}`
              : "공개 조사 시트의 최신 내용을 표시합니다."}
          </small>
        </div>
        <div className="admin-report-controls">
          <a
            className="button secondary"
            href={`https://docs.google.com/spreadsheets/d/${SURVEY_SPREADSHEET_ID}/edit#gid=521070985`}
            rel="noreferrer"
            target="_blank"
          >
            원본 시트
          </a>
          <label>
            <span className="sr-only">리포트 종류</span>
            <select
              disabled={loading}
              onChange={(event) =>
                setSelectedSheet(event.target.value as ReportSheet)
              }
              value={selectedSheet}
            >
              {REPORT_SHEETS.map((sheet) => (
                <option key={sheet} value={sheet}>
                  {sheet}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void loadReport()}
            type="button"
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {errorMessage ? (
        <div className="admin-report-error" role="alert">
          <strong>리포트를 표시할 수 없습니다.</strong>
          <p>{errorMessage}</p>
          <button
            className="button secondary"
            onClick={() => void loadReport()}
            type="button"
          >
            다시 시도
          </button>
        </div>
      ) : report ? (
        <>
          <div className="admin-report-meta">
            <span>{report.sheet}</span>
            <span>
              {report.rows.length.toLocaleString("ko-KR")}행 ·{" "}
              {report.columns.length.toLocaleString("ko-KR")}열
            </span>
          </div>
          <div className="admin-report-table-wrap" tabIndex={0}>
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th scope="col">행</th>
                  {report.columns.map((column, columnIndex) => (
                    <th key={`${column.id}-${columnIndex}`} scope="col">
                      {column.label || column.id || `열 ${columnIndex + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <th scope="row">{row.rowNumber}</th>
                    {report.columns.map((column, columnIndex) => (
                      <td key={`${row.rowNumber}-${column.id}-${columnIndex}`}>
                        {formatReportCell(
                          row.formattedValues[columnIndex],
                          row.values[columnIndex],
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.rows.length && (
            <p className="admin-empty-state">
              선택한 시트에 표시할 행이 없습니다.
            </p>
          )}
        </>
      ) : (
        <div aria-live="polite" className="admin-report-loading" role="status">
          <span aria-hidden="true" className="button-spinner" />
          <p>{selectedSheet} 시트를 불러오고 있습니다.</p>
        </div>
      )}
    </section>
  )
}

export default function AdminDashboard({
  items,
  notices,
  reservations,
  blocks,
  onAddNotice,
  onDeleteNotice,
  onCreateBlock,
  onDeleteBlock,
  onOpenInventory,
  onOpenReservations,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview")
  const tabIdPrefix = useId()

  return (
    <main className="admin-dashboard" id="main-content">
      <div className="admin-dashboard-shell">
        <header className="admin-dashboard-hero">
          <div>
            <p className="eyebrow">Science Lab Control Center</p>
            <div className="admin-dashboard-title">
              <h1>관리자 대시보드</h1>
              <span>Admin</span>
            </div>
            <p>
              재고와 공지, 예약 차단, Google 시트 리포트를 한곳에서 관리합니다.
            </p>
          </div>
          <div className="admin-dashboard-health">
            <i aria-hidden="true" />
            <span>관리 시스템 정상</span>
          </div>
        </header>

        <nav
          aria-label="관리자 대시보드 메뉴"
          className="admin-dashboard-tabs"
          role="tablist"
        >
          {DASHBOARD_TABS.map((tab) => (
            <button
              aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "is-active" : ""}
              id={`${tabIdPrefix}-${tab.id}-tab`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <small>{tab.shortLabel}</small>
            </button>
          ))}
        </nav>

        <section
          aria-labelledby={`${tabIdPrefix}-${activeTab}-tab`}
          className="admin-dashboard-panel"
          id={`${tabIdPrefix}-${activeTab}-panel`}
          role="tabpanel"
        >
          {activeTab === "overview" && (
            <OverviewPanel
              blocks={blocks}
              items={items}
              notices={notices}
              onOpenInventory={onOpenInventory}
              onOpenReservations={onOpenReservations}
              reservations={reservations}
            />
          )}
          {activeTab === "notices" && (
            <NoticePanel
              notices={notices}
              onAddNotice={onAddNotice}
              onDeleteNotice={onDeleteNotice}
            />
          )}
          {activeTab === "reservations" && (
            <ReservationPanel
              blocks={blocks}
              onCreateBlock={onCreateBlock}
              onDeleteBlock={onDeleteBlock}
              onOpenReservations={onOpenReservations}
              reservations={reservations}
            />
          )}
          {activeTab === "reports" && <ReportPanel />}
        </section>
      </div>
    </main>
  )
}
