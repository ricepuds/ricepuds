export type Area = "시약" | "화학실" | "생명실" | "준비실" | "전체"
export type LabArea = Exclude<Area, "전체">
export type InventoryStatus = "normal" | "toxic" | "low"
export type SortKey = "id" | "area" | "category" | "name" | "location"
export type ReservationStatus = "pending" | "approved" | "rejected"

export interface InventoryItem {
  id: string
  numericId: number
  type: "reagent" | "equipment"
  area: LabArea
  category: string
  name: string
  detail: string
  formula: string
  quantity: string
  location: string
  toxic: boolean
  lowStock: boolean
  sourceSheet?: string
  sourceCell?: string
  aliases?: string
  sheetSearchKey?: string
  searchText: string
  googleSheetManaged: boolean
}

export interface InventoryEdit {
  category?: string
  name?: string
  detail?: string
  quantity?: string
  location?: string
}

export type InventoryEdits = Record<string, InventoryEdit>

export interface Reservation {
  id: string
  room: string
  date: string
  time: string
  className: string
  applicantStudentId: string
  applicantName: string
  purpose: string
  createdAt: string
  status: ReservationStatus
  statusReason: string
}

export interface ReservationBlock {
  id: string
  room: string
  date: string
  startTime: string
  endTime: string
  reason: string
  createdAt: string
}

export interface Notice {
  id: string
  content: string
  createdAt: string
}

export interface QuestionAnswer {
  id: string
  questionId: string
  content: string
  authorName: string
  createdAt: string
}

export interface QuestionPost {
  id: string
  content: string
  authorName: string
  isAnonymous: boolean
  imageUrls: string[]
  actualAuthorName?: string
  authorEmail?: string
  createdAt: string
  answers: QuestionAnswer[]
}

export interface AuthUser {
  id: string
  email: string
  name: string
  canChangeName: boolean
  isAdmin: boolean
}

export interface AccountListItem {
  name: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  canChangeName: boolean
  isAdmin: boolean
}

export interface ToastMessage {
  id: number
  text: string
  tone?: "default" | "success" | "error"
}
