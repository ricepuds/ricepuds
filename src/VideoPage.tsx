import { useState } from "react"
import {
  SCIENCE_VIDEOS,
  VIDEO_CATEGORIES,
  type ScienceVideo,
  type VideoCategory,
} from "./data/equipment-videos"

const CATEGORY_SHORT_LABELS: Record<VideoCategory, string> = {
  물리: "물",
  화학: "화",
  생명과학: "생",
  지구과학: "지",
  "기구 사용법": "기구",
}

function parseStartTime(value: string | null): number {
  if (!value) return 0
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10)

  const parts = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  if (!parts) return 0

  return (
    Number(parts[1] ?? 0) * 3600 +
    Number(parts[2] ?? 0) * 60 +
    Number(parts[3] ?? 0)
  )
}

function getYoutubeDetails(youtubeUrl: string) {
  const url = new URL(youtubeUrl)
  const isShortLink = url.hostname === "youtu.be"
  const pathVideoId = url.pathname.match(
    /^\/(?:embed|shorts|live)\/([^/?]+)/,
  )?.[1]
  const videoId = isShortLink
    ? url.pathname.split("/").filter(Boolean)[0]
    : url.searchParams.get("v") ?? pathVideoId ?? ""
  const startAt = parseStartTime(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  )

  return { videoId, startAt }
}

function VideoCard({ video }: { video: ScienceVideo }) {
  const { videoId, startAt } = getYoutubeDetails(video.youtubeUrl)
  const embedUrl =
    `https://www.youtube-nocookie.com/embed/${videoId}?start=${startAt}&rel=0`

  return (
    <article className="video-card">
      <div className="video-frame">
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={embedUrl}
          title={video.title}
        />
      </div>
      <div className="video-card-copy">
        <span className="video-badge">{video.category}</span>
        <h2>{video.title}</h2>
        <p>{video.description}</p>
        <a href={video.youtubeUrl} rel="noreferrer" target="_blank">
          YouTube에서 보기 <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  )
}

export default function VideoPage() {
  const [activeCategory, setActiveCategory] = useState<VideoCategory>(
    SCIENCE_VIDEOS[0]?.category ?? VIDEO_CATEGORIES[0],
  )
  const visibleVideos = SCIENCE_VIDEOS.filter(
    (video) => video.category === activeCategory,
  )

  return (
    <main className="video-page" id="main-content">
      <header className="video-page-hero">
        <p className="eyebrow">Science video library</p>
        <h1>과학 영상 자료실</h1>
        <p>
          물리·화학·생명과학·지구과학 수업 영상과 실험 기구 사용법을 분야별로
          찾아보세요.
        </p>
      </header>

      <nav className="video-category-tabs" aria-label="영상 분야">
        {VIDEO_CATEGORIES.map((category) => {
          const count = SCIENCE_VIDEOS.filter(
            (video) => video.category === category,
          ).length

          return (
            <button
              aria-pressed={activeCategory === category}
              className={activeCategory === category ? "is-active" : ""}
              key={category}
              onClick={() => setActiveCategory(category)}
              type="button"
            >
              <span className="video-category-mark" aria-hidden="true">
                {CATEGORY_SHORT_LABELS[category]}
              </span>
              <span>{category}</span>
              <b>{count}</b>
            </button>
          )
        })}
      </nav>

      <div className="video-library-heading">
        <h2>{activeCategory}</h2>
        <span>총 {visibleVideos.length}개</span>
      </div>
      {visibleVideos.length ? (
        <section
          className="video-library"
          aria-label={`${activeCategory} 영상 목록`}
        >
          {visibleVideos.map((video) => (
            <VideoCard key={video.youtubeUrl} video={video} />
          ))}
        </section>
      ) : (
        <section className="video-empty-state" aria-live="polite">
          <span aria-hidden="true">{CATEGORY_SHORT_LABELS[activeCategory]}</span>
          <h2>{activeCategory} 영상 준비 중</h2>
          <p>영상이 등록되면 이곳에 자동으로 표시됩니다.</p>
        </section>
      )}
    </main>
  )
}
