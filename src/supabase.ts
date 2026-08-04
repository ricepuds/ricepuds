import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  AccountListItem,
  AuthUser,
  GuestIdentity,
  InventoryEdits,
  Notice,
  QuestionAnswer,
  QuestionPost,
  Reservation,
  ReservationBlock,
  ReservationStatus,
} from "./types"

import {
  QUESTION_IMAGE_MAX_COUNT,
  validateQuestionImageFile,
} from "./questionImages"

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

export const ACCOUNT_LIST_VIEWER_EMAIL = "rices2114@gmail.com"

const RESERVATIONS_TABLE = "science_lab_reservations"

const RESERVATION_BLOCKS_TABLE = "science_lab_reservation_blocks"

const NOTICES_TABLE = "science_lab_notices"

const INVENTORY_EDITS_TABLE = "science_lab_inventory_edits"

const PROFILES_TABLE = "science_lab_profiles"

const QUESTIONS_TABLE = "science_lab_questions"

const ANSWERS_TABLE = "science_lab_answers"

const QUESTION_IMAGE_BUCKET = "science-lab-question-images"

const SET_PROFILE_NAME_RPC = "set_my_science_lab_name"

const QUESTION_AUTHORS_RPC = "get_science_lab_question_authors"

const ANSWER_AUTHORS_RPC = "get_science_lab_answer_authors"

const ACCOUNT_LIST_RPC = "get_science_lab_accounts_v2"

const UPDATE_MANAGED_ACCOUNT_NAME_RPC = "owner_update_science_lab_account_name"

const PREPARE_MANAGED_ACCOUNT_DELETE_RPC = "prepare_science_lab_account_delete"

const FINALIZE_MANAGED_ACCOUNT_DELETE_RPC =
  "finalize_science_lab_account_delete"

const PREPARE_QUESTION_DELETE_RPC = "prepare_science_lab_question_delete"

const FINALIZE_QUESTION_DELETE_RPC = "finalize_science_lab_question_delete"

const RESERVE_QUESTION_IMAGES_RPC = "reserve_science_lab_question_images"

const CANCEL_QUESTION_IMAGES_RPC = "cancel_science_lab_question_images"

const QUESTION_IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const QUESTION_IMAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const GUEST_STUDENT_ID_PATTERN = /^[0-9]{4,10}$/
const STORAGE_DELETE_BATCH_SIZE = 1_000

let clientPromise: Promise<SupabaseClient> | null = null

export function normalizeEmail(email: unknown): string {
  return String(email ?? "")
    .trim()
    .toLowerCase()
}

export function isAdminEmail(email: unknown): boolean {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function canViewAccountList(email: unknown): boolean {
  return normalizeEmail(email) === ACCOUNT_LIST_VIEWER_EMAIL
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

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  return "code" in error && String(error.code ?? "") === "23505"
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

async function anonymousRequestClient(): Promise<SupabaseClient> {
  const { createClient } = await import("@supabase/supabase-js")
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export function normalizeGuestIdentity(identity: GuestIdentity): GuestIdentity {
  const studentId = String(identity.studentId ?? "").trim()
  const name = normalizeDisplayName(identity.name)
  if (!GUEST_STUDENT_ID_PATTERN.test(studentId)) {
    throw new Error("학번은 숫자 4~10자리로 입력해 주세요.")
  }
  if (name.length < 1 || name.length > 40) {
    throw new Error("이름은 1자 이상 40자 이하로 입력해 주세요.")
  }
  return { studentId, name }
}

function throwIfError(error: unknown): void {
  if (error) throw error
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const supabase = await requiredClient()
  const { data, error } = await supabase.auth.getSession()
  throwIfError(error)
  return (data?.session as AuthSession | null) ?? null
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

export async function loadAccountList(): Promise<AccountListItem[]> {
  const { data, error } = await (await requiredClient()).rpc(ACCOUNT_LIST_RPC)
  throwIfError(error)
  return (data ?? []).map((row: any) => {
    const email = normalizeEmail(row.email)
    return {
      id: String(row.account_id ?? ""),
      name: normalizeDisplayName(row.display_name) || "사용자",
      email,
      createdAt: String(row.created_at ?? ""),
      lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : null,
      canChangeName: Boolean(row.name_change_available),
      isAdmin: isAdminEmail(email),
      canDelete: Boolean(row.can_delete),
    }
  })
}

export async function updateManagedAccountName(
  accountId: string,
  name: string,
): Promise<{ name: string; canChangeName: boolean }> {
  const displayName = normalizeDisplayName(name)
  if (!displayName || displayName.length > 40) {
    throw new Error("이름은 1자 이상 40자 이하로 입력해 주세요.")
  }
  const supabase = await requiredClient()
  const { data, error } = await supabase
    .rpc(UPDATE_MANAGED_ACCOUNT_NAME_RPC, {
      p_target_user_id: accountId,
      p_display_name: displayName,
    })
    .single()
  throwIfError(error)
  if (!data) throw new Error("계정 이름 수정 결과를 불러오지 못했습니다.")
  try {
    const sessionResult = await supabase.auth.getSession()
    if (sessionResult.data.session?.user.id === accountId) {
      await supabase.auth.refreshSession()
    }
  } catch {
    // The server-side profile update already succeeded. A later auth event or
    // reload will reconcile the current account name if refresh is offline.
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

export async function deleteManagedAccount(accountId: string): Promise<void> {
  const supabase = await requiredClient()
  const normalizedAccountId = accountId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedAccountId)) {
    throw new Error("삭제할 계정 정보를 확인하지 못했습니다.")
  }
  const prepareResult = await supabase
    .rpc(PREPARE_MANAGED_ACCOUNT_DELETE_RPC, {
      p_target_user_id: normalizedAccountId,
    })
    .single()
  if (prepareResult.error) {
    // A finalize response can be lost after the transaction committed. A retry
    // then sees no target account and is safely treated as already complete.
    if (String((prepareResult.error as any).code ?? "") === "P0002") return
    throw prepareResult.error
  }
  const prepareData = prepareResult.data as {
    delete_ticket_id?: unknown
    storage_objects?: unknown
  } | null
  const deleteTicketId = String(prepareData?.delete_ticket_id ?? "")
    .trim()
    .toLowerCase()
  if (!UUID_PATTERN.test(deleteTicketId)) {
    throw new Error("계정 삭제 준비 정보를 확인하지 못했습니다.")
  }
  const rawObjects: unknown[] = Array.isArray(prepareData?.storage_objects)
    ? prepareData.storage_objects
    : []
  const objectsByBucket = new Map<string, string[]>()
  let snapshotError: unknown = null
  for (const rawObject of rawObjects) {
    if (!rawObject || typeof rawObject !== "object") {
      snapshotError = new Error(
        "계정 파일 삭제 준비 정보를 확인하지 못했습니다.",
      )
      break
    }
    const row = rawObject as { bucket_id?: unknown; object_path?: unknown }
    // Bucket IDs and object paths are case-sensitive. Use the exact values
    // issued by the server ticket without trimming or normalization.
    const bucketId = typeof row.bucket_id === "string" ? row.bucket_id : ""
    const objectPath =
      typeof row.object_path === "string" ? row.object_path : ""
    if (!bucketId || !objectPath) {
      snapshotError = new Error(
        "계정 파일 삭제 준비 정보를 확인하지 못했습니다.",
      )
      break
    }
    const bucketPaths = objectsByBucket.get(bucketId) ?? []
    if (!bucketPaths.includes(objectPath)) bucketPaths.push(objectPath)
    objectsByBucket.set(bucketId, bucketPaths)
  }
  let storageError: unknown = snapshotError
  if (!snapshotError) {
    for (const [bucketId, objectPaths] of objectsByBucket) {
      for (
        let offset = 0;
        offset < objectPaths.length;
        offset += STORAGE_DELETE_BATCH_SIZE
      ) {
        const batch = objectPaths.slice(
          offset,
          offset + STORAGE_DELETE_BATCH_SIZE,
        )
        try {
          const result = await supabase.storage.from(bucketId).remove(batch)
          if (!storageError && result.error) storageError = result.error
        } catch (error) {
          if (!storageError) storageError = error
        }
      }
    }
  }
  // Finalize even after snapshot or Storage errors. The database verifies both
  // the exact snapshot and any newly-created target-owned objects.
  const deleteResult = await supabase.rpc(FINALIZE_MANAGED_ACCOUNT_DELETE_RPC, {
    p_delete_ticket_id: deleteTicketId,
  })
  if (deleteResult.error) {
    throw deleteResult.error
  }
  // A successful finalize proves no target-owned objects remain. A preceding
  // Storage error was therefore a harmless lost/duplicate response.
  void storageError
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
  const session = (data?.session as AuthSession | null) ?? null
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
  const { error } = await (
    await requiredClient()
  )
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
    isAnonymous: Boolean(row.is_anonymous),
    createdAt: String(row.created_at ?? ""),
  }
}

function questionImagePublicUrl(path: unknown): string {
  const normalizedPath = String(path ?? "")
    .trim()
    .toLowerCase()
  if (!QUESTION_IMAGE_PATH_PATTERN.test(normalizedPath)) return ""
  return `${SUPABASE_URL}/storage/v1/object/public/${QUESTION_IMAGE_BUCKET}/${encodeURIComponent(normalizedPath)}`
}

function mapQuestion(row: any): QuestionPost {
  const imagePaths = (Array.isArray(row.image_paths) ? row.image_paths : [])
    .map((path: unknown) =>
      String(path ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter((path: string) => QUESTION_IMAGE_PATH_PATTERN.test(path))
  const imageUrls = imagePaths.map(questionImagePublicUrl)
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    authorName: String(row.author_name ?? "사용자"),
    isAnonymous: Boolean(row.is_anonymous),
    imagePaths,
    imageUrls,
    createdAt: String(row.created_at ?? ""),
    answers: [],
  }
}

export async function loadQuestionThreads(
  includePrivateAuthors = false,
): Promise<QuestionPost[]> {
  const supabase = await requiredClient()
  const [initialQuestionsResult, initialAnswersResult] = await Promise.all([
    supabase
      .from(QUESTIONS_TABLE)
      .select("id, content, author_name, is_anonymous, image_paths, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from(ANSWERS_TABLE)
      .select("id, question_id, content, author_name, is_anonymous, created_at")
      .order("created_at", { ascending: true }),
  ])
  let questionRows: any[] = initialQuestionsResult.data ?? []
  let questionError: unknown = initialQuestionsResult.error
  if (questionError && isMissingDatabaseObject(questionError)) {
    const noImagesResult = await supabase
      .from(QUESTIONS_TABLE)
      .select("id, content, author_name, is_anonymous, created_at")
      .order("created_at", { ascending: false })
    questionRows = noImagesResult.data ?? []
    questionError = noImagesResult.error
    if (questionError && isMissingDatabaseObject(questionError)) {
      const legacyResult = await supabase
        .from(QUESTIONS_TABLE)
        .select("id, content, author_name, created_at")
        .order("created_at", { ascending: false })
      questionRows = legacyResult.data ?? []
      questionError = legacyResult.error
    }
  }
  throwIfError(questionError)
  let answerRows: any[] = initialAnswersResult.data ?? []
  let answerError: unknown = initialAnswersResult.error
  if (answerError && isMissingDatabaseObject(answerError)) {
    const legacyAnswersResult = await supabase
      .from(ANSWERS_TABLE)
      .select("id, question_id, content, author_name, created_at")
      .order("created_at", { ascending: true })
    answerRows = legacyAnswersResult.data ?? []
    answerError = legacyAnswersResult.error
  }
  throwIfError(answerError)
  const privateAuthors = new Map<
    string,
    {
      name: string
      email: string
      studentId: string
    }
  >()
  const privateAnswerAuthors = new Map<
    string,
    {
      name: string
      email: string
      studentId: string
    }
  >()
  if (includePrivateAuthors) {
    const [questionAuthorsResult, answerAuthorsResult] = await Promise.all([
      supabase.rpc(QUESTION_AUTHORS_RPC),
      supabase.rpc(ANSWER_AUTHORS_RPC),
    ])
    if (
      questionAuthorsResult.error &&
      !isMissingDatabaseObject(questionAuthorsResult.error)
    ) {
      throw questionAuthorsResult.error
    }
    if (
      answerAuthorsResult.error &&
      !isMissingDatabaseObject(answerAuthorsResult.error)
    ) {
      throw answerAuthorsResult.error
    }
    for (const row of questionAuthorsResult.data ?? []) {
      privateAuthors.set(String(row.question_id), {
        name: normalizeDisplayName(row.author_name) || "사용자",
        email: normalizeEmail(row.author_email),
        studentId: String(row.author_student_id ?? "").trim(),
      })
    }
    for (const row of answerAuthorsResult.data ?? []) {
      privateAnswerAuthors.set(String(row.answer_id), {
        name: normalizeDisplayName(row.author_name) || "사용자",
        email: normalizeEmail(row.author_email),
        studentId: String(row.author_student_id ?? "").trim(),
      })
    }
  }
  const answersByQuestion = new Map<string, QuestionAnswer[]>()
  for (const row of answerRows) {
    const answer = mapQuestionAnswer(row)
    const privateAuthor = privateAnswerAuthors.get(answer.id)
    const current = answersByQuestion.get(answer.questionId) ?? []
    current.push({
      ...answer,
      actualAuthorName: privateAuthor?.name,
      authorEmail: privateAuthor?.email,
      authorStudentId: privateAuthor?.studentId,
    })
    answersByQuestion.set(answer.questionId, current)
  }
  return questionRows.map((row: any) => {
    const question = mapQuestion(row)
    const privateAuthor = privateAuthors.get(question.id)
    return {
      ...question,
      actualAuthorName: privateAuthor?.name,
      authorEmail: privateAuthor?.email,
      authorStudentId: privateAuthor?.studentId,
      answers: answersByQuestion.get(question.id) ?? [],
    }
  })
}

export type QuestionSubmitStage = "uploading" | "saving"

function questionImageReservationError(error: unknown): Error {
  if (isMissingDatabaseObject(error)) {
    return new Error(
      "사진 첨부 기능을 사용하려면 최신 Supabase 스키마를 먼저 적용해 주세요.",
    )
  }
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message ?? "").trim()
      : ""
  const isSafeMessage = [
    "사진",
    "처리 중인 사진",
    "시간당 사진",
    "하루 사진",
    "계정의 사진",
    "로그인이 필요",
  ].some((prefix) => message.startsWith(prefix))
  return new Error(
    isSafeMessage
      ? `사진 첨부: ${message}`
      : "사진 업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  )
}

async function cleanupQuestionImageUploads(
  supabase: SupabaseClient,
  reservedPaths: string[],
): Promise<void> {
  if (!reservedPaths.length) return
  // Remove every reserved path, not only uploads that returned success. The
  // server may have stored an object even if its network response was lost.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await supabase.storage
        .from(QUESTION_IMAGE_BUCKET)
        .remove(reservedPaths)
      if (!error) break
    } catch {
      // Retry once below. A lost upload response can still leave an object.
    }
    if (attempt === 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200))
    }
  }
  // The cancellation RPC is the final source-of-truth check: it only cancels
  // a reservation after confirming that no Storage object remains.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await supabase.rpc(CANCEL_QUESTION_IMAGES_RPC, {
        p_object_paths: reservedPaths,
      })
      if (!error) return
    } catch {
      // The original submit error remains the useful message for the user.
    }
    if (attempt === 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200))
    }
  }
}

async function questionSubmitClient(
  expectedUserId?: string,
  forceAnonymous = false,
): Promise<SupabaseClient> {
  if (forceAnonymous) return anonymousRequestClient()
  const sessionClient = await requiredClient()
  const { data, error } = await sessionClient.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error(
      "질문을 등록하는 동안 로그인이 해제되었습니다. 다시 시도해 주세요.",
    )
  }
  if (expectedUserId && data.session.user.id !== expectedUserId) {
    throw new Error(
      "질문을 등록하는 동안 계정이 변경되었습니다. 다시 시도해 주세요.",
    )
  }
  // Freeze the submit to its starting account. Global sign-out or account
  // switching cannot make later Storage/DB steps run as a different user.
  const accessToken = data.session.access_token
  const { createClient } = await import("@supabase/supabase-js")
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => accessToken,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export async function createQuestion(
  content: string,
  isAnonymous = false,
  imageFiles: File[] = [],
  onStage?: (stage: QuestionSubmitStage) => void,
  expectedUserId?: string,
  guestIdentity?: GuestIdentity,
): Promise<QuestionPost> {
  const normalizedGuestIdentity = guestIdentity
    ? normalizeGuestIdentity(guestIdentity)
    : null
  const supabase = await questionSubmitClient(
    expectedUserId,
    Boolean(normalizedGuestIdentity),
  )
  if (imageFiles.length > QUESTION_IMAGE_MAX_COUNT) {
    throw new Error("질문에는 사진을 최대 3장까지 첨부할 수 있습니다.")
  }
  if (normalizedGuestIdentity && imageFiles.length) {
    throw new Error("사진 첨부는 로그인한 사용자만 이용할 수 있습니다.")
  }
  const contentTypes = imageFiles.map((file) => {
    validateQuestionImageFile(file)
    return file.type.toLowerCase()
  })
  const reservedPaths: string[] = []
  const uploadedPaths: string[] = []
  try {
    if (imageFiles.length) {
      onStage?.("uploading")
      const reservationResult = await supabase.rpc(
        RESERVE_QUESTION_IMAGES_RPC,
        { p_mime_types: contentTypes },
      )
      if (reservationResult.error) {
        throw questionImageReservationError(reservationResult.error)
      }
      for (const [index, row] of (reservationResult.data ?? []).entries()) {
        const path = String(row?.object_path ?? "")
          .trim()
          .toLowerCase()
        const extension = QUESTION_IMAGE_EXTENSION_BY_TYPE[contentTypes[index]]
        if (
          !QUESTION_IMAGE_PATH_PATTERN.test(path) ||
          !extension ||
          !path.endsWith(`.${extension}`)
        ) {
          throw new Error("사진 업로드 경로를 안전하게 준비하지 못했습니다.")
        }
        reservedPaths.push(path)
      }
      if (
        reservedPaths.length !== imageFiles.length ||
        new Set(reservedPaths).size !== reservedPaths.length
      ) {
        throw new Error("사진 업로드 경로를 안전하게 준비하지 못했습니다.")
      }
    }
    for (const [index, file] of imageFiles.entries()) {
      const path = reservedPaths[index]
      const contentType = contentTypes[index]
      const { error } = await supabase.storage
        .from(QUESTION_IMAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        })
      if (error) {
        throw new Error(
          "사진을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        )
      }
      uploadedPaths.push(path)
    }
    onStage?.("saving")
    const initialResult = await supabase
      .from(QUESTIONS_TABLE)
      .insert(
        normalizedGuestIdentity
          ? {
              content: content.trim(),
              guest_student_id: normalizedGuestIdentity.studentId,
              guest_name: normalizedGuestIdentity.name,
            }
          : {
              content: content.trim(),
              is_anonymous: isAnonymous,
              image_paths: uploadedPaths,
            },
      )
      .select("id, content, author_name, is_anonymous, image_paths, created_at")
      .single()
    let questionData: any = initialResult.data
    let questionError: unknown = initialResult.error
    if (questionError && isMissingDatabaseObject(questionError)) {
      if (normalizedGuestIdentity) {
        throw new Error(
          "비회원 글쓰기 기능을 사용하려면 최신 Supabase 스키마를 먼저 적용해 주세요.",
        )
      }
      if (uploadedPaths.length) {
        throw new Error(
          "사진 첨부 기능을 사용하려면 최신 Supabase 스키마를 먼저 적용해 주세요.",
        )
      }
      const noImagesResult = await supabase
        .from(QUESTIONS_TABLE)
        .insert({ content: content.trim(), is_anonymous: isAnonymous })
        .select("id, content, author_name, is_anonymous, created_at")
        .single()
      questionData = noImagesResult.data
      questionError = noImagesResult.error
      if (
        questionError &&
        isMissingDatabaseObject(questionError) &&
        !isAnonymous
      ) {
        const legacyResult = await supabase
          .from(QUESTIONS_TABLE)
          .insert({ content: content.trim() })
          .select("id, content, author_name, created_at")
          .single()
        questionData = legacyResult.data
        questionError = legacyResult.error
      }
    }
    throwIfError(questionError)
    if (!questionData) {
      throw new Error("질문 저장 결과를 불러오지 못했습니다.")
    }
    return mapQuestion(questionData)
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        const recoveryResult = await supabase
          .from(QUESTIONS_TABLE)
          .select(
            "id, content, author_name, is_anonymous, image_paths, created_at",
          )
          .contains("image_paths", uploadedPaths)
          .eq("content", content.trim())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!recoveryResult.error && recoveryResult.data) {
          return mapQuestion(recoveryResult.data)
        }
      } catch {
        // If the insert response was lost after commit, the lookup above
        // preserves the attached object instead of racing to delete it.
      }
    }
    await cleanupQuestionImageUploads(supabase, reservedPaths)
    throw error
  }
}

export async function createQuestionAnswer(
  questionId: string,
  content: string,
  isAnonymous = false,
  guestIdentity?: GuestIdentity,
): Promise<QuestionAnswer> {
  const normalizedGuestIdentity = guestIdentity
    ? normalizeGuestIdentity(guestIdentity)
    : null
  const supabase = normalizedGuestIdentity
    ? await anonymousRequestClient()
    : await requiredClient()
  const initialResult = await supabase
    .from(ANSWERS_TABLE)
    .insert(
      normalizedGuestIdentity
        ? {
            question_id: questionId,
            content: content.trim(),
            guest_student_id: normalizedGuestIdentity.studentId,
            guest_name: normalizedGuestIdentity.name,
          }
        : {
            question_id: questionId,
            content: content.trim(),
            is_anonymous: isAnonymous,
          },
    )
    .select("id, question_id, content, author_name, is_anonymous, created_at")
    .single()
  let answerData: any = initialResult.data
  let answerError: unknown = initialResult.error
  if (answerError && isMissingDatabaseObject(answerError)) {
    if (normalizedGuestIdentity) {
      throw new Error(
        "비회원 글쓰기 기능을 사용하려면 최신 Supabase 스키마를 먼저 적용해 주세요.",
      )
    }
    if (isAnonymous) {
      throw new Error(
        "익명 답변 기능을 사용하려면 최신 Supabase 스키마를 먼저 적용해 주세요.",
      )
    }
    const legacyResult = await supabase
      .from(ANSWERS_TABLE)
      .insert({ question_id: questionId, content: content.trim() })
      .select("id, question_id, content, author_name, created_at")
      .single()
    answerData = legacyResult.data
    answerError = legacyResult.error
  }
  throwIfError(answerError)
  if (!answerData) throw new Error("답변 저장 결과를 불러오지 못했습니다.")
  return mapQuestionAnswer(answerData)
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const supabase = await requiredClient()
  const normalizedQuestionId = questionId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedQuestionId)) {
    throw new Error("삭제할 질문 정보를 확인하지 못했습니다.")
  }
  // The server is the sole source of truth for the paths authorized for this
  // question deletion.
  const prepareResult = await supabase
    .rpc(PREPARE_QUESTION_DELETE_RPC, {
      p_question_id: normalizedQuestionId,
    })
    .single()
  throwIfError(prepareResult.error)
  const prepareData = prepareResult.data as {
    delete_ticket_id?: unknown
    object_paths?: unknown
  } | null
  const deleteTicketId = String(prepareData?.delete_ticket_id ?? "")
    .trim()
    .toLowerCase()
  const rawPaths: unknown[] = Array.isArray(prepareData?.object_paths)
    ? prepareData.object_paths
    : []
  const safePaths = rawPaths
    .map((path: unknown) =>
      String(path ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter((path: string) => QUESTION_IMAGE_PATH_PATTERN.test(path))
  if (
    !UUID_PATTERN.test(deleteTicketId) ||
    safePaths.length !== rawPaths.length ||
    safePaths.length > QUESTION_IMAGE_MAX_COUNT ||
    new Set(safePaths).size !== safePaths.length
  ) {
    throw new Error("질문 삭제 준비 정보를 확인하지 못했습니다.")
  }
  let storageError: unknown = null
  if (safePaths.length) {
    try {
      const result = await supabase.storage
        .from(QUESTION_IMAGE_BUCKET)
        .remove(safePaths)
      storageError = result.error
    } catch (error) {
      storageError = error
    }
  }
  const deleteResult = await supabase.rpc(FINALIZE_QUESTION_DELETE_RPC, {
    p_delete_ticket_id: deleteTicketId,
  })
  if (deleteResult.error) {
    if (storageError) throw storageError
    throw deleteResult.error
  }
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
  const supabase = await requiredClient()
  const updatedAt = new Date().toISOString()
  const updateExisting = () =>
    supabase
      .from(INVENTORY_EDITS_TABLE)
      .update({
        field_value: fieldValue,
        updated_at: updatedAt,
      })
      .eq("item_id", itemId)
      .eq("field_name", fieldName)
      .select("item_id")

  const updateResult = await updateExisting()
  throwIfError(updateResult.error)
  if (updateResult.data?.length) return

  const { error: insertError } = await supabase
    .from(INVENTORY_EDITS_TABLE)
    .insert({
      item_id: itemId,
      field_name: fieldName,
      field_value: fieldValue,
      updated_at: updatedAt,
    })

  if (!insertError) return
  if (!isUniqueViolation(insertError)) throw insertError

  const retryResult = await updateExisting()
  throwIfError(retryResult.error)
  if (!retryResult.data?.length) throw insertError
}

function normalizeReservationStatus(value: unknown): ReservationStatus {
  return value === "approved" || value === "rejected" ? value : "pending"
}
