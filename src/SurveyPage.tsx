import { useEffect, useId, useMemo, useState, type FormEvent } from "react"

import { loadSurveyGuide, type SurveyGuide } from "./survey"
import type { InventoryItem } from "./types"

export interface SurveyPageProps {
  items: InventoryItem[]
  onQuantityChange(itemId: string, quantity: string): boolean | Promise<boolean>
  onBack?(): void
}

type SurveyTab = "search" | "guide" | "waste"
type SaveFeedback = {
  tone: "success" | "error"
  text: string
}

interface WasteCategory {
  name: string
  symbol: string
  container: string
  neverMix: string
  badgeClass: string
  cardClass: string
}

interface SurveyTabDefinition {
  id: SurveyTab
  label: string
}

const SURVEY_TABS: ReadonlyArray<SurveyTabDefinition> = [
  { id: "search", label: "시약 찾기" },
  { id: "guide", label: "조사 가이드" },
  { id: "waste", label: "폐수 처리" },
]

const WASTE_CATEGORIES: readonly WasteCategory[] = [
  {
    name: "산성 폐액",
    symbol: "산",
    container: "교사가 지정한 ‘산성 폐액’ 전용 용기에만 배출합니다.",
    neverMix: "염기성 폐액, 유기용매, 산화제와 절대 혼합하지 않습니다.",
    badgeClass: "bg-rose-100 text-rose-700",
    cardClass: "border-rose-200 bg-rose-50/80",
  },
  {
    name: "염기성 폐액",
    symbol: "염기",
    container: "교사가 지정한 ‘염기성 폐액’ 전용 용기에만 배출합니다.",
    neverMix: "산성 폐액, 유기용매, 금속성 폐액과 절대 혼합하지 않습니다.",
    badgeClass: "bg-sky-100 text-sky-700",
    cardClass: "border-sky-200 bg-sky-50/80",
  },
  {
    name: "유기용매 폐액",
    symbol: "유기",
    container:
      "할로젠계·비할로젠계 등 교사가 지정한 종류별 전용 용기를 확인합니다.",
    neverMix: "산·염기·산화제 및 서로 다른 용매 계열을 임의로 섞지 않습니다.",
    badgeClass: "bg-amber-100 text-amber-800",
    cardClass: "border-amber-200 bg-amber-50/80",
  },
  {
    name: "중금속 폐액",
    symbol: "금속",
    container: "납·크롬·수은·카드뮴 등 중금속 전용 폐액 용기에 따로 모읍니다.",
    neverMix: "일반 무기 폐액이나 하수구에 버리지 않고 다른 폐액과 분리합니다.",
    badgeClass: "bg-violet-100 text-violet-700",
    cardClass: "border-violet-200 bg-violet-50/80",
  },
  {
    name: "산화제 폐액",
    symbol: "산화",
    container: "산화제 표시가 있는 전용 용기를 교사와 함께 확인합니다.",
    neverMix: "유기용매·가연물·환원제와 접촉하거나 혼합하지 않습니다.",
    badgeClass: "bg-orange-100 text-orange-700",
    cardClass: "border-orange-200 bg-orange-50/80",
  },
  {
    name: "미확인 폐액",
    symbol: "?",
    container:
      "붓거나 옮기지 말고 현재 용기 그대로 격리한 뒤 즉시 교사에게 알립니다.",
    neverMix:
      "성분을 추측해 분류하거나 냄새 맡기·중화·혼합을 시도하지 않습니다.",
    badgeClass: "bg-slate-200 text-slate-700",
    cardClass: "border-slate-300 bg-slate-100/80",
  },
]

const GUIDE_TONES = [
  "border-blue-200 bg-blue-50/80 text-blue-700",
  "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  "border-orange-200 bg-orange-50/80 text-orange-700",
  "border-violet-200 bg-violet-50/80 text-violet-700",
] as const

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").trim()
}

function matchesSearch(item: InventoryItem, query: string): boolean {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean)

  if (!tokens.length) {
    return true
  }

  const searchable = normalizeSearch(
    [item.name, item.formula, item.aliases, item.location].join(" "),
  )
  return tokens.every((token) => searchable.includes(token))
}

function statusLabel(item: InventoryItem): string {
  if (item.toxic) {
    return "유독물질"
  }
  if (item.lowStock) {
    return "잔량 부족"
  }
  return "확인 완료"
}

function statusClass(item: InventoryItem): string {
  if (item.toxic) {
    return "bg-red-100 text-red-700"
  }
  if (item.lowStock) {
    return "bg-orange-100 text-orange-700"
  }
  return "bg-emerald-100 text-emerald-700"
}

export default function SurveyPage({
  items,
  onQuantityChange,
  onBack,
}: SurveyPageProps) {
  const tabId = useId()
  const [activeTab, setActiveTab] = useState<SurveyTab>("search")
  const [query, setQuery] = useState("")
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [quantityDraft, setQuantityDraft] = useState("")
  const [isSavingQuantity, setIsSavingQuantity] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null)
  const [guide, setGuide] = useState<SurveyGuide | null>(null)
  const [guideError, setGuideError] = useState("")
  const [isGuideLoading, setIsGuideLoading] = useState(true)
  const [guideRequestKey, setGuideRequestKey] = useState(0)

  const reagents = useMemo(
    () =>
      items
        .filter((item) => item.type === "reagent")
        .sort((first, second) =>
          first.name.localeCompare(second.name, "ko-KR"),
        ),
    [items],
  )
  const searchResults = useMemo(
    () => reagents.filter((item) => matchesSearch(item, query)),
    [query, reagents],
  )
  const selectedItem =
    selectedItemId === null
      ? undefined
      : reagents.find((item) => item.id === selectedItemId)

  useEffect(() => {
    if (selectedItem) {
      setQuantityDraft(selectedItem.quantity)
    }
  }, [selectedItem])

  useEffect(() => {
    const controller = new AbortController()

    setIsGuideLoading(true)
    setGuideError("")

    void loadSurveyGuide(controller.signal)
      .then((nextGuide) => {
        setGuide(nextGuide)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setGuideError(
          error instanceof Error
            ? error.message
            : "조사 가이드를 불러오지 못했습니다.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsGuideLoading(false)
        }
      })

    return () => controller.abort()
  }, [guideRequestKey])

  const selectItem = (item: InventoryItem) => {
    setSelectedItemId(item.id)
    setQuantityDraft(item.quantity)
    setSaveFeedback(null)
  }

  const handleQuantitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedItem) {
      return
    }

    const nextQuantity = quantityDraft.trim()

    if (!nextQuantity) {
      setSaveFeedback({
        tone: "error",
        text: "확인한 잔량을 입력해 주세요.",
      })
      return
    }

    if (nextQuantity === selectedItem.quantity) {
      setSaveFeedback({
        tone: "success",
        text: "현재 기록과 같은 잔량입니다.",
      })
      return
    }

    setIsSavingQuantity(true)
    setSaveFeedback(null)

    try {
      const saved = await onQuantityChange(selectedItem.id, nextQuantity)

      setSaveFeedback(
        saved
          ? { tone: "success", text: "잔량 확인 내용을 저장했습니다." }
          : {
              tone: "error",
              text: "잔량을 저장하지 못했습니다. 다시 시도해 주세요.",
            },
      )
    } catch {
      setSaveFeedback({
        tone: "error",
        text: "잔량 저장 중 오류가 발생했습니다. 다시 시도해 주세요.",
      })
    } finally {
      setIsSavingQuantity(false)
    }
  }

  return (
    <div className="survey-page min-h-[100dvh] bg-[#f2f2f7] pt-14 text-[#1c1c1e]">
      <header className="sticky top-14 z-30 border-b border-black/5 bg-[#f2f2f7]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 [padding-top:max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[15px] font-semibold text-[#007aff] transition active:scale-95"
                onClick={onBack}
              >
                <span
                  aria-hidden="true"
                  className="text-3xl font-light leading-none"
                >
                  ‹
                </span>
                <span className="hidden sm:inline">뒤로</span>
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-[#8e8e93]">
                Science Lab Survey
              </p>
              <h1 className="truncate text-xl font-bold tracking-[-0.025em]">
                시약 조사
              </h1>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#34c759] shadow-sm ring-1 ring-black/5">
            학생용
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8">
        <section className="mb-5 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#007aff] to-[#5856d6] px-5 py-6 text-white shadow-[0_18px_50px_rgba(0,80,200,0.22)] sm:px-7 sm:py-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
            오늘의 조사
          </p>
          <h2 className="max-w-xl text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
            라벨을 읽고, 위치를 확인하고,
            <br />
            잔량만 정확히 기록해요.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
            시약병은 열거나 냄새 맡지 않습니다. 모르는 시약과 폐액은 그대로 두고
            선생님께 알려주세요.
          </p>
        </section>

        <div
          className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-black/[0.06] p-1"
          role="tablist"
          aria-label="시약 조사 메뉴"
        >
          {SURVEY_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`${tabId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tabId}-${tab.id}-panel`}
              className={`min-h-10 rounded-xl px-2 text-[13px] font-semibold transition sm:text-sm ${
                activeTab === tab.id
                  ? "bg-white text-[#1c1c1e] shadow-sm"
                  : "text-[#636366] hover:text-[#1c1c1e]"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "search" ? (
          <section
            id={`${tabId}-search-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-search-tab`}
            className="space-y-4"
          >
            <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
              <label className="block" htmlFor={`${tabId}-reagent-search`}>
                <span className="mb-2 block text-sm font-bold text-[#3a3a3c]">
                  시약 검색
                </span>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#8e8e93]"
                  >
                    ⌕
                  </span>
                  <input
                    id={`${tabId}-reagent-search`}
                    type="search"
                    value={query}
                    placeholder="이름, 화학식, 이명, 위치"
                    autoComplete="off"
                    className="min-h-12 w-full rounded-2xl border-0 bg-[#f2f2f7] py-3 pl-11 pr-11 text-base outline-none ring-[#007aff]/20 transition placeholder:text-[#8e8e93] focus:ring-4"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label="검색어 지우기"
                      className="absolute inset-y-0 right-3 my-auto h-7 w-7 rounded-full bg-[#c7c7cc] text-sm font-bold text-white transition active:scale-90"
                      onClick={() => setQuery("")}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              </label>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-[#8e8e93]">
                <span>공백으로 여러 검색어를 함께 입력할 수 있어요.</span>
                <span aria-live="polite">{searchResults.length}개</span>
              </div>
            </div>

            {selectedItem ? (
              <article className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-black/5">
                <header className="flex items-start justify-between gap-4 border-b border-black/[0.06] p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#007aff]">
                      선택한 시약
                    </p>
                    <h3 className="mt-1 break-keep text-xl font-bold tracking-[-0.025em]">
                      {selectedItem.name}
                    </h3>
                    <p className="mt-1 font-mono text-sm text-[#636366]">
                      {selectedItem.formula || "화학식 미기록"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="선택한 시약 상세 닫기"
                    className="h-8 w-8 shrink-0 rounded-full bg-[#f2f2f7] text-lg font-medium text-[#636366] transition active:scale-90"
                    onClick={() => {
                      setSelectedItemId(null)
                      setSaveFeedback(null)
                    }}
                  >
                    ×
                  </button>
                </header>

                <div className="grid gap-px bg-black/[0.06] sm:grid-cols-2">
                  {[
                    ["분류", selectedItem.category],
                    ["보관 위치", selectedItem.location],
                    [
                      "이명",
                      selectedItem.aliases || selectedItem.detail || "미기록",
                    ],
                    ["현재 잔량", selectedItem.quantity],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white px-5 py-4">
                      <dt className="text-xs font-semibold text-[#8e8e93]">
                        {label}
                      </dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-[#1c1c1e]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </div>

                <div className="p-5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(
                      selectedItem,
                    )}`}
                  >
                    {statusLabel(selectedItem)}
                  </span>

                  <form
                    className="mt-4"
                    onSubmit={(event) => void handleQuantitySubmit(event)}
                  >
                    <label htmlFor={`${tabId}-quantity`}>
                      <span className="mb-2 block text-sm font-bold">
                        확인한 잔량
                      </span>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          id={`${tabId}-quantity`}
                          type="text"
                          required
                          maxLength={40}
                          value={quantityDraft}
                          placeholder="예: 절반, 소량(25%미만), 250 mL"
                          className="min-h-12 min-w-0 flex-1 rounded-2xl border-0 bg-[#f2f2f7] px-4 text-base outline-none ring-[#007aff]/20 transition focus:ring-4"
                          onChange={(event) => {
                            setQuantityDraft(event.target.value)
                            setSaveFeedback(null)
                          }}
                        />
                        <button
                          type="submit"
                          disabled={isSavingQuantity}
                          className="min-h-12 rounded-2xl bg-[#007aff] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,122,255,0.24)] transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                        >
                          {isSavingQuantity ? "저장 중…" : "잔량 저장"}
                        </button>
                      </div>
                    </label>
                    {saveFeedback ? (
                      <p
                        className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                          saveFeedback.tone === "success"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                        role={
                          saveFeedback.tone === "error" ? "alert" : "status"
                        }
                      >
                        {saveFeedback.text}
                      </p>
                    ) : null}
                  </form>
                </div>
              </article>
            ) : null}

            <div className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
                <h3 className="text-base font-bold">검색 결과</h3>
                <span className="text-xs font-semibold text-[#8e8e93]">
                  시약 {reagents.length}개 중
                </span>
              </div>

              {searchResults.length ? (
                <div className="divide-y divide-black/[0.06]">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selectedItemId === item.id}
                      className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#f9f9fb] active:bg-[#f2f2f7] ${
                        selectedItemId === item.id ? "bg-blue-50/70" : ""
                      }`}
                      onClick={() => selectItem(item)}
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-[15px]">
                          {item.name}
                        </strong>
                        <small className="mt-1 block truncate text-xs text-[#8e8e93]">
                          {item.formula || "화학식 미기록"} · {item.location}
                        </small>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.toxic || item.lowStock ? (
                          <span
                            role="img"
                            className={`h-2 w-2 rounded-full ${
                              item.toxic ? "bg-red-500" : "bg-orange-500"
                            }`}
                            aria-label={statusLabel(item)}
                          />
                        ) : null}
                        <span
                          aria-hidden="true"
                          className="text-xl text-[#c7c7cc]"
                        >
                          ›
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div
                    aria-hidden="true"
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f2f7] text-xl text-[#8e8e93]"
                  >
                    ⌕
                  </div>
                  <p className="mt-3 text-sm font-bold">
                    검색 결과가 없습니다.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#8e8e93]">
                    라벨의 다른 이름이나 선반 번호로 다시 찾아보세요.
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "guide" ? (
          <section
            id={`${tabId}-guide-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-guide-tab`}
            aria-busy={isGuideLoading}
            className="space-y-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#34c759]">
                  Live Guide
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-[-0.03em]">
                  {guide?.title || "조사 가이드"}
                </h2>
              </div>
              {guide ? (
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#636366] shadow-sm ring-1 ring-black/5">
                  Google Sheets · {guide.sourceSheet}
                </span>
              ) : null}
            </div>

            {isGuideLoading ? (
              <div
                className="rounded-[24px] bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/5"
                role="status"
              >
                <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-[#007aff]/20 border-t-[#007aff]" />
                <p className="mt-4 text-sm font-semibold text-[#636366]">
                  최신 조사 가이드를 불러오는 중…
                </p>
              </div>
            ) : null}

            {!isGuideLoading && guideError ? (
              <div
                className="rounded-[24px] border border-red-200 bg-red-50 p-5"
                role="alert"
              >
                <h3 className="font-bold text-red-800">
                  조사 가이드를 불러오지 못했습니다.
                </h3>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  {guideError}
                </p>
                <button
                  type="button"
                  className="mt-4 min-h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition active:scale-[0.98]"
                  onClick={() => setGuideRequestKey((current) => current + 1)}
                >
                  다시 불러오기
                </button>
              </div>
            ) : null}

            {!isGuideLoading && guide && !guide.sections.length ? (
              <div className="rounded-[24px] bg-white px-6 py-14 text-center shadow-sm ring-1 ring-black/5">
                <p className="font-bold">등록된 조사 가이드가 없습니다.</p>
                <p className="mt-1 text-sm text-[#8e8e93]">
                  Google Sheets의 ‘조사 가이드’ 탭을 확인해 주세요.
                </p>
              </div>
            ) : null}

            {!isGuideLoading
              ? guide?.sections.map((section, sectionIndex) => (
                  <section key={section.id}>
                    <div
                      className={`mb-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${
                        GUIDE_TONES[sectionIndex % GUIDE_TONES.length]
                      }`}
                    >
                      {section.title}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {section.cards.map((card) => (
                        <article
                          key={card.id}
                          className="rounded-[22px] bg-white p-5 shadow-sm ring-1 ring-black/5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="break-keep text-base font-bold tracking-[-0.015em]">
                              {card.title}
                            </h3>
                            <span className="shrink-0 text-[10px] font-semibold text-[#aeaeb2]">
                              {card.sourceRow}행
                            </span>
                          </div>
                          <p className="mt-2 break-keep text-sm leading-6 text-[#48484a]">
                            {card.description}
                          </p>
                          {card.note ? (
                            <p className="mt-3 rounded-xl bg-[#f2f2f7] px-3 py-2 text-xs font-bold leading-5 text-[#3a3a3c]">
                              {card.note}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              : null}
          </section>
        ) : null}

        {activeTab === "waste" ? (
          <section
            id={`${tabId}-waste-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-waste-tab`}
            className="space-y-5"
          >
            <div className="rounded-[26px] border border-red-200 bg-red-50 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-xl font-black text-white"
                >
                  !
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-red-600">
                    절대 혼합 금지
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-red-950">
                    교사 확인 전에는 폐액을 붓지 마세요.
                  </h2>
                  <p className="mt-2 break-keep text-sm leading-6 text-red-800">
                    용기 라벨, 폐액 종류, 서로 섞어도 되는지를 선생님과 함께
                    확인한 뒤 지정된 용기에만 배출합니다. 학생이 임의로
                    중화하거나 희석하지 않습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {WASTE_CATEGORIES.map((category) => (
                <article
                  key={category.name}
                  className={`rounded-[22px] border p-5 ${category.cardClass}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex min-h-10 min-w-10 items-center justify-center rounded-xl px-2 text-xs font-black ${category.badgeClass}`}
                    >
                      {category.symbol}
                    </span>
                    <h3 className="text-base font-bold">{category.name}</h3>
                  </div>
                  <p className="mt-4 text-sm font-semibold leading-6 text-[#3a3a3c]">
                    {category.container}
                  </p>
                  <p className="mt-3 rounded-xl bg-white/75 px-3 py-2.5 text-xs font-bold leading-5 text-red-700 ring-1 ring-black/5">
                    혼합 금지 · {category.neverMix}
                  </p>
                </article>
              ))}
            </div>

            <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#007aff]">
                Teacher Check
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-[-0.025em]">
                배출 전 3단계 교사 확인
              </h2>
              <ol className="mt-5 space-y-4">
                {[
                  [
                    "1",
                    "폐액 이름 확인",
                    "사용한 시약과 반응 결과를 선생님께 정확히 말합니다.",
                  ],
                  [
                    "2",
                    "전용 용기 확인",
                    "용기 라벨과 남은 용량을 선생님과 함께 확인합니다.",
                  ],
                  [
                    "3",
                    "배출 허락 받기",
                    "선생님이 허락한 뒤 천천히 배출하고 뚜껑을 닫습니다.",
                  ],
                ].map(([number, title, description]) => (
                  <li key={number} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#007aff] text-xs font-bold text-white">
                      {number}
                    </span>
                    <div>
                      <strong className="text-sm">{title}</strong>
                      <p className="mt-0.5 text-sm leading-6 text-[#636366]">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="rounded-[22px] bg-[#1c1c1e] p-5 text-white">
              <p className="font-bold">쏟았거나 정체를 모르겠다면</p>
              <p className="mt-1 text-sm leading-6 text-white/75">
                만지거나 닦지 말고 주변 친구가 가까이 오지 않게 한 뒤 즉시
                선생님께 알립니다.
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
