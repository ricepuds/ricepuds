import type {
  InventoryEdits,
  Notice,
  Reservation,
  ReservationBlock,
  ReservationStatus,
} from "./types"

type SupabaseClient = any

interface AuthSession {
  user?: {
    email?: string
  }
}

const SUPABASE_URL = "https://exgbktkirqnqyjvbwupp.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4Z2JrdGtpcnFucXlqdmJ3dXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM2OTksImV4cCI6MjA5NDQyOTY5OX0._Oposq5zl8n0O96qk9I1pgUPi6XeNEuMq_Hz8Bgh5kg"
export const ADMIN_EMAILS = [
  "rices2114@gmail.com",
  "2min095156@gmail.com",
  "stst5192@naver.com",
]

const RESERVATIONS_TABLE = "science_lab_reservations"
const RESERVATION_BLOCKS_TABLE = "science_lab_reservation_blocks"
const NOTICES_TABLE = "science_lab_notices"
const INVENTORY_EDITS_TABLE = "science_lab_inventory_edits"

let client: SupabaseClient | null | undefined

export function normalizeEmail(email: unknown): string {
  return String(email ?? "")
    .trim()
    .toLowerCase()
}

export function isAdminEmail(email: unknown): boolean {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client
  if (!window.supabase?.createClient) return null

  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })

  return client
}

function requiredClient(): SupabaseClient {
  const supabase = getSupabaseClient()

  if (!supabase) {
    throw new Error("Supabase 연결을 불러오지 못했습니다.")
  }

  return supabase
}

function throwIfError(error: unknown): void {
  if (error) throw error
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const supabase = getSupabaseClient()

  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()
  throwIfError(error)
  return data?.session as AuthSession | null ?? null
}

export function subscribeToAuth(
  callback: (session: AuthSession | null) => void,
): () => void {
  const supabase = getSupabaseClient()

  if (!supabase) return () => undefined

  const { data } = supabase.auth.onAuthStateChange(
    (_event: string, session: AuthSession | null) => callback(session),
  )

  return () => data?.subscription?.unsubscribe()
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requiredClient().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  })
  throwIfError(error)
}

export async function signUp(
  email: string,
  password: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email)
  const { data, error } = await requiredClient().auth.signUp({
    email: normalized,
    password,
    options: { data: { name: normalized.split("@")[0] } },
  })
  throwIfError(error)
  return Boolean(data?.session)
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  throwIfError(error)
}

export function getAuthErrorMessage(
  error: unknown,
  mode: "login" | "signup",
): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : ""
  const message = raw.toLowerCase()

  if (message.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다."
  }
  if (message.includes("email not confirmed")) {
    return "이메일 인증을 먼저 완료해 주세요."
  }
  if (
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "이미 가입된 이메일입니다. 로그인으로 들어가세요."
  }
  if (message.includes("rate limit")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
  }
  if (message.includes("supabase")) {
    return "계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
  }

  return (
    raw ||
    (mode === "signup" ? "회원가입에 실패했습니다." : "로그인에 실패했습니다.")
  )
}

export async function loadReservations(): Promise<Reservation[]> {
  const { data, error } = await requiredClient()
    .from(RESERVATIONS_TABLE)
    .select(
      "id, room, date, time, class_name, applicant_student_id, applicant_name, purpose, created_at, status, status_reason",
    )
    .order("created_at_sort", { ascending: false })
  throwIfError(error)

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    room: String(row.room),
    date: String(row.date),
    time: String(row.time),
    className: String(row.class_name ?? ""),
    applicantStudentId: String(row.applicant_student_id ?? ""),
    applicantName: String(row.applicant_name ?? ""),
    purpose: String(row.purpose ?? ""),
    createdAt: String(row.created_at ?? ""),
    status: normalizeReservationStatus(row.status),
    statusReason: String(row.status_reason ?? ""),
  }))
}

export async function createReservation(
  reservation: Reservation,
): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATIONS_TABLE)
    .insert({
      id: reservation.id,
      room: reservation.room,
      date: reservation.date,
      time: reservation.time,
      class_name: reservation.className,
      applicant_student_id: reservation.applicantStudentId,
      applicant_name: reservation.applicantName,
      purpose: reservation.purpose,
      created_at: reservation.createdAt,
      status: reservation.status,
      status_reason: reservation.statusReason || null,
    })
  throwIfError(error)
}

export async function updateReservation(
  id: string,
  status: Exclude<ReservationStatus, "pending">,
  statusReason = "",
): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATIONS_TABLE)
    .update({
      status,
      status_reason: status === "rejected" ? statusReason.trim() : null,
    })
    .eq("id", id)
  throwIfError(error)
}

export async function removeReservation(id: string): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATIONS_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

export async function removeAllReservations(): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATIONS_TABLE)
    .delete()
    .neq("id", "")
  throwIfError(error)
}

export async function loadReservationBlocks(): Promise<ReservationBlock[]> {
  const { data, error } = await requiredClient()
    .from(RESERVATION_BLOCKS_TABLE)
    .select("id, room, date, start_time, end_time, reason, created_at")
    .order("date", { ascending: true })
  throwIfError(error)

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    room: String(row.room),
    date: String(row.date),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    reason: String(row.reason ?? ""),
    createdAt: String(row.created_at ?? ""),
  }))
}

export async function createReservationBlock(
  block: ReservationBlock,
): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATION_BLOCKS_TABLE)
    .insert({
      id: block.id,
      room: block.room,
      date: block.date,
      start_time: block.startTime,
      end_time: block.endTime,
      reason: block.reason,
      created_at: block.createdAt,
    })
  throwIfError(error)
}

export async function removeReservationBlock(id: string): Promise<void> {
  const { error } = await requiredClient()
    .from(RESERVATION_BLOCKS_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

export async function loadNotices(): Promise<Notice[]> {
  const { data, error } = await requiredClient()
    .from(NOTICES_TABLE)
    .select("id, content, created_at")
    .order("created_at_sort", { ascending: false })
  throwIfError(error)

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    content: String(row.content),
    createdAt: String(row.created_at ?? ""),
  }))
}

export async function createNotice(notice: Notice): Promise<void> {
  const { error } = await requiredClient().from(NOTICES_TABLE).insert({
    id: notice.id,
    content: notice.content,
    created_at: notice.createdAt,
  })
  throwIfError(error)
}

export async function removeNotice(id: string): Promise<void> {
  const { error } = await requiredClient()
    .from(NOTICES_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

export async function loadInventoryEdits(): Promise<InventoryEdits> {
  const { data, error } = await requiredClient()
    .from(INVENTORY_EDITS_TABLE)
    .select("item_id, field_name, field_value")
  throwIfError(error)
  const edits: InventoryEdits = {}

  for (const row of data ?? []) {
    const itemId = String(row.item_id ?? "")
    const fieldName = String(
      row.field_name ?? "",
    ) as keyof InventoryEdits[string]

    if (
      !itemId ||
      !["category", "name", "detail", "quantity", "location"].includes(
        fieldName,
      )
    ) {
      continue
    }

    edits[itemId] = {
      ...edits[itemId],
      [fieldName]: String(row.field_value ?? ""),
    }
  }

  return edits
}

export async function saveInventoryEdit(
  itemId: string,
  fieldName: keyof InventoryEdits[string],
  fieldValue: string,
): Promise<void> {
  const { error } = await requiredClient().from(INVENTORY_EDITS_TABLE).upsert(
    {
      item_id: itemId,
      field_name: fieldName,
      field_value: fieldValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "item_id,field_name" },
  )
  throwIfError(error)
}

function normalizeReservationStatus(value: unknown): ReservationStatus {
  return value === "approved" || value === "rejected" ? value : "pending"
}
