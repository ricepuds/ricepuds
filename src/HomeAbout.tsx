import { useState } from "react"
import type { Area, AuthUser, InventoryItem, Notice } from "./types"

const SPACE_CONFIG: Array<{
  id: string
  area: Area
  className: string
  description: string
}> = [
  {
    id: "01",
    area: "시약",
    className: "is-reagent",
    description: "시약 분류표",
  },
  {
    id: "02",
    area: "화학실",
    className: "is-chemistry",
    description: "실험 기구와 위치",
  },
  {
    id: "03",
    area: "생명실",
    className: "is-life",
    description: "생명과학 기구",
  },
  {
    id: "04",
    area: "준비실",
    className: "is-prep",
    description: "공용 장비와 소모품",
  },
  {
    id: "05",
    area: "전체",
    className: "is-all",
    description: "통합 검색",
  },
]

const CREW_GROUPS = [
  {
    role: "랩 매니저",
    leader: "권대관",
    members: ["김하윤", "정희수", "조해윤", "황인하"],
    tone: "blue",
  },
  {
    role: "랩 마스터",
    leader: "이소연",
    members: ["오은비", "임다정", "지서진", "이지현", "신수연", "송준선"],
    tone: "purple",
  },
  {
    role: "랩 크리에이터",
    leader: "박태은",
    members: [
      "이윤서",
      "오정민",
      "안예원",
      "양진우",
      "김정원",
      "임예빈",
      "배정현",
      "김혜윤",
      "고수현",
    ],
    tone: "green",
  },
  {
    role: "랩 테크",
    leader: "안제용",
    members: ["형태형", "박시우"],
    tone: "orange",
  },
]

interface HomePageProps {
  items: InventoryItem[]
  user: AuthUser | null
  source: "static" | "live"
  onOpenArea: (area: Area) => void
}

export function HomePage({
  items,
  user,
  source,
  onOpenArea,
}: HomePageProps) {
  const areaCount = (area: Area) =>
    area === "전체"
      ? items.length
      : items.filter((item) => item.area === area).length

  return (
    <main className="home-page" id="main-content">
      <section className="hero">
        <div className="live-pill">
          <i />
          {source === "live" ? "Live inventory" : "Offline inventory"}
        </div>
        <h1>
          오송도손
          <br />
          <span>#오송도손</span>
        </h1>
        <p>과학실의 시약과 실험 기구를 한곳에서 찾고 예약하세요.</p>
        <div className="hero-actions">
          <button
            className="button primary"
            onClick={() => onOpenArea("전체")}
            type="button"
          >
            전체 보기
          </button>
          <button
            className="button secondary"
            onClick={() => onOpenArea("시약")}
            type="button"
          >
            시약 분류표
          </button>
        </div>
        <small className="hero-note">
          <i />
          {user
            ? `${user.email} 계정으로 로그인되었습니다.`
            : "로그인 없이 바로 열람할 수 있습니다."}
        </small>
      </section>

      <section
        className="spaces-section"
        id="spaces"
        aria-labelledby="spaces-title"
      >
        <div className="section-title">
          <p className="eyebrow">Today</p>
          <h2 id="spaces-title">오늘의 과학실</h2>
        </div>
        <div className="space-grid">
          {SPACE_CONFIG.map((space) => (
            <button
              aria-label={`${space.area} 분류표 열기`}
              className={`space-card ${space.className}`}
              key={space.area}
              onClick={() => onOpenArea(space.area)}
              type="button"
            >
              <span className="space-visual">
                <b>{space.id}</b>
                <em>{areaCount(space.area).toLocaleString("ko-KR")} items</em>
              </span>
              <span className="space-copy">
                <strong>{space.area}</strong>
                <small>{space.description}</small>
                <i aria-hidden="true">›</i>
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

interface AboutPageProps {
  notices: Notice[]
  isAdmin: boolean
  onAddNotice: (content: string) => Promise<boolean>
  onDeleteNotice: (id: string) => Promise<boolean>
}

export function AboutPage({
  notices,
  isAdmin,
  onAddNotice,
  onDeleteNotice,
}: AboutPageProps) {
  const [content, setContent] = useState("")
  const [busyId, setBusyId] = useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return
    setBusyId("new")
    const saved = await onAddNotice(content)
    setBusyId("")
    if (saved) setContent("")
  }

  return (
    <main className="about-page" id="main-content">
      <div className="about-shell">
        <section className="ios-card about-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Notice board</p>
              <h1>공지사항</h1>
            </div>
            <span className="count-pill">{notices.length}</span>
          </div>

          <div className="notice-list">
            {notices.length ? (
              notices.map((notice) => (
                <article className="notice-item" key={notice.id}>
                  <i aria-hidden="true" />
                  <div>
                    <p>{notice.content}</p>
                    <time>{notice.createdAt}</time>
                  </div>
                  {isAdmin && (
                    <button
                      aria-label="공지 삭제"
                      disabled={busyId === notice.id}
                      onClick={async () => {
                        setBusyId(notice.id)
                        await onDeleteNotice(notice.id)
                        setBusyId("")
                      }}
                      type="button"
                    >
                      {busyId === notice.id ? "…" : "×"}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="empty-state compact">
                <strong>등록된 공지가 없습니다.</strong>
              </div>
            )}
          </div>

          {isAdmin && (
            <form className="notice-form" onSubmit={submit}>
              <input
                aria-label="새 공지사항"
                onChange={(event) => setContent(event.target.value)}
                placeholder="새 공지사항을 입력하세요."
                type="text"
                value={content}
              />
              <button
                className="button primary"
                disabled={busyId === "new" || !content.trim()}
                type="submit"
              >
                {busyId === "new" ? "저장 중" : "등록"}
              </button>
            </form>
          )}
        </section>

        <section className="ios-card about-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Development</p>
              <h2>디벨롭</h2>
            </div>
          </div>
          <div className="credit-list">
            {[
              ["주요 개발", "안제용"],
              ["기능 개발 지원", "이진원"],
              ["기획", "김형민 선생님"],
              ["도움준 사람", "신수연"],
              ["테스터", "신수연 · 정효림 · 이송연 · 송준선 · 박수민 · 김민준"],
            ].map(([role, names]) => (
              <div className="credit-row" key={role}>
                <span>{role}</span>
                <strong>{names}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="ios-card about-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Osong Doson</p>
              <h2>오송도손</h2>
            </div>
          </div>
          <div className="crew-list">
            {CREW_GROUPS.map((group) => (
              <article
                className={`crew-group is-${group.tone}`}
                key={group.role}
              >
                <header>
                  <span>{group.role}</span>
                  <strong>{group.leader}</strong>
                </header>
                <div>
                  {group.members.map((member) => (
                    <span key={member}>{member}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
