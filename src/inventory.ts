import { LAB_ITEMS } from "./data/lab-items"
import { REAGENTS } from "./data/reagents"
import type { InventoryEdits, InventoryItem, LabArea } from "./types"

type UnknownRow = Record<string, unknown>

interface LegacyReagent {
  id?: number | string
  category?: string
  name?: string
  iupac?: string
  commonName?: string
  formula?: string
  structuralFormula?: string
  initialAmount?: number | string
  remainingAmount?: number | string
  remaining?: string
  location?: string
  toxic?: boolean
  lowStock?: boolean
  lowStockMode?: "bucket"
  aliases?: string
  searchKey?: string
  sourceSheet?: string
  sourceCell?: string
}

interface LegacyLabItem {
  id?: string
  area?: string
  category?: string
  name?: string
  quantity?: string
  location?: string
  sourceSheet?: string
  sourceCell?: string
}

interface SheetSource {
  spreadsheetId: string
  gid?: string
  sheet?: string
  range?: string
}

export interface InventorySnapshot {
  reagents: LegacyReagent[]
  labItems: LegacyLabItem[]
  failedSheets: string[]
}

const REAGENT_SHEET = "시약 조사표"
const LAB_ITEM_SHEET = "기구 목록"
const LOW_STOCK_BUCKETS = new Set(["소진", "거의없음", "소량(25%미만)"])
const VALID_LAB_AREAS = new Set<LabArea>(["화학실", "생명실", "준비실"])

const SHEET_SOURCES: Record<string, SheetSource> = {
  [REAGENT_SHEET]: {
    spreadsheetId: "1RJDiRchlnAsGyUFCPn7PdFIuUBFMLvOQ",
    gid: "1516027442",
    range: "A4:T",
  },
  [LAB_ITEM_SHEET]: {
    spreadsheetId: "1nO8D8ZLlhcTiotgSYqHhy2-I9ikcmm_DXFy0YTlUZv8",
    sheet: LAB_ITEM_SHEET,
  },
}

const REQUIRED_HEADERS: Record<string, string[]> = {
  [REAGENT_SHEET]: [
    "번호",
    "화학식",
    "한글명",
    "영문명",
    "수량",
    "단위",
    "상태",
    "잔량",
    "위험 분류",
    "분류(보관그룹)",
    "보관 위치",
  ],
  [LAB_ITEM_SHEET]: ["아이디", "공간", "분류", "물품명", "갯수/잔량", "위치"],
}

export const STATIC_REAGENTS = REAGENTS as unknown as LegacyReagent[]
export const STATIC_LAB_ITEMS = LAB_ITEMS as unknown as LegacyLabItem[]

export function normalizeText(value: unknown): string {
  return String(value ?? "").trim()
}

function formatNumber(value: unknown): string {
  if (value === "" || value === null || Number.isNaN(Number(value))) {
    return "-"
  }

  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

function isLowStock(reagent: LegacyReagent): boolean {
  if (reagent.lowStockMode === "bucket") {
    return LOW_STOCK_BUCKETS.has(normalizeText(reagent.remaining))
  }

  if (reagent.lowStock) {
    return true
  }

  const initial = Number(reagent.initialAmount)
  const remaining = Number(reagent.remainingAmount)

  if (!Number.isFinite(remaining)) {
    return false
  }

  return (
    (Number.isFinite(initial) && initial > 0 && remaining / initial <= 0.2) ||
    (remaining > 0 && remaining <= 50)
  )
}

function inventorySearchText(item: Omit<InventoryItem, "searchText">): string {
  return [
    item.id,
    item.area,
    item.category,
    item.name,
    item.detail,
    item.formula,
    item.aliases,
    item.sheetSearchKey,
    item.quantity,
    item.location,
    item.sourceSheet,
    item.sourceCell,
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
}

function withSearchText(
  item: Omit<InventoryItem, "searchText">,
): InventoryItem {
  return { ...item, searchText: inventorySearchText(item) }
}

export function buildInventoryItems(
  reagents: LegacyReagent[] = STATIC_REAGENTS,
  labItems: LegacyLabItem[] = STATIC_LAB_ITEMS,
  edits: InventoryEdits = {},
): InventoryItem[] {
  const reagentItems = reagents.map((reagent, index) => {
    const numericId = Number(reagent.id) || index + 1
    const sourceSheet = normalizeText(reagent.sourceSheet) || undefined
    const baseItem = {
      id: `시약-${String(numericId).padStart(3, "0")}`,
      numericId,
      type: "reagent" as const,
      area: "시약" as const,
      category: normalizeText(reagent.category) || "분류 없음",
      name: normalizeText(reagent.name) || "이름 없음",
      detail:
        normalizeText(reagent.iupac) ||
        normalizeText(reagent.commonName) ||
        "시약 정보 없음",
      formula:
        normalizeText(reagent.formula) ||
        normalizeText(reagent.structuralFormula) ||
        "-",
      quantity:
        normalizeText(reagent.remaining) ||
        formatNumber(reagent.remainingAmount),
      location: normalizeText(reagent.location) || "시약장",
      toxic: Boolean(reagent.toxic),
      lowStock: isLowStock(reagent),
      sourceSheet,
      sourceCell: normalizeText(reagent.sourceCell) || undefined,
      aliases: normalizeText(reagent.aliases) || undefined,
      sheetSearchKey: normalizeText(reagent.searchKey) || undefined,
      googleSheetManaged: sourceSheet === REAGENT_SHEET,
    }
    const storedEdits = edits[baseItem.id]
    const itemEdits = baseItem.googleSheetManaged
      ? storedEdits?.quantity
        ? { quantity: storedEdits.quantity }
        : undefined
      : storedEdits
    const editedItem = itemEdits
      ? {
          ...baseItem,
          ...itemEdits,
          lowStock: itemEdits.quantity
            ? LOW_STOCK_BUCKETS.has(normalizeText(itemEdits.quantity))
            : baseItem.lowStock,
        }
      : baseItem

    return withSearchText(editedItem)
  })

  const equipmentItems = labItems.flatMap((labItem, index) => {
    const area = normalizeText(labItem.area)

    if (!VALID_LAB_AREAS.has(area as LabArea)) {
      return []
    }

    const sourceSheet = normalizeText(labItem.sourceSheet) || undefined
    const rawId = normalizeText(labItem.id)
    const id =
      sourceSheet === LAB_ITEM_SHEET && rawId
        ? rawId
        : `${area}-${String(index + 1).padStart(3, "0")}`
    const baseItem = {
      id,
      numericId: 10000 + index + 1,
      type: "equipment" as const,
      area: area as LabArea,
      category: normalizeText(labItem.category) || "위치 미정",
      name: normalizeText(labItem.name) || "이름 없음",
      detail: normalizeText(labItem.location) || "상세 정보 없음",
      formula: "-",
      quantity: normalizeText(labItem.quantity) || "-",
      location: normalizeText(labItem.location) || "위치 미정",
      toxic: false,
      lowStock: false,
      sourceSheet,
      sourceCell: normalizeText(labItem.sourceCell) || undefined,
      googleSheetManaged: sourceSheet === LAB_ITEM_SHEET,
    }
    const storedEdits = edits[id]
    const itemEdits = baseItem.googleSheetManaged
      ? storedEdits?.quantity
        ? { quantity: storedEdits.quantity }
        : undefined
      : storedEdits
    const editedItem = itemEdits ? { ...baseItem, ...itemEdits } : baseItem

    return [withSearchText(editedItem)]
  })

  return [...reagentItems, ...equipmentItems]
}

async function fetchSheetData(sheetName: string): Promise<UnknownRow[]> {
  const source = SHEET_SOURCES[sheetName]

  if (!source) {
    throw new Error(`Google Sheets 원본을 찾을 수 없습니다: ${sheetName}`)
  }

  const query = new URLSearchParams({
    tqx: "out:json",
    headers: "1",
    _: String(Date.now()),
  })

  if (source.gid) query.set("gid", source.gid)
  if (source.sheet) query.set("sheet", source.sheet)
  if (source.range) query.set("range", source.range)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/gviz/tq?${query.toString()}`,
      { cache: "no-store", signal: controller.signal },
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const text = await response.text()
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")

    if (start < 0 || end <= start) {
      throw new Error("Google Sheets 응답 형식을 확인할 수 없습니다.")
    }

    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      table?: {
        cols?: Array<{ label?: unknown }>
        rows?: Array<{ c?: Array<{ v?: unknown } | null> }>
      }
    }
    const columns = parsed.table?.cols

    if (!Array.isArray(columns)) {
      throw new Error("Google Sheets 표 데이터를 찾을 수 없습니다.")
    }

    const headers = columns.map((column) => normalizeText(column.label))
    const missingHeaders = (REQUIRED_HEADERS[sheetName] ?? []).filter(
      (header) => !headers.includes(header),
    )

    if (missingHeaders.length) {
      throw new Error(`필수 열이 없습니다: ${missingHeaders.join(", ")}`)
    }

    return (parsed.table?.rows ?? []).map((row) => {
      const result: UnknownRow = {}
      const cells = Array.isArray(row.c) ? row.c : []

      cells.forEach((cell, index) => {
        if (headers[index]) result[headers[index]] = cell?.v ?? ""
      })

      return result
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

function mapReagentRows(rows: UnknownRow[]): LegacyReagent[] {
  return rows
    .map((row, index) => {
      const nameKr = normalizeText(row["한글명"])
      const nameEn = normalizeText(row["영문명"])
      const aliases = normalizeText(row["이명/다른표기"])
      const storageGroup = normalizeText(
        row["분류(보관그룹)"] ?? row["분류(보관 그룹)"],
      )
      const hazard = normalizeText(row["위험 분류"])
      const remaining = normalizeText(row["잔량"])
      const toxic = storageGroup === "독성물질" || hazard.includes("독성")

      return {
        id: normalizeText(row["번호"]) || index + 1,
        name: nameKr || nameEn,
        iupac: nameEn,
        commonName: aliases || nameKr,
        aliases,
        formula: normalizeText(row["화학식"]),
        category:
          storageGroup ||
          hazard ||
          normalizeText(row["조사구분"]) ||
          "분류 없음",
        remaining,
        remainingAmount: row["수량"] as number | string,
        location: normalizeText(row["보관 위치"]),
        toxic,
        lowStock: LOW_STOCK_BUCKETS.has(remaining),
        lowStockMode: "bucket" as const,
        searchKey: normalizeText(row["검색키"]),
        sourceSheet: REAGENT_SHEET,
        sourceCell: `A${index + 5}:T${index + 5}`,
      }
    })
    .filter((reagent) => Boolean(reagent.name))
}

function mapLabItemRows(rows: UnknownRow[]): LegacyLabItem[] {
  const seenIds = new Set<string>()

  return rows.flatMap((row, index) => {
    const id = normalizeText(row["아이디"])
    const hasValue = [
      id,
      row["공간"],
      row["분류"],
      row["물품명"],
      row["갯수/잔량"],
      row["위치"],
    ].some((value) => Boolean(normalizeText(value)))

    if (!hasValue) return []
    if (!id)
      throw new Error(`기구 목록 ${index + 2}행의 아이디가 비어 있습니다.`)
    if (seenIds.has(id))
      throw new Error(`기구 목록에 중복 아이디가 있습니다: ${id}`)

    seenIds.add(id)
    return [
      {
        id,
        area: normalizeText(row["공간"]),
        category: normalizeText(row["분류"]),
        name: normalizeText(row["물품명"]),
        quantity: normalizeText(row["갯수/잔량"]),
        location: normalizeText(row["위치"]),
        sourceSheet: LAB_ITEM_SHEET,
        sourceCell: `A${index + 2}:F${index + 2}`,
      },
    ]
  })
}

export async function loadLiveInventory(): Promise<InventorySnapshot> {
  const [reagentResult, labItemResult] = await Promise.allSettled([
    fetchSheetData(REAGENT_SHEET),
    fetchSheetData(LAB_ITEM_SHEET),
  ])
  const failedSheets: string[] = []
  let reagents = STATIC_REAGENTS
  let labItems = STATIC_LAB_ITEMS

  if (reagentResult.status === "fulfilled") {
    try {
      reagents = mapReagentRows(reagentResult.value)
    } catch {
      failedSheets.push(REAGENT_SHEET)
    }
  } else {
    failedSheets.push(REAGENT_SHEET)
  }

  if (labItemResult.status === "fulfilled") {
    try {
      labItems = mapLabItemRows(labItemResult.value)
    } catch {
      failedSheets.push(LAB_ITEM_SHEET)
    }
  } else {
    failedSheets.push(LAB_ITEM_SHEET)
  }

  return { reagents, labItems, failedSheets }
}
