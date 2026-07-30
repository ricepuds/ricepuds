export const QUESTION_IMAGE_MAX_COUNT = 3
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const QUESTION_IMAGE_SOURCE_MAX_BYTES = 30 * 1024 * 1024
export const QUESTION_IMAGE_ACCEPT = "image/*"

const ALLOWED_SOURCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/jpeg_r",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
])
const ALLOWED_PREPARED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])
const GENERIC_SOURCE_IMAGE_TYPES = new Set(["", "application/octet-stream"])
const MAX_IMAGE_DIMENSION = 2048
const MAX_SOURCE_PIXEL_COUNT = 100_000_000
const SOURCE_DIMENSION_SCAN_BYTES = 2 * 1024 * 1024

interface ImageDimensions {
  height: number
  width: number
}

function normalizedFileType(file: File): string {
  return file.type.trim().toLowerCase()
}

export function validateQuestionImageSource(file: File): void {
  const type = normalizedFileType(file)
  const hasSupportedType = ALLOWED_SOURCE_IMAGE_TYPES.has(type)

  if (!hasSupportedType && !GENERIC_SOURCE_IMAGE_TYPES.has(type)) {
    throw new Error("JPG, PNG, WebP, AVIF, HEIC 사진만 첨부할 수 있습니다.")
  }
  if (file.size <= 0 || file.size > QUESTION_IMAGE_SOURCE_MAX_BYTES) {
    throw new Error("원본 사진은 한 장당 30MB 이하만 첨부할 수 있습니다.")
  }
}

export function validateQuestionImageFile(file: File): void {
  if (!ALLOWED_PREPARED_IMAGE_TYPES.has(normalizedFileType(file))) {
    throw new Error("사진을 안전한 업로드 형식으로 변환하지 못했습니다.")
  }
  if (file.size <= 0 || file.size > QUESTION_IMAGE_MAX_BYTES) {
    throw new Error("변환된 사진이 5MB를 초과합니다.")
  }
}

interface LoadedLocalImage {
  height: number
  release: () => void
  source: CanvasImageSource
  width: number
}

function validDimensions(
  width: number,
  height: number,
): ImageDimensions | null {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 100_000 ||
    height > 100_000
  ) {
    return null
  }
  return { width, height }
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ])
  let offset = 2
  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break

    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return validDimensions(
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      )
    }
    offset += segmentLength
  }
  return null
}

function pngDimensions(
  view: DataView,
  bytes: Uint8Array,
): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (
    bytes.length < 24 ||
    signature.some((value, index) => bytes[index] !== value)
  ) {
    return null
  }
  return validDimensions(view.getUint32(16), view.getUint32(20))
}

function webpDimensions(
  view: DataView,
  bytes: Uint8Array,
): ImageDimensions | null {
  const ascii = (offset: number, value: string) =>
    [...value].every(
      (character, index) => bytes[offset + index] === character.charCodeAt(0),
    )
  if (bytes.length < 30 || !ascii(0, "RIFF") || !ascii(8, "WEBP")) {
    return null
  }

  if (ascii(12, "VP8X")) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    return validDimensions(width, height)
  }
  if (
    ascii(12, "VP8 ") &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return validDimensions(
      view.getUint16(26, true) & 0x3fff,
      view.getUint16(28, true) & 0x3fff,
    )
  }
  if (ascii(12, "VP8L") && bytes[20] === 0x2f) {
    return validDimensions(
      1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    )
  }
  return null
}

function isoMediaDimensions(
  view: DataView,
  bytes: Uint8Array,
): ImageDimensions | null {
  let largest: ImageDimensions | null = null
  for (let offset = 4; offset + 16 < bytes.length; offset += 1) {
    if (
      bytes[offset] !== 0x69 ||
      bytes[offset + 1] !== 0x73 ||
      bytes[offset + 2] !== 0x70 ||
      bytes[offset + 3] !== 0x65
    ) {
      continue
    }
    const boxSize = view.getUint32(offset - 4)
    if (boxSize < 20 || offset - 4 + boxSize > bytes.length) continue
    const candidate = validDimensions(
      view.getUint32(offset + 8),
      view.getUint32(offset + 12),
    )
    if (
      candidate &&
      (!largest ||
        candidate.width * candidate.height > largest.width * largest.height)
    ) {
      largest = candidate
    }
  }
  return largest
}

async function readImageDimensions(
  file: File,
): Promise<ImageDimensions | null> {
  try {
    const buffer = await file
      .slice(0, Math.min(file.size, SOURCE_DIMENSION_SCAN_BYTES))
      .arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    return (
      pngDimensions(view, bytes) ??
      jpegDimensions(bytes) ??
      webpDimensions(view, bytes) ??
      isoMediaDimensions(view, bytes)
    )
  } catch {
    return null
  }
}

function isWebKitBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const userAgent = navigator.userAgent
  const isIOS = /(?:iPad|iPhone|iPod)/i.test(userAgent)
  const isTouchIPad =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  const isDesktopSafari =
    /AppleWebKit/i.test(userAgent) &&
    !/(?:Android|Chrome|Chromium|Edg|OPR)/i.test(userAgent)
  return isIOS || isTouchIPad || isDesktopSafari
}

async function loadLocalImage(
  file: File,
  url: string,
  dimensions: ImageDimensions | null,
): Promise<LoadedLocalImage> {
  if (typeof createImageBitmap === "function" && !isWebKitBrowser()) {
    try {
      const shouldResizeWhileDecoding =
        dimensions &&
        Math.max(dimensions.width, dimensions.height) > MAX_IMAGE_DIMENSION
      const resizeOptions: ImageBitmapOptions = {
        imageOrientation: "from-image",
      }
      if (shouldResizeWhileDecoding) {
        resizeOptions.resizeQuality = "high"
        if (dimensions.width >= dimensions.height) {
          resizeOptions.resizeWidth = MAX_IMAGE_DIMENSION
        } else {
          resizeOptions.resizeHeight = MAX_IMAGE_DIMENSION
        }
      }
      const bitmap = await createImageBitmap(file, resizeOptions)
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          height: bitmap.height,
          release: () => bitmap.close(),
          source: bitmap,
          width: bitmap.width,
        }
      }
      bitmap.close()
    } catch {
      // Some mobile browsers expose createImageBitmap but cannot decode HEIC.
      // The regular image decoder below is still worth trying.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () =>
      resolve({
        height: image.naturalHeight,
        release: () => {
          image.removeAttribute("src")
        },
        source: image,
        width: image.naturalWidth,
      })
    image.onerror = () =>
      reject(
        new Error(
          "이 기기에서 사진을 읽지 못했습니다. HEIC·AVIF 사진이라면 JPG 호환 형식으로 다시 선택해 주세요.",
        ),
      )
    image.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("사진을 안전한 형식으로 변환하지 못했습니다."))
      },
      type,
      quality,
    )
  })
}

async function encodeQuestionImage(canvas: HTMLCanvasElement): Promise<Blob> {
  const attempts: Array<{
    type: "image/webp" | "image/jpeg"
    quality: number
  }> = [
    { type: "image/webp", quality: 0.86 },
    { type: "image/webp", quality: 0.7 },
    { type: "image/jpeg", quality: 0.82 },
    { type: "image/jpeg", quality: 0.65 },
  ]

  let webpUnavailable = false
  for (const attempt of attempts) {
    if (attempt.type === "image/webp" && webpUnavailable) continue
    const blob = await canvasToBlob(canvas, attempt.type, attempt.quality)
    if (attempt.type === "image/webp" && blob.type !== "image/webp") {
      webpUnavailable = true
    }
    if (
      ALLOWED_PREPARED_IMAGE_TYPES.has(blob.type.toLowerCase()) &&
      blob.size > 0 &&
      blob.size <= QUESTION_IMAGE_MAX_BYTES
    ) {
      return blob
    }
  }

  throw new Error("변환된 사진이 5MB를 초과합니다.")
}

function extensionForImageType(type: string): string {
  if (type === "image/jpeg") return "jpg"
  if (type === "image/png") return "png"
  return "webp"
}

export async function prepareQuestionImageFile(file: File): Promise<File> {
  validateQuestionImageSource(file)

  const sourceDimensions = await readImageDimensions(file)
  if (
    sourceDimensions &&
    sourceDimensions.width * sourceDimensions.height > MAX_SOURCE_PIXEL_COUNT
  ) {
    throw new Error(
      "사진 해상도가 너무 큽니다. 크기를 줄인 뒤 다시 첨부해 주세요.",
    )
  }

  const sourceUrl = URL.createObjectURL(file)
  let image: LoadedLocalImage | null = null
  let canvas: HTMLCanvasElement | null = null
  try {
    image = await loadLocalImage(file, sourceUrl, sourceDimensions)
    const sourceWidth = image.width
    const sourceHeight = image.height
    if (!sourceWidth || !sourceHeight) {
      throw new Error("사진의 크기를 확인하지 못했습니다.")
    }
    if (sourceWidth * sourceHeight > MAX_SOURCE_PIXEL_COUNT) {
      throw new Error(
        "사진 해상도가 너무 큽니다. 크기를 줄인 뒤 다시 첨부해 주세요.",
      )
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight),
    )
    canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))

    const context = canvas.getContext("2d")
    if (!context) throw new Error("사진을 처리하지 못했습니다.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height)

    const output = await encodeQuestionImage(canvas)
    const outputType = output.type.toLowerCase()

    const preparedFile = new File(
      [output],
      `question-image.${extensionForImageType(outputType)}`,
      {
        type: outputType,
        lastModified: Date.now(),
      },
    )
    validateQuestionImageFile(preparedFile)
    return preparedFile
  } finally {
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    image?.release()
    URL.revokeObjectURL(sourceUrl)
  }
}
