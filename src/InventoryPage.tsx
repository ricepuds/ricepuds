import { useEffect, useMemo, useRef, useState } from "react"
import type {
  Area,
  InventoryEdits,
  InventoryItem,
  InventoryStatus,
  SortKey,
} from "./types"

interface InventoryPageProps {
  items: InventoryItem[]
  activeArea: Area
  isAdmin: boolean
  syncStatus: "idle" | "syncing" | "success" | "partial" | "error"
  dataSource: "static" | "live"
  onAreaChange: (area: Area) => void
  onOpenSurvey: () => void
  onSync: () => void
  onSelect: (item: InventoryItem) => void
  onEdit: (
    item: InventoryItem,
    field: keyof InventoryEdits[string],
    value: string,
  ) => void
}

type StatusFilter = "all" | "toxic" | "low"

const AREAS: Area[] = ["시약", "화학실", "생명실", "준비실", "전체"]
const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "id", label: "번호" },
  { value: "area", label: "공간" },
  { value: "category", label: "분류" },
  { value: "name", label: "이름" },
  { value: "location", label: "위치" },
]
const REMAINING_LEVELS = [
  "가득참(75~100%)",
  "절반(25~75%)",
  "소량(25%미만)",
  "거의없음",
  "수량미기록",
] as const
const CUSTOM_QUANTITY_VALUE = "__custom_quantity__"
const INITIAL_ROW_COUNT = 40
const ROW_BATCH_SIZE = 40

function getStatus(item: InventoryItem): InventoryStatus {
  if (item.toxic) return "toxic"
  if (item.lowStock) return "low"
  return "normal"
}

function getStatusLabel(item: InventoryItem): string {
  if (item.type === "equipment") return "보관"
  if (item.toxic) return "유독"
  if (item.lowStock) return "부족"
  return "보통"
}

function categoryValue(item: InventoryItem, area: Area): string {
  return area === "전체" ? item.area : item.category
}

function compareItems(
  a: InventoryItem,
  b: InventoryItem,
  sort: SortKey,
): number {
  if (sort === "id") return a.numericId - b.numericId

  const first = sort === "area" ? a.area : String(a[sort])
  const second = sort === "area" ? b.area : String(b[sort])
  return first.localeCompare(second, "ko-KR") || a.numericId - b.numericId
}

function EditableField({
  value,
  label,
  multiline = false,
  onCommit,
}: {
  value: string
  label: string
  multiline?: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const normalized = draft.trim() || "-"
    setDraft(normalized)
    if (normalized !== value) onCommit(normalized)
  }

  const commonProps = {
    "aria-label": label,
    className: "inline-edit",
    onBlur: commit,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.target.value),
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      event.stopPropagation()
      if (event.key === "Escape") {
        setDraft(value)
        event.currentTarget.blur()
      }
      if (event.key === "Enter" && !multiline) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
    value: draft,
  }

  return multiline ? (
    <textarea {...commonProps} rows={2} />
  ) : (
    <input {...commonProps} type="text" />
  )
}

function QuantityField({
  item,
  onCommit,
}: {
  item: InventoryItem
  onCommit: (value: string) => void
}) {
  const isPresetQuantity = REMAINING_LEVELS.includes(
    item.quantity as typeof REMAINING_LEVELS[number],
  )
  const [isCustom, setIsCustom] = useState(!isPresetQuantity)
  const [draft, setDraft] = useState(isPresetQuantity ? "" : item.quantity)
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldFocusCustomInputRef = useRef(false)

  useEffect(() => {
    const nextIsPreset = REMAINING_LEVELS.includes(
      item.quantity as typeof REMAINING_LEVELS[number],
    )
    shouldFocusCustomInputRef.current = false
    setIsCustom(!nextIsPreset)
    setDraft(nextIsPreset || item.quantity === "-" ? "" : item.quantity)
  }, [item.id, item.quantity])

  useEffect(() => {
    if (!isCustom || !shouldFocusCustomInputRef.current) return

    shouldFocusCustomInputRef.current = false
    inputRef.current?.focus()
  }, [isCustom])

  const commitCustomQuantity = () => {
    const normalized = draft.trim()
    if (!normalized) {
      inputRef.current?.focus()
      return
    }

    setDraft(normalized)
    if (normalized !== item.quantity) onCommit(normalized)
  }

  return (
    <div
      className={"quantity-editor" + (isCustom ? " is-custom" : "")}
      onClick={(event) => event.stopPropagation()}
    >
      <select
        aria-label={item.name + " 잔량"}
        onChange={(event) => {
          const nextValue = event.target.value
          if (nextValue === CUSTOM_QUANTITY_VALUE) {
            setDraft(isPresetQuantity ? "" : item.quantity)
            shouldFocusCustomInputRef.current = true

            setIsCustom(true)
            return
          }

          setIsCustom(false)
          setDraft("")
          if (nextValue !== item.quantity) onCommit(nextValue)
        }}
        value={isCustom ? CUSTOM_QUANTITY_VALUE : item.quantity}
      >
        {REMAINING_LEVELS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CUSTOM_QUANTITY_VALUE}>직접 입력</option>
      </select>
      {isCustom && (
        <div className="quantity-custom-input">
          <label className="sr-only" htmlFor={"quantity-" + item.id}>
            {item.name} 잔량 직접 입력
          </label>
          <input
            id={"quantity-" + item.id}
            maxLength={30}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Enter") {
                event.preventDefault()
                commitCustomQuantity()
              }
              if (event.key === "Escape") {
                setDraft(isPresetQuantity ? "" : item.quantity)
                if (isPresetQuantity) setIsCustom(false)
              }
            }}
            placeholder="예: 30%"
            ref={inputRef}
            type="text"
            value={draft}
          />
          <button
            disabled={!draft.trim() || draft.trim() === item.quantity}
            onClick={commitCustomQuantity}
            type="button"
          >
            적용
          </button>
        </div>
      )}
    </div>
  )
}

export default function InventoryPage({
  items,
  activeArea,
  isAdmin,
  syncStatus,
  dataSource,
  onAreaChange,
  onOpenSurvey,
  onSync,
  onSelect,
  onEdit,
}: InventoryPageProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortKey>("id")
  const [renderWindow, setRenderWindow] = useState({
    key: "",
    count: INITIAL_ROW_COUNT,
  })
  const loadMoreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setQuery("")
    setCategory("all")
    setStatus("all")
    setSort("id")
  }, [activeArea])

  const areaItems = useMemo(
    () =>
      activeArea === "전체"
        ? items
        : items.filter((item) => item.area === activeArea),
    [activeArea, items],
  )

  const categories = useMemo(() => {
    const counts = new Map<string, number>()

    areaItems.forEach((item) => {
      const value = categoryValue(item, activeArea)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    })

    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "ko-KR"))
  }, [activeArea, areaItems])

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR")

    return areaItems
      .filter((item) => {
        if (
          category !== "all" &&
          categoryValue(item, activeArea) !== category
        ) {
          return false
        }
        if (status === "toxic" && !item.toxic) return false
        if (status === "low" && !item.lowStock) return false
        return !normalizedQuery || item.searchText.includes(normalizedQuery)
      })
      .sort((a, b) => compareItems(a, b, sort))
  }, [activeArea, areaItems, category, query, sort, status])

  const renderKey = [activeArea, category, query, sort, status].join("\u0000")
  const renderCount =
    renderWindow.key === renderKey
      ? renderWindow.count
      : INITIAL_ROW_COUNT
  const renderedItems = visibleItems.slice(0, renderCount)
  const hasMore = renderedItems.length < visibleItems.length

  useEffect(() => {
    setRenderWindow({ key: renderKey, count: INITIAL_ROW_COUNT })
  }, [renderKey])

  const showMore = () => {
    setRenderWindow((current) => {
      const currentCount =
        current.key === renderKey ? current.count : INITIAL_ROW_COUNT

      return {
        key: renderKey,
        count: Math.min(
          currentCount + ROW_BATCH_SIZE,
          visibleItems.length,
        ),
      }
    })
  }

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || !("IntersectionObserver" in window)) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) showMore()
      },
      { rootMargin: "700px 0px" },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, renderKey, visibleItems.length])

  const reagentCount = items.filter((item) => item.type === "reagent").length
  const equipmentCount = items.length - reagentCount
  const alertCount = items.filter((item) => item.toxic || item.lowStock).length
  const showStatusFilter = activeArea === "시약" || activeArea === "전체"

  return (
    <main className="inventory-page" id="main-content">
      <div className="area-tabs-wrap">
        <nav className="area-tabs" aria-label="과학실 공간">
          {AREAS.map((area) => (
            <button
              className={activeArea === area ? "is-active" : ""}
              key={area}
              onClick={() => onAreaChange(area)}
              type="button"
            >
              {area}
            </button>
          ))}
        </nav>
      </div>

      <div className="inventory-shell">
        {activeArea === "시약" && (
          <nav
            aria-label="시약 분류표 메뉴"
            className="reagent-workspace-switch"
          >
            <button className="is-active" type="button">
              시약 분류표
            </button>
            <button onClick={onOpenSurvey} type="button">
              시약 조사
            </button>
          </nav>
        )}

        {isAdmin && (
          <section
            className="inventory-admin-summary"
            aria-label="관리자 재고 요약"
          >
            <div>
              <p className="eyebrow">Admin workspace</p>
              <h2>관리자 패널</h2>
              <span>
                Sheet 관리 품목의 기본 정보는 원본 시트에서 관리합니다.
              </span>
            </div>
            <div className="admin-metrics">
              {[
                ["전체", items.length],
                ["시약", reagentCount],
                ["기구", equipmentCount],
                ["점검", alertCount],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{Number(value).toLocaleString("ko-KR")}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="inventory-layout">
          <aside className="filter-sidebar">
            <section className="ios-card compact-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Summary</p>
                  <h2>{activeArea}</h2>
                </div>
                <button
                  className={`sync-button is-${syncStatus}`}
                  disabled={syncStatus === "syncing"}
                  onClick={onSync}
                  type="button"
                >
                  {syncStatus === "syncing" ? "동기화 중" : "새로고침"}
                </button>
              </div>
              <div className="stats-grid">
                <div>
                  <strong>{areaItems.length.toLocaleString("ko-KR")}</strong>
                  <span>전체 항목</span>
                </div>
                <div>
                  <strong>{categories.length.toLocaleString("ko-KR")}</strong>
                  <span>{activeArea === "전체" ? "공간" : "분류"}</span>
                </div>
                <div>
                  <strong>{visibleItems.length.toLocaleString("ko-KR")}</strong>
                  <span>검색 결과</span>
                </div>
                <div>
                  <strong>{alertCount.toLocaleString("ko-KR")}</strong>
                  <span>전체 점검</span>
                </div>
              </div>
              <div className={`source-pill is-${dataSource}`}>
                <i />
                {dataSource === "live"
                  ? "Google Sheets 연결됨"
                  : "내장 데이터 사용 중"}
              </div>
            </section>

            <section className="ios-card compact-card filter-card">
              <div className="filter-heading">
                <p className="eyebrow">
                  {activeArea === "전체" ? "Space" : "Category"}
                </p>
                {(category !== "all" || status !== "all") && (
                  <button
                    onClick={() => {
                      setCategory("all")
                      setStatus("all")
                    }}
                    type="button"
                  >
                    초기화
                  </button>
                )}
              </div>
              <div className="category-list">
                <button
                  className={category === "all" ? "is-active" : ""}
                  onClick={() => setCategory("all")}
                  type="button"
                >
                  <span>전체</span>
                  <strong>{areaItems.length.toLocaleString("ko-KR")}</strong>
                </button>
                {categories.map(([name, count]) => (
                  <button
                    className={category === name ? "is-active" : ""}
                    key={name}
                    onClick={() => setCategory(name)}
                    type="button"
                  >
                    <span>{name}</span>
                    <strong>{count.toLocaleString("ko-KR")}</strong>
                  </button>
                ))}
              </div>
            </section>

            {showStatusFilter && (
              <section className="ios-card compact-card filter-card">
                <p className="eyebrow">Status</p>
                <div className="status-filter">
                  {([
                    ["all", "전체"],
                    ["toxic", "유독물질"],
                    ["low", "잔량 부족"],
                  ] as Array<[StatusFilter, string]>).map(([value, label]) => (
                    <button
                      className={status === value ? "is-active" : ""}
                      key={value}
                      onClick={() => setStatus(value)}
                      type="button"
                    >
                      <i />
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </aside>

          <section className="inventory-content">
            <div className="inventory-toolbar">
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="물품명, 위치, 분류, 화학식 검색"
                  type="search"
                  value={query}
                />
                {query && (
                  <button
                    aria-label="검색어 지우기"
                    onClick={() => setQuery("")}
                    type="button"
                  >
                    ×
                  </button>
                )}
              </label>
              <div className="sort-control" aria-label="정렬 기준">
                {SORTS.map((option) => (
                  <button
                    className={sort === option.value ? "is-active" : ""}
                    key={option.value}
                    onClick={() => setSort(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="result-count">
              <strong>{visibleItems.length.toLocaleString("ko-KR")}</strong>개
              항목
            </p>

            <div
              className="inventory-list"
              role="table"
              aria-label="과학실 물품 목록"
              aria-rowcount={visibleItems.length + 1}
            >
              <div className="inventory-row inventory-row-head" role="row">
                <span>#</span>
                <span>공간 · 분류</span>
                <span>물품명 · 위치</span>
                <span>상세</span>
                <span>수량</span>
                <span>상태</span>
                <span />
              </div>

              {renderedItems.map((item, index) => {
                const editable = isAdmin && !item.googleSheetManaged
                const publicQuantityEditable = item.type === "reagent"

                return (
                  <div
                    aria-label={`${item.name} 상세 보기`}
                    className="inventory-row"
                    key={item.id}
                    onClick={(event) => {
                      if (
                        !(event.target as HTMLElement).closest(
                          "input, textarea, button, select",
                        )
                      ) {
                        onSelect(item)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onSelect(item)
                      }
                    }}
                    role="row"
                    tabIndex={0}
                  >
                    <span className="row-number">
                      {String(index + 1).padStart(3, "0")}
                    </span>
                    <span className="row-category">
                      <b>{item.area}</b>
                      {editable ? (
                        <EditableField
                          label={`${item.name} 분류`}
                          onCommit={(value) => onEdit(item, "category", value)}
                          value={item.category}
                        />
                      ) : (
                        <small>{item.category}</small>
                      )}
                    </span>
                    <span className="row-name">
                      {editable ? (
                        <>
                          <EditableField
                            label="물품명"
                            onCommit={(value) => onEdit(item, "name", value)}
                            value={item.name}
                          />
                          {item.type === "reagent" && (
                            <small className="row-name-english">
                              {item.detail}
                            </small>
                          )}
                          <EditableField
                            label={`${item.name} 위치`}
                            onCommit={(value) =>
                              onEdit(item, "location", value)
                            }
                            value={item.location}
                          />
                        </>
                      ) : (
                        <>
                          <strong>{item.name}</strong>
                          {item.type === "reagent" && (
                            <small className="row-name-english">
                              {item.detail}
                            </small>
                          )}
                          <small>{item.location}</small>
                        </>
                      )}
                    </span>
                    <span className="row-detail">
                      {editable ? (
                        <EditableField
                          label={`${item.name} 상세`}
                          multiline
                          onCommit={(value) => onEdit(item, "detail", value)}
                          value={item.detail}
                        />
                      ) : (
                        <>
                          {item.detail}
                          {item.formula !== "-" && (
                            <small>{item.formula}</small>
                          )}
                        </>
                      )}
                    </span>
                    <span className="row-quantity">
                      {publicQuantityEditable ? (
                        <QuantityField
                          item={item}
                          onCommit={(value) => onEdit(item, "quantity", value)}
                        />
                      ) : editable ? (
                        <EditableField
                          label={`${item.name} 수량`}
                          onCommit={(value) => onEdit(item, "quantity", value)}
                          value={item.quantity}
                        />
                      ) : (
                        item.quantity
                      )}
                    </span>
                    <span
                      className={`status-badge is-${getStatus(item)} ${
                        item.type === "equipment" ? "is-equipment" : ""
                      }`}
                    >
                      {getStatusLabel(item)}
                    </span>
                    <span className="row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <button
                className="inventory-load-more"
                onClick={showMore}
                ref={loadMoreRef}
                type="button"
              >
                <strong>{renderedItems.length.toLocaleString("ko-KR")}</strong>
                <span>/ {visibleItems.length.toLocaleString("ko-KR")}개 · 더 보기</span>
              </button>
            )}

            {!visibleItems.length && (
              <div className="empty-state">
                <strong>검색 결과가 없습니다.</strong>
                <span>검색어나 필터를 바꿔 보세요.</span>
                <button
                  onClick={() => {
                    setQuery("")
                    setCategory("all")
                    setStatus("all")
                  }}
                  type="button"
                >
                  필터 초기화
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
