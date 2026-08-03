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
  {
    title: "메틸렌 블루 산화-환원 실험",
    description: "메틸렌 블루의 산화·환원 반응을 관찰하는 실험 영상입니다.",
    youtubeUrl: "https://youtube.com/shorts/ei-ohtDlbk0?feature=share",
    category: "화학",
  },
  {
    title: "이중슬릿 실험",
    description: "이중슬릿을 통해 빛의 간섭 무늬를 확인하는 실험 영상입니다.",
    youtubeUrl: "https://youtube.com/shorts/wOuT6JEw3m8?feature=share",
    category: "물리",
  },
  {
    title: "다이오드 실험",
    description: "다이오드의 정류 특성을 확인하는 실험 영상입니다.",
    youtubeUrl: "https://youtube.com/shorts/Gmb1DiVV7lU?feature=share",
    category: "물리",
  },
  {
    title: "중화 적정 실험",
    description: "산과 염기의 중화 적정을 통해 종말점을 확인하는 실험 영상입니다.",
    youtubeUrl: "https://youtube.com/shorts/s97UQajLo4Q?feature=share",
    category: "화학",
  },
  {
    title: "운동량 보존 법칙 확인 실험",
    description: "충돌 전후의 운동량을 비교해 운동량 보존 법칙을 확인하는 실험 영상입니다.",
    youtubeUrl: "https://youtube.com/shorts/uAbSUR9OWas?feature=share",
    category: "물리",
  },
]
