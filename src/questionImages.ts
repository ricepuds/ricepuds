export const QUESTION_IMAGE_MAX_COUNT = 3
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const QUESTION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])
const MAX_IMAGE_DIMENSION = 2400

export function validateQuestionImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error("JPG, PNG, WebP 사진만 첨부할 수 있습니다.")
  }
  if (file.size <= 0 || file.size > QUESTION_IMAGE_MAX_BYTES) {
    throw new Error("사진은 한 장당 5MB 이하만 첨부할 수 있습니다.")
  }
}

function loadLocalImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("사진을 읽지 못했습니다."))
    image.src = url
  })
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === "image/webp") resolve(blob)
        else reject(new Error("사진을 안전한 형식으로 변환하지 못했습니다."))
      },
      "image/webp",
      quality,
    )
  })
}

export async function prepareQuestionImageFile(file: File): Promise<File> {
  validateQuestionImageFile(file)

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await loadLocalImage(sourceUrl)
    const sourceWidth = image.naturalWidth
    const sourceHeight = image.naturalHeight
    if (!sourceWidth || !sourceHeight) {
      throw new Error("사진의 크기를 확인하지 못했습니다.")
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight),
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))

    const context = canvas.getContext("2d")
    if (!context) throw new Error("사진을 처리하지 못했습니다.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    let output = await canvasToWebp(canvas, 0.88)
    if (output.size > QUESTION_IMAGE_MAX_BYTES) {
      output = await canvasToWebp(canvas, 0.72)
    }
    if (output.size <= 0 || output.size > QUESTION_IMAGE_MAX_BYTES) {
      throw new Error("변환된 사진이 5MB를 초과합니다.")
    }

    return new File([output], "question-image.webp", {
      type: "image/webp",
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
