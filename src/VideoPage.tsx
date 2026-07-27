import {
  EQUIPMENT_VIDEOS,
  type EquipmentVideo,
} from "./data/equipment-videos"

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

function VideoCard({ video }: { video: EquipmentVideo }) {
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
  return (
    <main className="video-page" id="main-content">
      <header className="video-page-hero">
        <p className="eyebrow">Equipment guide</p>
        <h1>실험 기구 사용법</h1>
        <p>
          실험 전에 영상을 확인하고, 기구의 올바른 사용 순서와 안전 수칙을
          익혀 주세요.
        </p>
      </header>

      <div className="video-library-heading">
        <h2>사용법 영상 모음</h2>
        <span>총 {EQUIPMENT_VIDEOS.length}개</span>
      </div>
      <section className="video-library" aria-label="실험 기구 사용법 영상 목록">
        {EQUIPMENT_VIDEOS.map((video) => (
          <VideoCard key={video.youtubeUrl} video={video} />
        ))}
      </section>
    </main>
  )
}
