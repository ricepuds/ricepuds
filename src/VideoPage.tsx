const videos = [
  {
    id: "weEileLXEuI",
    title: "실험 기구 사용법 테스트 영상",
    description:
      "영상은 보내주신 구간인 10분 38초부터 재생됩니다. 재생 버튼을 눌러 사용법을 확인해 보세요.",
    startAt: 638,
  },
]

export default function VideoPage() {
  return (
    <main className="video-page" id="main-content">
      <header className="video-page-hero">
        <p className="eyebrow">Equipment guide</p>
        <h1>실험 기구 사용법</h1>
        <p>실험 전에 영상을 확인하고, 기구의 올바른 사용 순서와 안전 수칙을 익혀 주세요.</p>
      </header>
      <section className="video-library" aria-label="실험 기구 사용법 영상 목록">
        {videos.map((video) => (
          <article className="video-card" key={video.id}>
            <div className="video-frame">
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                src={`https://www.youtube-nocookie.com/embed/${video.id}?start=${video.startAt}&rel=0`}
                title={video.title}
              />
            </div>
            <div className="video-card-copy">
              <span className="video-badge">사용법 영상</span>
              <h2>{video.title}</h2>
              <p>{video.description}</p>
              <a href={`https://www.youtube.com/watch?v=${video.id}&t=${video.startAt}s`} rel="noreferrer" target="_blank">
                YouTube에서 보기 <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
