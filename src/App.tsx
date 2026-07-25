import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AccountModal, AuthModal } from "./AuthModals"
import AdminDashboard from "./AdminDashboard"
import CabinetViewer from "./CabinetViewer"
import { AboutPage, HomePage } from "./HomeAbout"
import InventoryPage from "./InventoryPage"
import ReservationModal from "./ReservationModal"
import SurveyPage from "./SurveyPage"
import {
  buildInventoryItems,
  loadLiveInventory,
  STATIC_LAB_ITEMS,
  STATIC_REAGENTS,
  type InventorySnapshot,
} from "./inventory"
import {
  createNotice,
  createReservation,
  createReservationBlock,
  getCurrentSession,
  isAdminEmail,
  loadInventoryEdits,
  loadNotices,
  loadReservationBlocks,
  loadReservations,
  normalizeEmail,
  removeAllReservations,
  removeNotice,
  removeReservation,
  removeReservationBlock,
  saveInventoryEdit,
  subscribeToAuth,
  updateReservation,
} from "./supabase"
import type {
  Area,
  AuthUser,
  InventoryEdits,
  InventoryItem,
  Notice,
  Reservation,
  ReservationBlock,
  ToastMessage,
} from "./types"

type View = "home" | "inventory" | "survey" | "about" | "admin"
type ModalName = "auth" | "account" | "reservation" | null
type Theme = "light" | "dark"
type SyncStatus = "idle" | "syncing" | "success" | "partial" | "error"

const INVENTORY_EDITS_KEY = "science-lab-inventory-edits"
const RESERVATIONS_KEY = "science-lab-reservations"
const RESERVATION_BLOCKS_KEY = "science-lab-reservation-blocks"
const NOTICES_KEY = "science-lab-notices"
const THEME_KEY = "science-lab-theme"

const DEFAULT_NOTICES: Notice[] = [
  {
    id: "notice-1",
    content: "🧪 과학실 사용 전 예약은 최소 3일 전까지 완료해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:00",
  },
  {
    id: "notice-2",
    content:
      "⚠️ 실험 중 유독성 물질 사용 시 반드시 보안경과 실험용 장갑을 착용해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:05",
  },
  {
    id: "notice-3",
    content:
      "🧹 실험이 끝난 후 물품 정돈 및 전기·가스 차단 여부를 꼭 점검해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:10",
  },
]

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The app remains usable if private browsing blocks local storage.
  }
}

function parseRoute(): { view: View; area: Area } {
  const rawHash = window.location.hash.replace(/^#/, "")

  if (rawHash.startsWith("prep-room")) {
    const rawArea = rawHash.split("/")[1]
    const decodedArea = rawArea ? decodeURIComponent(rawArea) : "전체"
    const area: Area = ["시약", "화학실", "생명실", "준비실", "전체"].includes(
      decodedArea,
    )
      ? decodedArea as Area
      : "전체"
    return { view: "inventory", area }
  }

  if (rawHash === "survey") return { view: "survey", area: "시약" }
  if (rawHash === "admin") return { view: "admin", area: "전체" }
  if (rawHash === "about") return { view: "about", area: "전체" }
  return { view: "home", area: "전체" }
}

function routeHash(view: View, area: Area): string {
  if (view === "inventory") return `#prep-room/${encodeURIComponent(area)}`
  if (view === "survey") return "#survey"
  if (view === "admin") return "#admin"
  if (view === "about") return "#about"
  return window.location.pathname + window.location.search
}

function formatNow(): string {
  return new Date().toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function Header({
  view,
  user,
  theme,
  onHome,
  onSpaces,
  onInventory,
  onAdmin,
  onAbout,
  onReservation,
  onAuth,
  onAccount,
  onToggleTheme,
}: {
  view: View
  user: AuthUser | null
  theme: Theme
  onHome: () => void
  onSpaces: () => void
  onInventory: () => void
  onAdmin: () => void
  onAbout: () => void
  onReservation: () => void
  onAuth: () => void
  onAccount: () => void
  onToggleTheme: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  const runMobileAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <button className="brand" onClick={onHome} type="button">
          <span className="brand-icon" aria-hidden="true">
            S
          </span>
          <strong>오송고 과학실</strong>
        </button>

        <nav className="desktop-nav" aria-label="주요 메뉴">
          <button
            className={view === "home" ? "is-active" : ""}
            onClick={onHome}
            type="button"
          >
            NOW
          </button>
          <button onClick={onSpaces} type="button">
            실험실
          </button>
          <button
            className={view === "about" ? "is-active" : ""}
            onClick={onAbout}
            type="button"
          >
            공지
          </button>
          <button
            className={
              view === "inventory" || view === "survey" ? "is-active" : ""
            }
            onClick={onInventory}
            type="button"
          >
            분류표
          </button>
          <button onClick={onReservation} type="button">
            예약
          </button>
          {user?.isAdmin && (
            <button
              className={view === "admin" ? "is-active" : ""}
              onClick={onAdmin}
              type="button"
            >
              관리
            </button>
          )}
        </nav>

        <div className="header-actions">
          <button
            aria-label={
              theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"
            }
            aria-pressed={theme === "dark"}
            className="theme-toggle"
            onClick={onToggleTheme}
            type="button"
          >
            {theme === "light" ? "☾" : "☀︎"}
          </button>
          {user ? (
            <button
              className="account-button"
              onClick={onAccount}
              type="button"
            >
              <span>{user.email.slice(0, 1).toUpperCase()}</span>
              <b>내 계정</b>
            </button>
          ) : (
            <button className="login-button" onClick={onAuth} type="button">
              로그인
            </button>
          )}
          <button
            aria-expanded={menuOpen}
            aria-label="전체 메뉴"
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            ☰
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-menu" role="dialog" aria-modal="true">
          <button
            aria-label="메뉴 닫기"
            className="mobile-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <section className="mobile-menu-sheet">
            <header>
              <div className="brand">
                <span className="brand-icon" aria-hidden="true">
                  S
                </span>
                <strong>오송고 과학실</strong>
              </div>
              <button
                aria-label="닫기"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <nav aria-label="모바일 메뉴">
              {[
                ["NOW", onHome],
                ["실험실", onSpaces],
                ["공지", onAbout],
                ["분류표", onInventory],
                ["예약", onReservation],
                ...(user?.isAdmin ? [["관리자", onAdmin]] : []),
              ].map(([label, action]) => (
                <button
                  key={String(label)}
                  onClick={() => runMobileAction(action as () => void)}
                  type="button"
                >
                  <span>{String(label)}</span>
                  <i aria-hidden="true">›</i>
                </button>
              ))}
            </nav>
            <div className="mobile-menu-actions">
              <button
                className="button secondary"
                onClick={() => runMobileAction(onToggleTheme)}
                type="button"
              >
                {theme === "light" ? "다크 모드" : "라이트 모드"}
              </button>
              <button
                className="button primary"
                onClick={() => runMobileAction(user ? onAccount : onAuth)}
                type="button"
              >
                {user ? "내 계정" : "로그인"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function ItemDetailSheet({
  item,
  onClose,
}: {
  item: InventoryItem
  onClose: () => void
}) {
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    document.body.style.overflow = "hidden"
    sheetRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  const status = item.toxic ? "유독물질" : item.lowStock ? "잔량 부족" : "정상"
  const source = item.sourceSheet
    ? `${item.sourceSheet}${item.sourceCell ? ` · ${item.sourceCell}` : ""}`
    : item.type === "reagent"
      ? "내장 시약 데이터"
      : "실험실 기구 목록"

  return (
    <div className="sheet-overlay">
      <button
        aria-label="상세 닫기"
        className="sheet-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="item-detail-title"
        aria-modal="true"
        className="item-sheet"
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="sheet-handle" />
        <header className={`item-sheet-hero is-${item.area}`}>
          <div>
            <p>{item.area}</p>
            <h2 id="item-detail-title">{item.name}</h2>
          </div>
          <button aria-label="닫기" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="item-sheet-content">
          <div className="detail-grid">
            {[
              ["분류", item.category],
              ["위치", item.location],
              ["수량", item.quantity],
              ["상태", status],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="detail-copy">
            <p className="eyebrow">Details</p>
            <strong>{item.detail}</strong>
            {item.formula !== "-" && <span>{item.formula}</span>}
            <small>{source}</small>
          </section>
          <CabinetViewer item={item} />
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const initialRoute = useMemo(parseRoute, [])
  const [view, setView] = useState<View>(initialRoute.view)
  const [activeArea, setActiveArea] = useState<Area>(initialRoute.area)
  const [modal, setModal] = useState<ModalName>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === "dark" ? "dark" : "light"
  })
  const [user, setUser] = useState<AuthUser | null>(null)
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(() => ({
    reagents: STATIC_REAGENTS,
    labItems: STATIC_LAB_ITEMS,
    failedSheets: [],
  }))
  const [inventoryEdits, setInventoryEdits] = useState<InventoryEdits>(() =>
    readStorage(INVENTORY_EDITS_KEY, {}),
  )
  const [reservations, setReservations] = useState<Reservation[]>(() =>
    readStorage(RESERVATIONS_KEY, []),
  )
  const [reservationBlocks, setReservationBlocks] =
    useState<ReservationBlock[]>(() => readStorage(RESERVATION_BLOCKS_KEY, []))
  const [notices, setNotices] = useState<Notice[]>(() =>
    readStorage(NOTICES_KEY, DEFAULT_NOTICES),
  )
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [dataSource, setDataSource] = useState<"static" | "live">("static")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const syncInFlight = useRef(false)
  const lastSyncError = useRef("")
  const pendingInventoryEdits = useRef<Record<string, string>>({})

  const showToast = useCallback(
    (text: string, tone: "default" | "success" | "error" = "default") => {
      setToast({ id: Date.now(), text, tone })
    },
    [],
  )
  const closeModal = useCallback(() => setModal(null), [])
  const closeItem = useCallback(() => setSelectedItem(null), [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute()
      setView(route.view)
      setActiveArea(route.area)
      setModal(null)
      setSelectedItem(null)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("popstate", onPopState)
    window.history.replaceState(
      { view: initialRoute.view, area: initialRoute.area },
      "",
      window.location.href,
    )
    return () => window.removeEventListener("popstate", onPopState)
  }, [initialRoute.area, initialRoute.view])

  const navigate = useCallback(
    (nextView: View, area: Area = activeArea) => {
      setView(nextView)
      setActiveArea(area)
      setModal(null)
      setSelectedItem(null)
      window.history.pushState(
        { view: nextView, area },
        "",
        routeHash(nextView, area),
      )
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [activeArea],
  )

  useEffect(() => {
    let cancelled = false

    const applySession = (session: { user?: { email?: string } } | null) => {
      if (cancelled) return
      const email = normalizeEmail(session?.user?.email)
      setUser(email ? { email, isAdmin: isAdminEmail(email) } : null)
    }

    void getCurrentSession()
      .then(applySession)
      .catch(() => applySession(null))
    const unsubscribe = subscribeToAuth(applySession)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void Promise.allSettled([
      loadReservations(),
      loadReservationBlocks(),
      loadNotices(),
      loadInventoryEdits(),
    ]).then(
      ([
        reservationResult,
        reservationBlocksResult,
        noticeResult,
        editsResult,
      ]) => {
        if (cancelled) return

        if (reservationResult.status === "fulfilled") {
          setReservations(reservationResult.value)
          writeStorage(RESERVATIONS_KEY, reservationResult.value)
        }
        if (reservationBlocksResult.status === "fulfilled") {
          setReservationBlocks(reservationBlocksResult.value)
          writeStorage(RESERVATION_BLOCKS_KEY, reservationBlocksResult.value)
        }
        if (noticeResult.status === "fulfilled") {
          const nextNotices = noticeResult.value.length
            ? noticeResult.value
            : DEFAULT_NOTICES
          setNotices(nextNotices)
          writeStorage(NOTICES_KEY, nextNotices)
        }
        if (editsResult.status === "fulfilled") {
          setInventoryEdits(editsResult.value)
          writeStorage(INVENTORY_EDITS_KEY, editsResult.value)
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [user?.email])

  const syncInventory = useCallback(
    async (announce = false) => {
      if (syncInFlight.current) return
      syncInFlight.current = true
      setSyncStatus("syncing")

      try {
        const [inventoryResult, editsResult] = await Promise.allSettled([
          loadLiveInventory(),
          loadInventoryEdits(),
        ])
        if (inventoryResult.status === "rejected") throw inventoryResult.reason
        const next = inventoryResult.value
        const reagentFailed = next.failedSheets.includes("시약 조사표")
        const labItemFailed = next.failedSheets.includes("기구 목록")

        setSnapshot((current) => ({
          reagents: reagentFailed ? current.reagents : next.reagents,
          labItems: labItemFailed ? current.labItems : next.labItems,
          failedSheets: next.failedSheets,
        }))

        if (!reagentFailed || !labItemFailed) setDataSource("live")

        if (editsResult.status === "fulfilled") {
          setInventoryEdits(() => {
            const merged = { ...editsResult.value }

            for (const [key, value] of Object.entries(
              pendingInventoryEdits.current,
            )) {
              const [itemId, field] = key.split(
                "\u0000",
              ) as [string, keyof InventoryEdits[string]]
              if (merged[itemId]?.[field] === value) {
                delete pendingInventoryEdits.current[key]
              } else {
                merged[itemId] = { ...merged[itemId], [field]: value }
              }
            }

            writeStorage(INVENTORY_EDITS_KEY, merged)
            return merged
          })
        }

        if (next.failedSheets.length) {
          setSyncStatus(next.failedSheets.length === 2 ? "error" : "partial")
          const key = next.failedSheets.join("|")
          if (announce || lastSyncError.current !== key) {
            showToast(
              `${next.failedSheets.join(", ")} 연결에 실패해 기존 데이터를 유지합니다.`,
              "error",
            )
          }
          lastSyncError.current = key
        } else {
          setSyncStatus("success")
          if (announce) showToast("최신 재고를 불러왔습니다.", "success")
          else if (lastSyncError.current) {
            showToast("Google Sheets 연결이 복구되었습니다.", "success")
          }
          lastSyncError.current = ""
        }
      } catch {
        setSyncStatus("error")
        if (announce || !lastSyncError.current) {
          showToast("재고 동기화에 실패해 기존 데이터를 유지합니다.", "error")
        }
        lastSyncError.current = "unexpected"
      } finally {
        syncInFlight.current = false
      }
    },
    [showToast],
  )

  useEffect(() => {
    void syncInventory()
    const interval = window.setInterval(() => {
      if (!document.hidden) void syncInventory()
    }, 30000)
    const refresh = () => void syncInventory()
    const onVisibility = () => {
      if (!document.hidden) void syncInventory()
    }

    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [syncInventory])

  const items = useMemo(
    () =>
      buildInventoryItems(snapshot.reagents, snapshot.labItems, inventoryEdits),
    [inventoryEdits, snapshot.labItems, snapshot.reagents],
  )

  const inventorySummary = useMemo(() => {
    const reagents = items.filter((item) => item.type === "reagent").length
    return {
      total: items.length,
      reagents,
      equipment: items.length - reagents,
      alerts: items.filter((item) => item.toxic || item.lowStock).length,
    }
  }, [items])

  const handleInventoryEdit = useCallback(
    async (
      item: InventoryItem,
      field: keyof InventoryEdits[string],
      value: string,
    ) => {
      const isPublicQuantityEdit =
        field === "quantity" && item.type === "reagent"

      if (!isPublicQuantityEdit && !user?.isAdmin) return false
      if (item.googleSheetManaged && field !== "quantity") {
        showToast("이 항목은 연결된 Google Sheet에서 수정해 주세요.", "error")
        return false
      }

      const pendingKey = `${item.id}\u0000${field}`
      pendingInventoryEdits.current[pendingKey] = value
      setInventoryEdits((current) => {
        const nextEdits = {
          ...current,
          [item.id]: { ...current[item.id], [field]: value },
        }
        writeStorage(INVENTORY_EDITS_KEY, nextEdits)
        return nextEdits
      })

      try {
        await saveInventoryEdit(item.id, field, value)
        delete pendingInventoryEdits.current[pendingKey]
        showToast(
          isPublicQuantityEdit
            ? "잔량을 모두에게 공유했습니다."
            : "변경 내용을 저장했습니다.",
          "success",
        )
        return true
      } catch {
        showToast(
          "이 기기에는 저장했지만 서버 저장에 실패했습니다.",
          "error",
        )
        return false
      }
    },
    [showToast, user?.isAdmin],
  )

  const handleCreateReservation = useCallback(
    async (reservation: Reservation) => {
      try {
        await createReservation(reservation)
        const next = [reservation, ...reservations].slice(0, 100)
        setReservations(next)
        writeStorage(RESERVATIONS_KEY, next)
        showToast("예약 요청을 접수했습니다.", "success")
        return true
      } catch {
        const next = [reservation, ...reservations].slice(0, 100)
        setReservations(next)
        writeStorage(RESERVATIONS_KEY, next)
        showToast(
          "서버에 연결하지 못해 이 기기에만 예약 요청을 저장했습니다.",
          "error",
        )
        return true
      }
    },
    [reservations, showToast],
  )

  const handleUpdateReservation = useCallback(
    async (id: string, status: "approved" | "rejected", reason: string) => {
      if (!user?.isAdmin) return false
      try {
        await updateReservation(id, status, reason)
        const next = reservations.map((reservation) =>
          reservation.id === id
            ? {
                ...reservation,
                status,
                statusReason: status === "rejected" ? reason.trim() : "",
              }
            : reservation,
        )
        setReservations(next)
        writeStorage(RESERVATIONS_KEY, next)
        showToast(
          status === "approved"
            ? "예약 요청을 수락했습니다."
            : "예약 요청을 거절했습니다.",
          "success",
        )
        return true
      } catch {
        showToast("예약 상태를 저장하지 못했습니다.", "error")
        return false
      }
    },
    [reservations, showToast, user?.isAdmin],
  )

  const handleDeleteReservation = useCallback(
    async (id: string) => {
      if (!user?.isAdmin) return false
      try {
        await removeReservation(id)
        const next = reservations.filter((reservation) => reservation.id !== id)
        setReservations(next)
        writeStorage(RESERVATIONS_KEY, next)
        showToast("예약 요청을 삭제했습니다.", "success")
        return true
      } catch {
        showToast("예약 요청을 삭제하지 못했습니다.", "error")
        return false
      }
    },
    [reservations, showToast, user?.isAdmin],
  )

  const handleClearReservations = useCallback(async () => {
    if (!user?.isAdmin) return false
    try {
      await removeAllReservations()
      setReservations([])
      writeStorage(RESERVATIONS_KEY, [])
      showToast("예약 요청을 모두 삭제했습니다.", "success")
      return true
    } catch {
      showToast("예약 목록을 비우지 못했습니다.", "error")
      return false
    }
  }, [showToast, user?.isAdmin])

  const handleCreateReservationBlock = useCallback(
    async (input: Omit<ReservationBlock, "id" | "createdAt">) => {
      if (!user?.isAdmin) return false
      const block: ReservationBlock = {
        ...input,
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: formatNow(),
      }
      const next = [block, ...reservationBlocks]

      try {
        await createReservationBlock(block)
        setReservationBlocks(next)
        writeStorage(RESERVATION_BLOCKS_KEY, next)
        showToast("예약 불가 시간을 등록했습니다.", "success")
        return true
      } catch {
        setReservationBlocks(next)
        writeStorage(RESERVATION_BLOCKS_KEY, next)
        showToast("이 기기에는 차단했지만 서버 저장에 실패했습니다.", "error")
        return true
      }
    },
    [reservationBlocks, showToast, user?.isAdmin],
  )

  const handleDeleteReservationBlock = useCallback(
    async (id: string) => {
      if (!user?.isAdmin) return false
      const next = reservationBlocks.filter((block) => block.id !== id)

      try {
        await removeReservationBlock(id)
        setReservationBlocks(next)
        writeStorage(RESERVATION_BLOCKS_KEY, next)
        showToast("예약 차단을 해제했습니다.", "success")
        return true
      } catch {
        setReservationBlocks(next)
        writeStorage(RESERVATION_BLOCKS_KEY, next)
        showToast("이 기기에서는 해제했지만 서버 저장에 실패했습니다.", "error")
        return true
      }
    },
    [reservationBlocks, showToast, user?.isAdmin],
  )

  const handleAddNotice = useCallback(
    async (content: string) => {
      if (!user?.isAdmin) return false
      const notice: Notice = {
        id: `notice-${Date.now()}`,
        content: content.trim(),
        createdAt: formatNow(),
      }

      try {
        await createNotice(notice)
        const next = [notice, ...notices]
        setNotices(next)
        writeStorage(NOTICES_KEY, next)
        showToast("공지사항을 등록했습니다.", "success")
        return true
      } catch {
        showToast("공지사항을 서버에 저장하지 못했습니다.", "error")
        return false
      }
    },
    [notices, showToast, user?.isAdmin],
  )

  const handleDeleteNotice = useCallback(
    async (id: string) => {
      if (!user?.isAdmin) return false
      try {
        await removeNotice(id)
        const next = notices.filter((notice) => notice.id !== id)
        setNotices(next)
        writeStorage(NOTICES_KEY, next)
        showToast("공지사항을 삭제했습니다.", "success")
        return true
      } catch {
        showToast("공지사항을 삭제하지 못했습니다.", "error")
        return false
      }
    },
    [notices, showToast, user?.isAdmin],
  )

  const openSpaces = () => {
    if (view !== "home") navigate("home", "전체")
    window.setTimeout(
      () =>
        document
          .querySelector("#spaces")
          ?.scrollIntoView({ behavior: "smooth" }),
      view === "home" ? 0 : 120,
    )
  }

  return (
    <div className="app-shell">
      <Header
        onAdmin={() => navigate("admin", "전체")}
        onAbout={() => navigate("about", activeArea)}
        onAccount={() => setModal("account")}
        onAuth={() => setModal("auth")}
        onHome={() => navigate("home", activeArea)}
        onInventory={() => navigate("inventory", "전체")}
        onReservation={() => setModal("reservation")}
        onSpaces={openSpaces}
        onToggleTheme={() =>
          setTheme((current) => (current === "light" ? "dark" : "light"))
        }
        theme={theme}
        user={user}
        view={view}
      />

      {view === "home" && (
        <HomePage
          items={items}
          onOpenArea={(area) => navigate("inventory", area)}
          source={dataSource}
          user={user}
        />
      )}
      {view === "inventory" && (
        <InventoryPage
          activeArea={activeArea}
          dataSource={dataSource}
          isAdmin={Boolean(user?.isAdmin)}
          items={items}
          onAreaChange={(area) => navigate("inventory", area)}
          onEdit={handleInventoryEdit}
          onOpenSurvey={() => navigate("survey", "시약")}
          onSelect={setSelectedItem}
          onSync={() => void syncInventory(true)}
          syncStatus={syncStatus}
        />
      )}
      {view === "survey" && (
        <SurveyPage
          items={items}
          onBack={() => navigate("inventory", "시약")}
          onQuantityChange={(itemId, quantity) => {
            const item = items.find((candidate) => candidate.id === itemId)
            return item ? handleInventoryEdit(item, "quantity", quantity) : false
          }}
        />
      )}
      {view === "about" && (
        <AboutPage
          isAdmin={Boolean(user?.isAdmin)}
          notices={notices}
          onAddNotice={handleAddNotice}
          onDeleteNotice={handleDeleteNotice}
        />
      )}
      {view === "admin" &&
        (user?.isAdmin ? (
          <AdminDashboard
            blocks={reservationBlocks}
            items={items}
            notices={notices}
            onAddNotice={handleAddNotice}
            onCreateBlock={handleCreateReservationBlock}
            onDeleteBlock={handleDeleteReservationBlock}
            onDeleteNotice={handleDeleteNotice}
            onOpenInventory={() => navigate("inventory", "전체")}
            onOpenReservations={() => setModal("reservation")}
            reservations={reservations}
          />
        ) : (
          <main className="admin-access-page" id="main-content">
            <section className="ios-card admin-access-card">
              <span aria-hidden="true">⌁</span>
              <p className="eyebrow">Admin only</p>
              <h1>관리자 전용 화면입니다.</h1>
              <p>
                관리자 계정으로 로그인하면 시트 리포트, 공지, 예약 차단을
                한곳에서 관리할 수 있습니다.
              </p>
              {!user && (
                <button
                  className="button primary"
                  onClick={() => setModal("auth")}
                  type="button"
                >
                  관리자 로그인
                </button>
              )}
            </section>
          </main>
        ))}

      {modal === "auth" && (
        <AuthModal onClose={closeModal} onToast={showToast} />
      )}
      {modal === "account" && user && (
        <AccountModal
          inventorySummary={inventorySummary}
          onClose={closeModal}
          onOpenAdmin={() => {
            setModal(null)
            navigate("admin", "전체")
          }}
          onToast={showToast}
          user={user}
        />
      )}
      {modal === "reservation" && (
        <ReservationModal
          blocks={reservationBlocks}
          isAdmin={Boolean(user?.isAdmin)}
          onClear={handleClearReservations}
          onClose={closeModal}
          onCreate={handleCreateReservation}
          onDelete={handleDeleteReservation}
          onUpdate={handleUpdateReservation}
          reservations={reservations}
        />
      )}
      {selectedItem && (
        <ItemDetailSheet item={selectedItem} onClose={closeItem} />
      )}

      {toast && (
        <div
          aria-live="polite"
          className={`toast is-${toast.tone ?? "default"}`}
          key={toast.id}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
