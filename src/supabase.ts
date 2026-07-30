import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AuthUser,
  InventoryEdits,
  Notice,
  QuestionAnswer,
  QuestionPost,
  Reservation,
  ReservationBlock,
  ReservationStatus,
} from "./types"

export interface AuthSession {
  user?: {
    id?: string
    email?: string
    user_metadata?: Record<string, unknown>
  }
}

interface UserProfile {
  name: string
  canChangeName: boolean
}

export interface SignInResult {
  nameWasSet: boolean
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
const PROFILES_TABLE = "science_lab_profiles"
const QUESTIONS_TABLE = "science_lab_questions"
const ANSWERS_TABLE = "science_lab_answers"
const SET_PROFILE_NAME_RPC = "set_my_science_lab_name"
const QUESTION_AUTHORS_RPC = "get_science_lab_question_authors"

let clientPromise: Promise<SupabaseClient> | null = null

export function normalizeEmail(email: unknown): string {
  return String(email ?? "")
    .trim()
    .toLowerCase()
}

export function isAdminEmail(email: unknown): boolean {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function normalizeDisplayName(name: unknown): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
}

function metadataName(session: AuthSession | null): string {
  const name = normalizeDisplayName(session?.user?.user_metadata?.name)
  if (name) return name.slice(0, 40)
  const email = normalizeEmail(session?.user?.email)
  return (email.split("@")[0] || "사용자").slice(0, 40)
}

function namesMatch(left: string, right: string): boolean {
  return (
    normalizeDisplayName(left).toLocaleLowerCase("ko-KR") ===
    normalizeDisplayName(right).toLocaleLowerCase("ko-KR")
  )
}

function isMissingDatabaseObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = "code" in error ? String(error.code ?? "") : ""
  const message =
    "message" in error ? String(error.message ?? "").toLowerCase() : ""
  return (
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
      code,
    ) ||
    message.includes("schema cache") ||
    message.includes("could not find the function")
  )
}

export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
        }),
      )
      .catch((error) => {
        clientPromise = null
        throw error
      })
  }

  return clientPromise
}

function requiredClient(): Promise<SupabaseClient> {
  return getSupabaseClient()
}

function throwIfError(error: unknown): void {
  if (error) throw error
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const supabase = await requiredClient()
  const { data, error } = await supabase.auth.getSession()
  throwIfError(error)
  return data?.session as AuthSession | null ?? null
}

export function subscribeToAuth(
  callback: (session: AuthSession | null) => void,
): () => void {
  let active = true
  let unsubscribe: (() => void) | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = 1_000

  const startSubscription = () => {
    void getSupabaseClient()
      .then((supabase) => {
        if (!active) return

        const { data } = supabase.auth.onAuthStateChange(
          (_event: string, session: AuthSession | null) => {
            if (active) callback(session)
          },
        )
        unsubscribe = () => data.subscription.unsubscribe()
      })
      .catch(() => {
        if (!active) return

        retryTimer = setTimeout(startSubscription, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30_000)
      })
  }

  startSubscription()

  return () => {
    active = false
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
    }
    unsubscribe?.()
  }
}

async function loadCurrentProfile(
  supabase?: SupabaseClient,
): Promise<UserProfile | null> {
  const client = supabase ?? (await requiredClient())
  const { data, error } = await client
    .from(PROFILES_TABLE)
    .select("display_name, name_change_available")
    .maybeSingle()
  if (error) {
    if (isMissingDatabaseObject(error)) return null
    throw error
  }
  if (!data) return null
  const row = data as {
    display_name?: unknown
    name_change_available?: unknown
  }
  return {
    name: normalizeDisplayName(row.display_name) || "사용자",
    canChangeName: Boolean(row.name_change_available),
  }
}

export async function resolveAuthUser(
  session: AuthSession | null,
): Promise<AuthUser | null> {
  const id = String(session?.user?.id ?? "")
  const email = normalizeEmail(session?.user?.email)
  if (!id || !email) return null
  let profile: UserProfile | null = null
  try {
    profile = await loadCurrentProfile()
  } catch {
    // Session metadata keeps the account usable during a temporary profile outage.
  }
  return {
    id,
    email,
    name: profile?.name ?? metadataName(session),
    canChangeName:
      profile?.canChangeName ??
      session?.user?.user_metadata?.profile_name_set !== true,
    isAdmin: isAdminEmail(email),
  }
}

export async function updateDisplayName(name: string): Promise<UserProfile> {
  const displayName = normalizeDisplayName(name)
  if (!displayName || displayName.length > 40) {
    throw new Error("이름은 1자 이상 40자 이하로 입력해 주세요.")
  }

  const supabase = await requiredClient()
  const { data, error } = await supabase
    .rpc(SET_PROFILE_NAME_RPC, { new_display_name: displayName })
    .single()
  throwIfError(error)
  if (!data) throw new Error("이름 변경 결과를 불러오지 못했습니다.")
  // The profile update is already committed by the RPC. Session metadata is
  // only a compatibility fallback, so a refresh failure must not turn this
  // successful one-time change into a misleading error.
  try {
    await supabase.auth.refreshSession()
  } catch {
    // The fresh profile is returned below even if session refresh is offline.
  }
  const row = data as {
    display_name?: unknown
    name_change_available?: unknown
  }
  return {
    name: normalizeDisplayName(row.display_name) || displayName,
    canChangeName: Boolean(row.name_change_available),
  }
}

export async function signIn(
  email: string,
  password: string,
  name: string,
): Promise<SignInResult> {
  const displayName = normalizeDisplayName(name)
  if (!displayName || displayName.length > 40) {
    throw new Error("이름은 1자 이상 40자 이하로 입력해 주세요.")
  }
  const supabase = await requiredClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  })
  throwIfError(error)
  const session = data?.session as AuthSession | null ?? null
  try {
    const profile = await loadCurrentProfile(supabase)
    if (profile?.canChangeName) {
      await updateDisplayName(displayName)
      return { nameWasSet: true }
    }
    if (profile && !namesMatch(profile.name, displayName)) {
      throw new Error("입력한 이름이 계정에 등록된 이름과 일치하지 않습니다.")
    }
    if (!profile) {
      const nameWasAlreadySet =
        session?.user?.user_metadata?.profile_name_set === true
      if (
        nameWasAlreadySet &&
        !namesMatch(metadataName(session), displayName)
      ) {
        throw new Error("입력한 이름이 계정에 등록된 이름과 일치하지 않습니다.")
      }
      if (!nameWasAlreadySet) {
        const { error: updateError } = await supabase.auth.updateUser({
          data: { name: displayName, profile_name_set: true },
        })
        throwIfError(updateError)
        return { nameWasSet: true }
      }
    }
    return { nameWasSet: false }
  } catch (profileError) {
    await supabase.auth.signOut()
    throw profileError
  }
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email)
  const displayName = normalizeDisplayName(name)
  if (!displayName || displayName.length > 40) {
    throw new Error("이름은 1자 이상 40자 이하로 입력해 주세요.")
  }
  const supabase = await requiredClient()
  const { data, error } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: { data: { name: displayName, profile_name_set: true } },
  })
  throwIfError(error)
  return Boolean(data?.session)
}

export async function signOut(): Promise<void> {
  const supabase = await requiredClient()
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
  const { data, error } = await (await requiredClient())
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
  const { error } = await (await requiredClient())
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
  const { error } = await (await requiredClient())
    .from(RESERVATIONS_TABLE)
    .update({
      status,
      status_reason: status === "rejected" ? statusReason.trim() : null,
    })
    .eq("id", id)
  throwIfError(error)
}

export async function removeReservation(id: string): Promise<void> {
  const { error } = await (await requiredClient())
    .from(RESERVATIONS_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

export async function removeAllReservations(): Promise<void> {
  const { error } = await (await requiredClient())
    .from(RESERVATIONS_TABLE)
    .delete()
    .neq("id", "")
  throwIfError(error)
}

export async function loadReservationBlocks(): Promise<ReservationBlock[]> {
  const { data, error } = await (await requiredClient())
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
  const { error } = await (await requiredClient())
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
  const { error } = await (await requiredClient())
    .from(RESERVATION_BLOCKS_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

export async function loadNotices(): Promise<Notice[]> {
  const { data, error } = await (await requiredClient())
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
  const { error } = await (await requiredClient()).from(NOTICES_TABLE).insert({
    id: notice.id,
    content: notice.content,
    created_at: notice.createdAt,
  })
  throwIfError(error)
}

export async function removeNotice(id: string): Promise<void> {
  const { error } = await (await requiredClient())
    .from(NOTICES_TABLE)
    .delete()
    .eq("id", id)
  throwIfError(error)
}

function mapQuestionAnswer(row: any): QuestionAnswer {
  return {
    id: String(row.id),
    questionId: String(row.question_id),
    content: String(row.content ?? ""),
    authorName: String(row.author_name ?? "사용자"),
    createdAt: String(row.created_at ?? ""),
  }
}

function mapQuestion(row: any): QuestionPost {
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    authorName: String(row.author_name ?? "사용자"),
    isAnonymous: Boolean(row.is_anonymous),
    createdAt: String(row.created_at ?? ""),
    answers: [],
  }
}
export async function loadQuestionThreads(
  includePrivateAuthors = false,
): Promise<QuestionPost[]> {
  const supabase = await requiredClient()
  const [initialQuestionsResult, answersResult] = await Promise.all([
    supabase
      .from(QUESTIONS_TABLE)
      .select("id, content, author_name, is_anonymous, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from(ANSWERS_TABLE)
      .select("id, question_id, content, author_name, created_at")
      .order("created_at", { ascending: true }),
  ])
  let questionRows: any[] = initialQuestionsResult.data ?? []
  let questionError: unknown = initialQuestionsResult.error
  if (questionError && isMissingDatabaseObject(questionError)) {
    const fallbackResult = await supabase
      .from(QUESTIONS_TABLE)
      .select("id, content, author_name, created_at")
      .order("created_at", { ascending: false })
    questionRows = fallbackResult.data ?? []
    questionError = fallbackResult.error
  }
  throwIfError(questionError)

  throwIfError(answersResult.error)
  const privateAuthors = new Map<string, { name: string; email: string }>()
  if (includePrivateAuthors) {
    const { data, error } = await supabase.rpc(QUESTION_AUTHORS_RPC)
    if (error && !isMissingDatabaseObject(error)) throw error
    for (const row of data ?? []) {
      privateAuthors.set(String(row.question_id), {
        name: normalizeDisplayName(row.author_name) || "사용자",
        email: normalizeEmail(row.author_email),
      })
    }
  }

  const answersByQuestion = new Map<string, QuestionAnswer[]>()
  for (const row of answersResult.data ?? []) {
    const answer = mapQuestionAnswer(row)
    const current = answersByQuestion.get(answer.questionId) ?? []
    current.push(answer)
    answersByQuestion.set(answer.questionId, current)
  }

  return questionRows.map((row: any) => {
    const question = mapQuestion(row)
    const privateAuthor = privateAuthors.get(question.id)
    return {
      ...question,
      actualAuthorName: privateAuthor?.name,
      authorEmail: privateAuthor?.email,
      answers: answersByQuestion.get(question.id) ?? [],
    }
  })
}

export async function createQuestion(
  content: string,
  isAnonymous = false,
): Promise<QuestionPost> {
  const supabase = await requiredClient()
  const initialResult = await supabase

    .from(QUESTIONS_TABLE)
    .insert({ content: content.trim(), is_anonymous: isAnonymous })
    .select("id, content, author_name, is_anonymous, created_at")
    .single()
  let questionData: any = initialResult.data
  let questionError: unknown = initialResult.error
  if (questionError && isMissingDatabaseObject(questionError) && !isAnonymous) {
    const fallbackResult = await supabase
      .from(QUESTIONS_TABLE)
      .insert({ content: content.trim() })
      .select("id, content, author_name, created_at")
      .single()
    questionData = fallbackResult.data
    questionError = fallbackResult.error
  }
  throwIfError(questionError)
  if (!questionData) throw new Error("질문 저장 결과를 불러오지 못했습니다.")
  return mapQuestion(questionData)
}

export async function createQuestionAnswer(
  questionId: string,
  content: string,
): Promise<QuestionAnswer> {
  const { data, error } = await (await requiredClient())
    .from(ANSWERS_TABLE)
    .insert({ question_id: questionId, content: content.trim() })
    .select("id, question_id, content, author_name, created_at")
    .single()

  throwIfError(error)
  if (!data) throw new Error("답변 저장 결과를 불러오지 못했습니다.")
  return mapQuestionAnswer(data)
}

export async function loadInventoryEdits(): Promise<InventoryEdits> {
  const { data, error } = await (await requiredClient())
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
  const { error } = await (await requiredClient()).from(INVENTORY_EDITS_TABLE).upsert(
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
