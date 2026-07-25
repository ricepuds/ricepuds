export const SURVEY_SPREADSHEET_ID = "1RJDiRchlnAsGyUFCPn7PdFIuUBFMLvOQ"
export const SURVEY_GUIDE_SHEET = "조사 가이드"

export type GvizCellValue = string | number | boolean | null

export interface GvizColumn {
  id: string
  label: string
  type: string
}

export interface GvizRow {
  rowNumber: number
  values: readonly GvizCellValue[]
  formattedValues: readonly (string | null)[]
}

export interface GvizTab {
  spreadsheetId: string
  sheet: string
  columns: readonly GvizColumn[]
  rows: readonly GvizRow[]
}

export interface GvizTabRequest {
  sheet: string
  spreadsheetId?: string
  gid?: string
  range?: string
  headers?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SurveyGuideCard {
  id: string
  section: string
  title: string
  description: string
  note?: string
  sourceRow: number
}

export interface SurveyGuideSection {
  id: string
  title: string
  cards: readonly SurveyGuideCard[]
}

export interface SurveyGuide {
  title: string
  sourceSheet: string
  sections: readonly SurveyGuideSection[]
}

interface UnknownRecord {
  [key: string]: unknown
}

export class SurveySheetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SurveySheetError"
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeCellValue(
  value: unknown,
  formattedValue: unknown,
): GvizCellValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (value === null || value === undefined) {
    return null
  }

  return typeof formattedValue === "string" ? formattedValue : null
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start < 0 || end <= start) {
    throw new SurveySheetError("Google Sheets 응답 형식을 확인할 수 없습니다.")
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    throw new SurveySheetError("Google Sheets 응답을 해석하지 못했습니다.")
  }
}

function getGvizError(response: UnknownRecord): string {
  const errors = asArray(response.errors)

  for (const error of errors) {
    if (!isRecord(error)) {
      continue
    }

    const message =
      asText(error.detailed_message) ||
      asText(error.message) ||
      asText(error.reason)

    if (message) {
      return message
    }
  }

  return "Google Sheets가 요청을 처리하지 못했습니다."
}

function parseGvizTab(
  payload: unknown,
  request: Required<Pick<GvizTabRequest, "sheet" | "spreadsheetId" | "headers">>,
): GvizTab {
  if (!isRecord(payload)) {
    throw new SurveySheetError("Google Sheets 응답이 올바르지 않습니다.")
  }

  if (payload.status !== "ok") {
    throw new SurveySheetError(getGvizError(payload))
  }

  if (!isRecord(payload.table)) {
    throw new SurveySheetError("Google Sheets 표 데이터를 찾을 수 없습니다.")
  }

  const rawColumns = asArray(payload.table.cols)
  const rawRows = asArray(payload.table.rows)

  if (!rawColumns.length) {
    throw new SurveySheetError(`"${request.sheet}" 탭에 열이 없습니다.`)
  }

  const columns: GvizColumn[] = rawColumns.map((column, index) => {
    if (!isRecord(column)) {
      return { id: String(index), label: "", type: "string" }
    }

    return {
      id: asText(column.id) || String(index),
      label: asText(column.label),
      type: asText(column.type) || "string",
    }
  })

  const rows: GvizRow[] = rawRows.map((row, rowIndex) => {
    const rawCells = isRecord(row) ? asArray(row.c) : []
    const values: GvizCellValue[] = []
    const formattedValues: Array<string | null> = []

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const rawCell = rawCells[columnIndex]

      if (!isRecord(rawCell)) {
        values.push(null)
        formattedValues.push(null)
        continue
      }

      const formattedValue = typeof rawCell.f === "string" ? rawCell.f : null
      values.push(normalizeCellValue(rawCell.v, formattedValue))
      formattedValues.push(formattedValue)
    }

    return {
      rowNumber: request.headers + rowIndex + 1,
      values,
      formattedValues,
    }
  })

  return {
    spreadsheetId: request.spreadsheetId,
    sheet: request.sheet,
    columns,
    rows,
  }
}

export async function fetchPublicGvizTab(
  request: GvizTabRequest,
): Promise<GvizTab> {
  const spreadsheetId = request.spreadsheetId ?? SURVEY_SPREADSHEET_ID
  const headers = request.headers ?? 1
  const timeoutMs = request.timeoutMs ?? 15_000

  if (!request.sheet.trim()) {
    throw new SurveySheetError("불러올 Google Sheets 탭 이름이 필요합니다.")
  }

  if (!spreadsheetId.trim()) {
    throw new SurveySheetError("Google Spreadsheet ID가 필요합니다.")
  }

  const query = new URLSearchParams({
    tqx: "out:json",
    headers: String(headers),
    sheet: request.sheet,
    _: String(Date.now()),
  })

  if (request.gid) {
    query.set("gid", request.gid)
  }
  if (request.range) {
    query.set("range", request.range)
  }

  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(request.signal?.reason)
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  if (request.signal?.aborted) {
    abortFromCaller()
  } else {
    request.signal?.addEventListener("abort", abortFromCaller, { once: true })
  }

  try {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        spreadsheetId,
      )}/gviz/tq?${query.toString()}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      throw new SurveySheetError(
        `Google Sheets를 불러오지 못했습니다. (HTTP ${response.status})`,
      )
    }

    const payload = extractJson(await response.text())
    return parseGvizTab(payload, {
      sheet: request.sheet,
      spreadsheetId,
      headers,
    })
  } catch (error) {
    if (error instanceof SurveySheetError) {
      throw error
    }

    if (controller.signal.aborted) {
      if (request.signal?.aborted) {
        throw new DOMException("요청이 취소되었습니다.", "AbortError")
      }
      throw new SurveySheetError(
        `${Math.round(timeoutMs / 1000)}초 안에 Google Sheets가 응답하지 않았습니다.`,
      )
    }

    throw new SurveySheetError(
      error instanceof Error
        ? error.message
        : "Google Sheets를 불러오지 못했습니다.",
    )
  } finally {
    globalThis.clearTimeout(timeoutId)
    request.signal?.removeEventListener("abort", abortFromCaller)
  }
}

export function fetchSurveySheet(request: GvizTabRequest): Promise<GvizTab> {
  return fetchPublicGvizTab(request)
}

function cellText(row: GvizRow, index: number): string {
  const value = row.values[index]
  return value === null || value === undefined ? "" : String(value).trim()
}

function sectionTitle(value: string): string {
  return value.replace(/^★\s*/, "").trim()
}

export async function loadSurveyGuide(
  signal?: AbortSignal,
): Promise<SurveyGuide> {
  const tab = await fetchPublicGvizTab({
    sheet: SURVEY_GUIDE_SHEET,
    headers: 1,
    signal,
  })
  const sections: Array<{
    id: string
    title: string
    cards: SurveyGuideCard[]
  }> = []
  let currentSection: typeof sections[number] | null = null

  tab.rows.forEach((row) => {
    const title = cellText(row, 0)
    const description = cellText(row, 1)
    const note = cellText(row, 2)

    if (!title) {
      return
    }

    if ((!description && !note) || title.startsWith("★")) {
      currentSection = {
        id: `guide-section-${row.rowNumber}`,
        title: sectionTitle(title),
        cards: [],
      }
      sections.push(currentSection)
      return
    }

    if (!currentSection) {
      currentSection = {
        id: "guide-section-general",
        title: "조사 안내",
        cards: [],
      }
      sections.push(currentSection)
    }

    currentSection.cards.push({
      id: `guide-row-${row.rowNumber}`,
      section: currentSection.title,
      title,
      description,
      note: note || undefined,
      sourceRow: row.rowNumber,
    })
  })

  return {
    title: tab.columns[0]?.label || "조사 가이드 & 분류 기준",
    sourceSheet: tab.sheet,
    sections,
  }
}
