export type EquipmentVideo = {
  title: string
  description: string
  youtubeUrl: string
  category: string
}

// 새 영상은 이 목록에 링크와 안내 문구를 추가하면 영상 페이지에 자동 표시됩니다.
export const EQUIPMENT_VIDEOS: EquipmentVideo[] = [
  {
    title: "실험 기구 사용법 테스트 영상",
    description:
      "영상은 보내주신 구간인 10분 38초부터 재생됩니다. 재생 버튼을 눌러 사용법을 확인해 보세요.",
    youtubeUrl: "https://www.youtube.com/watch?v=weEileLXEuI&t=638s",
    category: "사용법 영상",
  },
]
