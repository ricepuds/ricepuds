export const VIDEO_CATEGORIES = [
  "물리",
  "화학",
  "생명과학",
  "지구과학",
  "기구 사용법",
] as const

export type VideoCategory = (typeof VIDEO_CATEGORIES)[number]

export type ScienceVideo = {
  title: string
  description: string
  youtubeUrl: string
  category: VideoCategory
}

// 새 영상은 아래 목록에 링크와 5개 분야 중 하나를 지정하면 자동 표시됩니다.
export const SCIENCE_VIDEOS: ScienceVideo[] = [
  {
    title: "실험 기구 사용법 테스트 영상",
    description:
      "영상은 보내주신 구간인 10분 38초부터 재생됩니다. 재생 버튼을 눌러 사용법을 확인해 보세요.",
    youtubeUrl: "https://www.youtube.com/watch?v=weEileLXEuI&t=638s",
    category: "기구 사용법",
  },
]
