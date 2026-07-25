import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"

import type { Reservation, ReservationBlock } from "./types"

export interface ReservationModalProps {
  reservations: Reservation[]
  blocks: ReservationBlock[]
  isAdmin: boolean
  onClose(): void
  onCreate(reservation: Reservation): Promise<boolean>
  onUpdate(
    id: string,
    status: "approved" | "rejected",
    reason: string,
  ): Promise<boolean>
  onDelete(id: string): Promise<boolean>
  onClear(): Promise<boolean>
}

type MainTab = "schedule" | "form" | "manage"
type AdminTab = "pending" | "completed"
type Feedback = {
  tone: "error" | "success"
  text: string
}

interface ReservationFormState {
  room: string
  date: string
  startTime: string
  endTime: string
  className: string
  applicantStudentId: string
  applicantName: string
  purpose: string
}

const ROOMS = ["화학실", "생명실", "준비실", "전체 과학실"] as const
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
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function getLocalDateValue(date = new Date()): string {
  const localDate = new Date(date)
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 10)
}

function parseTimeRange(value: string): readonly [number, number] | null {
  const matchedIndexes = TIME_SLOTS.reduce<number[]>((indexes, slot, index) => {
    if (value.includes(slot)) {
      indexes.push(index)
    }
    return indexes
  }, [])

  if (!matchedIndexes.length) {
    return null
  }

  return [Math.min(...matchedIndexes), Math.max(...matchedIndexes)]
}

function rangesOverlap(
  first: readonly [number, number],
  second: readonly [number, number],
): boolean {
  return first[0] <= second[1] && second[0] <= first[1]
}

function roomsOverlap(first: string, second: string): boolean {
  return first === second || first === "전체 과학실" || second === "전체 과학실"
}

function isBlockingReservation(reservation: Reservation): boolean {
  return reservation.status === "pending" || reservation.status === "approved"
}

function hasConflict(
  reservations: Reservation[],
  blocks: ReservationBlock[],
  room: string,
  date: string,
  requestedRange: readonly [number, number],
): boolean {
  const reservationConflict = reservations.some((reservation) => {
    if (
      !isBlockingReservation(reservation) ||
      reservation.date !== date ||
      !roomsOverlap(reservation.room, room)
    ) {
      return false
    }

    const existingRange = parseTimeRange(reservation.time)
    return existingRange ? rangesOverlap(existingRange, requestedRange) : false
  })

  if (reservationConflict) return true

  return blocks.some((block) => {
    if (block.date !== date || !roomsOverlap(block.room, room)) return false
    const startIndex = TIME_SLOTS.indexOf(
      block.startTime as (typeof TIME_SLOTS)[number],
    )
    const endIndex = TIME_SLOTS.indexOf(
      block.endTime as (typeof TIME_SLOTS)[number],
    )
    if (startIndex < 0 || endIndex < 0) return false
    return rangesOverlap(
      [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)],
      requestedRange,
    )
  })
}

function formatTimeRange(startTime: string, endTime: string): string {
  return startTime === endTime ? startTime : `${startTime} ~ ${endTime}`
}

function createReservationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createInitialForm(today: string): ReservationFormState {
  return {
    room: ROOMS[0],
    date: today,
    startTime: TIME_SLOTS[0],
    endTime: TIME_SLOTS[0],
    className: "",
    applicantStudentId: "",
    applicantName: "",
    purpose: "",
  }
}

function getStatusLabel(status: Reservation["status"]): string {
  if (status === "approved") {
    return "수락"
  }
  if (status === "rejected") {
    return "거절"
  }
  return "대기"
}

export default function ReservationModal({
  reservations,
  blocks,
  isAdmin,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onClear,
}: ReservationModalProps) {
  const today = useMemo(() => getLocalDateValue(), [])
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [mainTab, setMainTab] = useState<MainTab>("schedule")
  const [adminTab, setAdminTab] = useState<AdminTab>("pending")
  const [form, setForm] = useState<ReservationFormState>(() =>
    createInitialForm(today),
  )
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null)
  const [adminFeedback, setAdminFeedback] = useState<Feedback | null>(null)
  const [rejectionReasons, setRejectionReasons] =
    useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const approvedReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.status === "approved")
        .sort((first, second) =>
          `${first.date} ${first.time}`.localeCompare(
            `${second.date} ${second.time}`,
            "ko-KR",
          ),
        ),
    [reservations],
  )
  const pendingReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status === "pending"),
    [reservations],
  )
  const completedReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status !== "pending"),
    [reservations],
  )
  const visibleAdminReservations =
    adminTab === "pending" ? pendingReservations : completedReservations

  useEffect(() => {
    if (!isAdmin && mainTab === "manage") {
      setMainTab("schedule")
    }
  }, [isAdmin, mainTab])

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      )

      if (!focusableElements.length) {
        event.preventDefault()
        dialogRef.current.focus()
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

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus()
    }
  }, [onClose])

  const setFormField = <Key extends keyof ReservationFormState,>(
    key: Key,
    value: ReservationFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFormFeedback(null)
  }

  const handleStartTimeChange = (startTime: string) => {
    const startIndex = TIME_SLOTS.indexOf(
      startTime as typeof TIME_SLOTS[number],
    )
    const endIndex = TIME_SLOTS.indexOf(
      form.endTime as typeof TIME_SLOTS[number],
    )

    setForm((current) => ({
      ...current,
      startTime,
      endTime: endIndex < startIndex ? startTime : current.endTime,
    }))
    setFormFeedback(null)
  }

  const handleEndTimeChange = (endTime: string) => {
    const startIndex = TIME_SLOTS.indexOf(
      form.startTime as typeof TIME_SLOTS[number],
    )
    const endIndex = TIME_SLOTS.indexOf(endTime as typeof TIME_SLOTS[number])
    setFormField("endTime", endIndex < startIndex ? form.startTime : endTime)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormFeedback(null)

    if (form.date < today) {
      setFormFeedback({
        tone: "error",
        text: "오늘 이후의 날짜를 선택해 주세요.",
      })
      return
    }

    const startIndex = TIME_SLOTS.indexOf(
      form.startTime as typeof TIME_SLOTS[number],
    )
    const endIndex = TIME_SLOTS.indexOf(
      form.endTime as typeof TIME_SLOTS[number],
    )

    if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
      setFormFeedback({
        tone: "error",
        text: "시작 교시와 종료 교시를 다시 확인해 주세요.",
      })
      return
    }

    if (
      hasConflict(reservations, blocks, form.room, form.date, [
        startIndex,
        endIndex,
      ])
    ) {
      setFormFeedback({
        tone: "error",
        text: "선택한 시간은 기존 예약 또는 관리자가 차단한 시간과 겹칩니다. 다른 시간대를 선택해 주세요.",
      })
      return
    }

    const reservation: Reservation = {
      id: createReservationId(),
      room: form.room,
      date: form.date,
      time: formatTimeRange(form.startTime, form.endTime),
      className: form.className.trim(),
      applicantStudentId: form.applicantStudentId.trim(),
      applicantName: form.applicantName.trim(),
      purpose: form.purpose.trim(),
      createdAt: new Date().toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      status: "pending",
      statusReason: "",
    }

    setIsSubmitting(true)

    try {
      const created = await onCreate(reservation)

      if (!created) {
        setFormFeedback({
          tone: "error",
          text: "예약 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        })
        return
      }

      onClose()
    } catch {
      setFormFeedback({
        tone: "error",
        text: "예약 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (
    reservation: Reservation,
    status: "approved" | "rejected",
  ) => {
    const reason = (rejectionReasons[reservation.id] || "").trim()

    if (status === "rejected" && !reason) {
      setAdminFeedback({
        tone: "error",
        text: "예약을 거절하려면 사유를 입력해 주세요.",
      })
      return
    }

    const actionKey = `${status}:${reservation.id}`
    setBusyAction(actionKey)
    setAdminFeedback(null)

    try {
      const updated = await onUpdate(
        reservation.id,
        status,
        status === "rejected" ? reason : "",
      )

      if (!updated) {
        setAdminFeedback({
          tone: "error",
          text: "예약 상태를 변경하지 못했습니다.",
        })
        return
      }

      setRejectionReasons((current) => {
        const next = { ...current }
        delete next[reservation.id]
        return next
      })
      setAdminFeedback({
        tone: "success",
        text:
          status === "approved"
            ? "예약 요청을 수락했습니다."
            : "예약 요청을 거절했습니다.",
      })
    } catch {
      setAdminFeedback({
        tone: "error",
        text: "예약 상태 변경 중 오류가 발생했습니다.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleDelete = async (reservation: Reservation) => {
    if (
      !window.confirm(
        `${reservation.room} ${reservation.date} 예약 요청을 삭제하시겠습니까?`,
      )
    ) {
      return
    }

    const actionKey = `delete:${reservation.id}`
    setBusyAction(actionKey)
    setAdminFeedback(null)

    try {
      const deleted = await onDelete(reservation.id)
      setAdminFeedback({
        tone: deleted ? "success" : "error",
        text: deleted
          ? "예약 요청을 삭제했습니다."
          : "예약 요청을 삭제하지 못했습니다.",
      })
    } catch {
      setAdminFeedback({
        tone: "error",
        text: "예약 요청 삭제 중 오류가 발생했습니다.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleClear = async () => {
    if (
      !window.confirm(
        "모든 예약 요청을 삭제하시겠습니까? 삭제한 예약은 복구할 수 없습니다.",
      )
    ) {
      return
    }

    setBusyAction("clear")
    setAdminFeedback(null)

    try {
      const cleared = await onClear()
      setAdminFeedback({
        tone: cleared ? "success" : "error",
        text: cleared
          ? "모든 예약 요청을 삭제했습니다."
          : "예약 요청을 삭제하지 못했습니다.",
      })
    } catch {
      setAdminFeedback({
        tone: "error",
        text: "예약 목록 삭제 중 오류가 발생했습니다.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const mainTabs: ReadonlyArray<{
    id: MainTab
    label: string
  }> = isAdmin
    ? [
        { id: "schedule", label: "예약 현황" },
        { id: "form", label: "예약 신청" },
        { id: "manage", label: "요청 관리" },
      ]
    : [
        { id: "schedule", label: "예약 현황" },
        { id: "form", label: "예약 신청" },
      ]

  return (
    <div
      className="reservation-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="reservation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="reservation-modal__header">
          <div className="reservation-modal__heading">
            <p className="reservation-modal__eyebrow">
              Science Lab Reservation
            </p>
            <h2 id={titleId}>과학실 예약 및 안내</h2>
            <p id={descriptionId}>
              예약 현황을 확인한 뒤 사용 시간을 신청해 주세요.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="reservation-modal__close"
            aria-label="예약 창 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div
          className="reservation-modal__tabs"
          role="tablist"
          aria-label="예약 메뉴"
        >
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              id={`${titleId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={mainTab === tab.id}
              aria-controls={`${titleId}-${tab.id}-panel`}
              className={`reservation-modal__tab${
                mainTab === tab.id ? " is-active" : ""
              }`}
              onClick={() => {
                setMainTab(tab.id)
                setFormFeedback(null)
                setAdminFeedback(null)
              }}
            >
              {tab.label}
              {tab.id === "manage" && pendingReservations.length > 0 ? (
                <span className="reservation-modal__tab-count">
                  {pendingReservations.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {mainTab === "schedule" ? (
          <div
            id={`${titleId}-schedule-panel`}
            className="reservation-modal__panel reservation-admin"
            role="tabpanel"
            aria-labelledby={`${titleId}-schedule-tab`}
          >
            {approvedReservations.length ? (
              <div className="reservation-admin__list">
                {approvedReservations.map((reservation) => (
                  <article
                    key={reservation.id}
                    className="reservation-request-card"
                  >
                    <header className="reservation-request-card__header">
                      <div>
                        <h3>{reservation.applicantName || "이름 미입력"}</h3>
                        <p>
                          {reservation.date} · {reservation.time}
                        </p>
                      </div>
                      <span className="reservation-request-card__status is-approved">
                        승인
                      </span>
                    </header>

                    <dl className="reservation-request-card__details">
                      <div>
                        <dt>신청자 이름</dt>
                        <dd>{reservation.applicantName || "미입력"}</dd>
                      </div>
                      <div>
                        <dt>학번</dt>
                        <dd>{reservation.applicantStudentId || "미입력"}</dd>
                      </div>
                      <div>
                        <dt>학급</dt>
                        <dd>{reservation.className || "미입력"}</dd>
                      </div>
                      <div>
                        <dt>공간</dt>
                        <dd>{reservation.room}</dd>
                      </div>
                      <div>
                        <dt>날짜</dt>
                        <dd>{reservation.date}</dd>
                      </div>
                      <div>
                        <dt>시간</dt>
                        <dd>{reservation.time}</dd>
                      </div>
                      <div className="is-wide">
                        <dt>목적</dt>
                        <dd>{reservation.purpose || "미입력"}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="reservation-admin__empty">
                승인된 예약이 아직 없습니다.
              </p>
            )}
          </div>
        ) : null}

        {mainTab === "form" ? (
          <div
            id={`${titleId}-form-panel`}
            className="reservation-modal__panel"
            role="tabpanel"
            aria-labelledby={`${titleId}-form-tab`}
          >
            <form className="reservation-form" onSubmit={handleSubmit}>
              <div className="reservation-form__grid">
                <label>
                  <span>공간</span>
                  <select
                    required
                    name="room"
                    value={form.room}
                    onChange={(event) =>
                      setFormField("room", event.target.value)
                    }
                  >
                    {ROOMS.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>날짜</span>
                  <input
                    required
                    type="date"
                    name="date"
                    min={today}
                    value={form.date}
                    onChange={(event) =>
                      setFormField("date", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>시작 교시</span>
                  <select
                    required
                    name="startTime"
                    value={form.startTime}
                    onChange={(event) =>
                      handleStartTimeChange(event.target.value)
                    }
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>종료 교시</span>
                  <select
                    required
                    name="endTime"
                    value={form.endTime}
                    onChange={(event) =>
                      handleEndTimeChange(event.target.value)
                    }
                  >
                    {TIME_SLOTS.map((slot, index) => (
                      <option
                        key={slot}
                        value={slot}
                        disabled={
                          index <
                          TIME_SLOTS.indexOf(
                            form.startTime as typeof TIME_SLOTS[number],
                          )
                        }
                      >
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>학급/동아리</span>
                  <input
                    type="text"
                    name="className"
                    maxLength={80}
                    value={form.className}
                    placeholder="예: 3학년 8반"
                    onChange={(event) =>
                      setFormField("className", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>신청자 학번</span>
                  <input
                    type="text"
                    name="applicantStudentId"
                    maxLength={30}
                    value={form.applicantStudentId}
                    placeholder="예: 3813"
                    onChange={(event) =>
                      setFormField("applicantStudentId", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>신청자 이름</span>
                  <input
                    type="text"
                    name="applicantName"
                    maxLength={50}
                    value={form.applicantName}
                    placeholder="예: 홍길동"
                    onChange={(event) =>
                      setFormField("applicantName", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="reservation-form__purpose">
                <span>사용 목적</span>
                <textarea
                  name="purpose"
                  rows={4}
                  maxLength={500}
                  value={form.purpose}
                  placeholder="실험명이나 필요한 준비물을 적어주세요."
                  onChange={(event) =>
                    setFormField("purpose", event.target.value)
                  }
                />
              </label>

              {formFeedback ? (
                <p
                  className={`reservation-modal__feedback is-${formFeedback.tone}`}
                  role={formFeedback.tone === "error" ? "alert" : "status"}
                >
                  {formFeedback.text}
                </p>
              ) : null}

              <div className="reservation-form__actions">
                <button
                  type="button"
                  className="reservation-button is-secondary"
                  onClick={onClose}
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="reservation-button is-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "예약 요청 중…" : "예약 요청"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {mainTab === "manage" && isAdmin ? (
          <div
            id={`${titleId}-manage-panel`}
            className="reservation-modal__panel reservation-admin"
            role="tabpanel"
            aria-labelledby={`${titleId}-manage-tab`}
          >
            <div className="reservation-admin__toolbar">
              <div
                className="reservation-admin__tabs"
                role="tablist"
                aria-label="예약 요청 상태"
              >
                <button
                  id={`${titleId}-pending-admin-tab`}
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "pending"}
                  aria-controls={`${titleId}-admin-list-panel`}
                  className={adminTab === "pending" ? "is-active" : ""}
                  onClick={() => {
                    setAdminTab("pending")
                    setAdminFeedback(null)
                  }}
                >
                  대기 요청 <span>{pendingReservations.length}</span>
                </button>
                <button
                  id={`${titleId}-completed-admin-tab`}
                  type="button"
                  role="tab"
                  aria-selected={adminTab === "completed"}
                  aria-controls={`${titleId}-admin-list-panel`}
                  className={adminTab === "completed" ? "is-active" : ""}
                  onClick={() => {
                    setAdminTab("completed")
                    setAdminFeedback(null)
                  }}
                >
                  완료 요청 <span>{completedReservations.length}</span>
                </button>
              </div>

              <button
                type="button"
                className="reservation-button is-danger"
                disabled={busyAction !== null || reservations.length === 0}
                onClick={() => void handleClear()}
              >
                {busyAction === "clear" ? "삭제 중…" : "전체 삭제"}
              </button>
            </div>

            {adminFeedback ? (
              <p
                className={`reservation-modal__feedback is-${adminFeedback.tone}`}
                role={adminFeedback.tone === "error" ? "alert" : "status"}
              >
                {adminFeedback.text}
              </p>
            ) : null}

            <div
              id={`${titleId}-admin-list-panel`}
              role="tabpanel"
              aria-labelledby={`${titleId}-${adminTab}-admin-tab`}
            >
              {visibleAdminReservations.length ? (
                <div className="reservation-admin__list">
                  {visibleAdminReservations.map((reservation) => {
                    const approveKey = `approved:${reservation.id}`
                    const rejectKey = `rejected:${reservation.id}`
                    const deleteKey = `delete:${reservation.id}`

                    return (
                      <article
                        key={reservation.id}
                        className="reservation-request-card"
                      >
                        <header className="reservation-request-card__header">
                          <div>
                            <h3>{reservation.room}</h3>
                            <p>
                              {reservation.date} · {reservation.time}
                            </p>
                          </div>
                          <span
                            className={`reservation-request-card__status is-${reservation.status}`}
                          >
                            {getStatusLabel(reservation.status)}
                          </span>
                        </header>

                        <dl className="reservation-request-card__details">
                          <div>
                            <dt>학급/동아리</dt>
                            <dd>{reservation.className || "미입력"}</dd>
                          </div>
                          <div>
                            <dt>신청자 학번</dt>
                            <dd>
                              {reservation.applicantStudentId || "미입력"}
                            </dd>
                          </div>
                          <div>
                            <dt>신청자 이름</dt>
                            <dd>{reservation.applicantName || "미입력"}</dd>
                          </div>
                          <div>
                            <dt>신청 시각</dt>
                            <dd>{reservation.createdAt || "기록 없음"}</dd>
                          </div>
                          <div className="is-wide">
                            <dt>사용 목적</dt>
                            <dd>{reservation.purpose || "미입력"}</dd>
                          </div>
                          {reservation.statusReason ? (
                            <div className="is-wide">
                              <dt>처리 사유</dt>
                              <dd>{reservation.statusReason}</dd>
                            </div>
                          ) : null}
                        </dl>

                        {reservation.status === "pending" ? (
                          <div className="reservation-request-card__review">
                            <label>
                              <span>거절 사유</span>
                              <textarea
                                rows={2}
                                maxLength={300}
                                value={rejectionReasons[reservation.id] || ""}
                                placeholder="거절할 때는 사유를 반드시 입력하세요."
                                onChange={(event) => {
                                  setRejectionReasons((current) => ({
                                    ...current,
                                    [reservation.id]: event.target.value,
                                  }))
                                  setAdminFeedback(null)
                                }}
                              />
                            </label>
                            <div className="reservation-request-card__actions">
                              <button
                                type="button"
                                className="reservation-button is-approve"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  void handleUpdate(reservation, "approved")
                                }
                              >
                                {busyAction === approveKey
                                  ? "수락 중…"
                                  : "수락"}
                              </button>
                              <button
                                type="button"
                                className="reservation-button is-reject"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  void handleUpdate(reservation, "rejected")
                                }
                              >
                                {busyAction === rejectKey ? "거절 중…" : "거절"}
                              </button>
                              <button
                                type="button"
                                className="reservation-button is-danger"
                                disabled={busyAction !== null}
                                onClick={() => void handleDelete(reservation)}
                              >
                                {busyAction === deleteKey ? "삭제 중…" : "삭제"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="reservation-request-card__actions">
                            <button
                              type="button"
                              className="reservation-button is-danger"
                              disabled={busyAction !== null}
                              onClick={() => void handleDelete(reservation)}
                            >
                              {busyAction === deleteKey ? "삭제 중…" : "삭제"}
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="reservation-admin__empty">
                  {adminTab === "pending"
                    ? "대기 중인 예약 요청이 없습니다."
                    : "처리된 예약 요청이 없습니다."}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
