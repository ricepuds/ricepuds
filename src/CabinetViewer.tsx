import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

export interface CabinetViewerItem {
  id: string
  area: string
  category: string
  location: string
}

export interface CabinetViewerProps {
  item: CabinetViewerItem
}

type StorageZone = "upper" | "lower" | "drawer" | "level"

interface CabinetLayout {
  prefix: string
  count: number
  basketColor: number
}

interface StorageModel extends CabinetLayout {
  area: string
  cabinetNumber: number
  zone: StorageZone
  level: number
}

interface Disposable {
  dispose?: () => void
}

type ThreeConstructor = new (...args: any[]) => any

interface ThreeNamespace {
  Scene: ThreeConstructor
  PerspectiveCamera: ThreeConstructor
  WebGLRenderer: ThreeConstructor
  Group: ThreeConstructor
  HemisphereLight: ThreeConstructor
  DirectionalLight: ThreeConstructor
  MeshStandardMaterial: ThreeConstructor
  Mesh: ThreeConstructor
  BoxGeometry: ThreeConstructor
  CanvasTexture: ThreeConstructor
  SpriteMaterial: ThreeConstructor
  Sprite: ThreeConstructor
}

const CABINET_LAYOUTS: Record<string, CabinetLayout> = {
  화학실: { prefix: "화", count: 6, basketColor: 0xf2c73a },
  생명실: { prefix: "생", count: 5, basketColor: 0xb73532 },
  준비실: { prefix: "준", count: 11, basketColor: 0xf2c73a },
  시약: { prefix: "시약", count: 4, basketColor: 0x4a8bbd },
}

const DEFAULT_LAYOUT = CABINET_LAYOUTS.준비실

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getStorageModel(item: CabinetViewerItem): StorageModel {
  const baseLayout = CABINET_LAYOUTS[item.area] ?? DEFAULT_LAYOUT
  const searchText = `${item.location || ""} ${item.category || ""} ${item.id || ""}`
  let prefix = baseLayout.prefix
  let count = baseLayout.count
  let cabinetNumber = 1

  if (item.area === "시약") {
    const letter = String(item.category || "").match(/[A-Z]/i)?.[0] ?? "A"
    cabinetNumber = ((letter.toUpperCase().charCodeAt(0) - 65) % count) + 1
  } else if (item.area === "준비실" && searchText.includes("중앙")) {
    prefix = "중앙"
    count = 3
    cabinetNumber = Number(searchText.match(/중앙\s*(\d+)/)?.[1]) || 1
  } else {
    const locationMatch = searchText.match(new RegExp(`${escapeRegExp(prefix)}\\s*(\\d+)`))
    cabinetNumber = Number(locationMatch?.[1]) || 1
  }

  cabinetNumber = clamp(cabinetNumber, 1, count)

  const floorMatch = searchText.match(/(\d+)층/)
  let zone: StorageZone = "upper"

  if (searchText.includes("아래")) {
    zone = "lower"
  } else if (searchText.includes("서랍")) {
    zone = "drawer"
  } else if (floorMatch) {
    zone = "level"
  }

  return {
    area: item.area,
    prefix,
    count,
    cabinetNumber,
    zone,
    level: Number(floorMatch?.[1]) || 0,
    basketColor: baseLayout.basketColor,
  }
}

function getVisibleCabinetRange(model: StorageModel) {
  const visibleCount = Math.min(model.count, 6)
  const maxStart = Math.max(1, model.count - visibleCount + 1)
  const start = Math.min(
    Math.max(1, model.cabinetNumber - Math.floor(visibleCount / 2)),
    maxStart,
  )

  return { start, visibleCount }
}

function getZoneSettings(model: StorageModel) {
  if (model.zone === "lower") {
    return { y: -0.92, height: 0.92 }
  }

  if (model.zone === "drawer") {
    return { y: -0.32, height: 0.34 }
  }

  if (model.zone === "level") {
    const level = clamp(model.level || 1, 1, 5)
    return { y: 1.2 - (level - 1) * 0.43, height: 0.32 }
  }

  return { y: 0.54, height: 1.5 }
}

function getZoneLabel(model: StorageModel) {
  if (model.zone === "lower") {
    return "아래 수납장"
  }

  if (model.zone === "drawer") {
    return "서랍"
  }

  if (model.zone === "level") {
    return `${clamp(model.level || 1, 1, 5)}층`
  }

  return "상단 수납장"
}

function getThree(): ThreeNamespace | undefined {
  if (typeof window === "undefined") {
    return undefined
  }

  return (window as Window & { THREE?: ThreeNamespace }).THREE
}

let threeRuntimePromise: Promise<ThreeNamespace> | null = null

function loadThree(): Promise<ThreeNamespace> {
  const existing = getThree()

  if (existing) return Promise.resolve(existing)

  if (!threeRuntimePromise) {
    threeRuntimePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = import.meta.env.BASE_URL + "vendor/three.min.js"
      script.async = true

      const fail = (message: string) => {
        script.remove()
        threeRuntimePromise = null
        reject(new Error(message))
      }

      script.onload = () => {
        const loaded = getThree()
        if (!loaded) {
          fail("Three.js did not expose window.THREE")
          return
        }

        resolve(loaded)
      }

      script.onerror = () => fail("Failed to load Three.js")
      document.head.appendChild(script)
    })
  }

  return threeRuntimePromise
}

function createCabinetViewer(
  container: HTMLDivElement,
  model: StorageModel,
  three: ThreeNamespace,
) {
  let renderer: any
  let resizeObserver: ResizeObserver | undefined
  let animationFrame = 0
  let disposed = false
  let activePointerId: number | null = null
  const resources = new Set<Disposable>()

  const track = <T extends Disposable>(resource: T) => {
    resources.add(resource)
    return resource
  }

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    cancelAnimationFrame(animationFrame)
    resizeObserver?.disconnect()
    container.removeEventListener("pointerdown", handlePointerDown)
    container.removeEventListener("pointermove", handlePointerMove)
    container.removeEventListener("pointerup", handlePointerEnd)
    container.removeEventListener("pointercancel", handlePointerEnd)
    container.removeEventListener("lostpointercapture", handleLostPointerCapture)

    if (
      activePointerId !== null &&
      container.hasPointerCapture?.(activePointerId)
    ) {
      container.releasePointerCapture(activePointerId)
    }

    activePointerId = null
    container.style.cursor = ""

    resources.forEach((resource) => resource.dispose?.())
    resources.clear()

    if (renderer) {
      renderer.renderLists?.dispose?.()
      renderer.dispose?.()
      const canvas = renderer.domElement as HTMLCanvasElement | undefined
      if (canvas?.parentNode === container) {
        container.removeChild(canvas)
      }
    }
  }

  let targetRotation = -0.18
  let dragStartX = 0
  let startRotation = targetRotation

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return
    }

    activePointerId = event.pointerId
    dragStartX = event.clientX
    startRotation = targetRotation
    container.style.cursor = "grabbing"
    container.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent) {
    if (activePointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    targetRotation = clamp(
      startRotation + (event.clientX - dragStartX) * 0.01,
      -1.2,
      1.2,
    )
  }

  function handlePointerEnd(event: PointerEvent) {
    if (activePointerId !== event.pointerId) {
      return
    }

    if (container.hasPointerCapture?.(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }

    activePointerId = null
    container.style.cursor = "grab"
  }

  function handleLostPointerCapture(event: PointerEvent) {
    if (activePointerId === event.pointerId) {
      activePointerId = null
      container.style.cursor = "grab"
    }
  }

  try {
    const scene = new three.Scene()
    const camera = new three.PerspectiveCamera(36, 1, 0.1, 100)
    renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
    const group = new three.Group()
    const unitWidth = 0.86
    const unitGap = 0.08
    const cabinetHeight = 3
    const range = getVisibleCabinetRange(model)
    const cabinetNumbers =
      model.area === "준비실" && model.prefix === "준"
        ? Array.from({ length: model.count }, (_, index) => index + 1)
        : Array.from(
            { length: range.visibleCount },
            (_, index) => range.start + index,
          )
    const totalWidth =
      cabinetNumbers.length * unitWidth +
      Math.max(0, cabinetNumbers.length - 1) * unitGap

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.className = "cabinet-canvas"
    renderer.domElement.setAttribute("aria-hidden", "true")
    Object.assign(renderer.domElement.style, {
      display: "block",
      height: "100%",
      touchAction: "none",
      width: "100%",
    })
    container.append(renderer.domElement)

    camera.position.set(0, 0.25, 9)
    camera.lookAt(0, 0.02, 0)
    scene.add(new three.HemisphereLight(0xffffff, 0x273747, 1.45))

    const keyLight = new three.DirectionalLight(0xffffff, 1.6)
    keyLight.position.set(3.5, 5, 4)
    scene.add(keyLight)

    group.rotation.x = -0.05
    scene.add(group)

    const materials = {
      body: track(
        new three.MeshStandardMaterial({
          color: 0xe7e8e2,
          roughness: 0.46,
          metalness: 0.08,
        }),
      ),
      side: track(
        new three.MeshStandardMaterial({
          color: 0xcfd4d5,
          roughness: 0.55,
          metalness: 0.06,
        }),
      ),
      glass: track(
        new three.MeshStandardMaterial({
          color: 0xc8edf8,
          roughness: 0.05,
          metalness: 0.02,
          transparent: true,
          opacity: 0.32,
        }),
      ),
      shadowGlass: track(
        new three.MeshStandardMaterial({
          color: 0x17222c,
          roughness: 0.72,
          transparent: true,
          opacity: 0.36,
        }),
      ),
      handle: track(
        new three.MeshStandardMaterial({
          color: 0x949994,
          roughness: 0.38,
          metalness: 0.48,
        }),
      ),
      lower: track(
        new three.MeshStandardMaterial({
          color: 0xe3e2da,
          roughness: 0.5,
          metalness: 0.06,
        }),
      ),
      shelf: track(
        new three.MeshStandardMaterial({
          color: 0xd2d8d9,
          roughness: 0.5,
          metalness: 0.08,
        }),
      ),
      highlight: track(
        new three.MeshStandardMaterial({
          color: 0xf0b942,
          emissive: 0x8b5f00,
          emissiveIntensity: 0.45,
          roughness: 0.35,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        }),
      ),
      floor: track(
        new three.MeshStandardMaterial({
          color: 0x263747,
          roughness: 0.85,
          transparent: true,
          opacity: 0.48,
        }),
      ),
    }

    const makeBox = (
      width: number,
      height: number,
      depth: number,
      material: any,
      x: number,
      y: number,
      z: number,
    ) => {
      const geometry = track(new three.BoxGeometry(width, height, depth))
      const mesh = new three.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      return mesh
    }

    const makeTextSprite = (text: string, active: boolean) => {
      const canvas = document.createElement("canvas")
      canvas.width = 256
      canvas.height = 96

      const context = canvas.getContext("2d")
      if (!context) {
        throw new Error("Cabinet label canvas is unavailable")
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = active ? "#f0b942" : "#ffffff"
      context.font = "700 42px Malgun Gothic, sans-serif"
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillText(text, canvas.width / 2, canvas.height / 2)

      const texture = track(new three.CanvasTexture(canvas))
      const material = track(
        new three.SpriteMaterial({ map: texture, transparent: true }),
      )
      const sprite = new three.Sprite(material)
      sprite.scale.set(0.58, 0.22, 1)
      return sprite
    }

    const addCabinet = (x: number, number: number, isActive: boolean) => {
      const basketMaterial = track(
        new three.MeshStandardMaterial({
          color: isActive ? 0xf0b942 : model.basketColor,
          roughness: 0.62,
          metalness: 0.03,
        }),
      )

      group.add(
        makeBox(unitWidth, cabinetHeight, 0.56, materials.body, x, 0, 0),
      )
      group.add(
        makeBox(
          unitWidth - 0.16,
          1.5,
          0.58,
          materials.shadowGlass,
          x,
          0.54,
          0.03,
        ),
      )
      group.add(
        makeBox(
          unitWidth - 0.22,
          1.42,
          0.035,
          materials.glass,
          x,
          0.54,
          0.31,
        ),
      )
      group.add(
        makeBox(
          unitWidth - 0.14,
          0.92,
          0.05,
          materials.lower,
          x,
          -0.96,
          0.32,
        ),
      )
      group.add(
        makeBox(
          0.055,
          cabinetHeight + 0.05,
          0.62,
          materials.side,
          x - unitWidth / 2,
          0,
          0.02,
        ),
      )
      group.add(
        makeBox(
          0.055,
          cabinetHeight + 0.05,
          0.62,
          materials.side,
          x + unitWidth / 2,
          0,
          0.02,
        ),
      )
      group.add(
        makeBox(
          unitWidth + 0.04,
          0.055,
          0.62,
          materials.side,
          x,
          1.5,
          0.02,
        ),
      )
      group.add(
        makeBox(
          unitWidth + 0.04,
          0.055,
          0.62,
          materials.side,
          x,
          -1.5,
          0.02,
        ),
      )
      group.add(
        makeBox(
          unitWidth - 0.1,
          0.045,
          0.58,
          materials.shelf,
          x,
          0.12,
          0.02,
        ),
      )
      group.add(
        makeBox(
          unitWidth - 0.1,
          0.045,
          0.58,
          materials.shelf,
          x,
          0.83,
          0.02,
        ),
      )

      ;[-0.18, 0.52, 1.08].forEach((y) => {
        group.add(
          makeBox(
            unitWidth - 0.24,
            0.2,
            0.38,
            basketMaterial,
            x,
            y,
            0.02,
          ),
        )
      })

      group.add(
        makeBox(
          0.055,
          0.48,
          0.035,
          materials.handle,
          x + unitWidth * 0.34,
          -0.93,
          0.36,
        ),
      )
      group.add(
        makeBox(
          0.045,
          0.44,
          0.035,
          materials.handle,
          x + unitWidth * 0.34,
          0.22,
          0.36,
        ),
      )

      if (isActive) {
        const zone = getZoneSettings(model)
        group.add(
          makeBox(
            unitWidth - 0.08,
            zone.height,
            0.09,
            materials.highlight,
            x,
            zone.y,
            0.42,
          ),
        )
      }

      const label = makeTextSprite(`${model.prefix}${number}`, isActive)
      label.position.set(x, 1.76, 0.44)
      group.add(label)
    }

    const floor = makeBox(
      totalWidth + 0.8,
      0.035,
      1.35,
      materials.floor,
      0,
      -1.54,
      0.1,
    )
    group.add(floor)

    cabinetNumbers.forEach((number, index) => {
      const x =
        -totalWidth / 2 +
        unitWidth / 2 +
        index * (unitWidth + unitGap)
      addCabinet(x, number, number === model.cabinetNumber)
    })

    targetRotation =
      model.area === "준비실" && model.prefix === "준"
        ? 0.16
        : model.cabinetNumber % 2 === 0
          ? -0.28
          : 0.22

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const aspect = width / height
      const verticalFieldOfView = (36 * Math.PI) / 180
      const distanceForWidth =
        (totalWidth + 0.8) /
        (2 * Math.tan(verticalFieldOfView / 2) * Math.max(aspect, 0.1))
      const cameraDistance = Math.max(7.2, distanceForWidth + 0.8)

      renderer.setSize(width, height, false)
      camera.aspect = aspect
      camera.position.set(0, 0.25, cameraDistance)
      camera.lookAt(0, 0.02, 0)
      camera.updateProjectionMatrix()
    }

    const animate = () => {
      if (disposed) {
        return
      }

      group.rotation.y += (targetRotation - group.rotation.y) * 0.075
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(animate)
    }

    container.style.cursor = "grab"
    container.addEventListener("pointerdown", handlePointerDown)
    container.addEventListener("pointermove", handlePointerMove)
    container.addEventListener("pointerup", handlePointerEnd)
    container.addEventListener("pointercancel", handlePointerEnd)
    container.addEventListener(
      "lostpointercapture",
      handleLostPointerCapture,
    )

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()
    animationFrame = requestAnimationFrame(animate)
  } catch (error) {
    dispose()
    throw error
  }

  return dispose
}

function CabinetFallback({
  item,
  model,
}: {
  item: CabinetViewerItem
  model: StorageModel
}) {
  const range = getVisibleCabinetRange(model)
  const cabinetNumbers = Array.from(
    { length: range.visibleCount },
    (_, index) => range.start + index,
  )
  const zone = getZoneSettings(model)
  const highlightTop = clamp(
    ((1.5 - (zone.y + zone.height / 2)) / 3) * 100,
    0,
    100,
  )
  const highlightHeight = clamp((zone.height / 3) * 100, 4, 100)

  return (
    <div
      aria-label={`${item.area} ${model.prefix}${model.cabinetNumber} ${getZoneLabel(model)} 위치`}
      role="img"
      style={{
        alignItems: "flex-end",
        background:
          "linear-gradient(180deg, rgba(223,235,244,0.96), rgba(244,246,248,0.98))",
        border: "1px solid rgba(60,60,67,0.12)",
        borderRadius: 16,
        display: "flex",
        gap: 7,
        minHeight: 226,
        overflowX: "auto",
        padding: "34px 14px 18px",
      }}
    >
      {cabinetNumbers.map((number) => {
        const isActive = number === model.cabinetNumber

        return (
          <div
            key={number}
            style={{
              background: "#d5d9d8",
              border: isActive
                ? "2px solid #f0b942"
                : "1px solid rgba(60,60,67,0.2)",
              borderRadius: "5px 5px 3px 3px",
              boxShadow: isActive
                ? "0 0 0 3px rgba(240,185,66,0.2), 0 10px 22px rgba(60,60,67,0.14)"
                : "0 8px 18px rgba(60,60,67,0.1)",
              flex: "1 0 48px",
              height: 158,
              maxWidth: 82,
              minWidth: 48,
              padding: 4,
              position: "relative",
            }}
          >
            <strong
              style={{
                color: isActive ? "#8a5b00" : "#3c3c43",
                fontSize: 11,
                left: "50%",
                position: "absolute",
                top: -23,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {model.prefix}
              {number}
            </strong>
            <span
              aria-hidden="true"
              style={{
                background:
                  "linear-gradient(135deg, rgba(199,235,247,0.7), rgba(39,55,71,0.36))",
                border: "1px solid rgba(255,255,255,0.72)",
                borderRadius: 2,
                display: "block",
                height: "64%",
                position: "relative",
              }}
            >
              <span
                style={{
                  background: "rgba(220,226,227,0.9)",
                  height: 2,
                  left: 0,
                  position: "absolute",
                  right: 0,
                  top: "48%",
                }}
              />
              <span
                style={{
                  background: "rgba(220,226,227,0.9)",
                  height: 2,
                  left: 0,
                  position: "absolute",
                  right: 0,
                  top: "74%",
                }}
              />
            </span>
            <span
              aria-hidden="true"
              style={{
                background: "#e8e7df",
                borderRadius: 2,
                bottom: 4,
                display: "block",
                height: "31%",
                left: 4,
                position: "absolute",
                right: 4,
              }}
            />
            {isActive && (
              <span
                aria-hidden="true"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(240,185,66,0.52), rgba(255,213,112,0.78))",
                  border: "1px solid rgba(171,105,0,0.48)",
                  borderRadius: 3,
                  boxShadow: "0 0 14px rgba(240,185,66,0.62)",
                  height: `${highlightHeight}%`,
                  left: 3,
                  position: "absolute",
                  right: 3,
                  top: `${highlightTop}%`,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CabinetViewer({ item }: CabinetViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const model = useMemo(
    () => getStorageModel(item),
    [item.area, item.category, item.id, item.location],
  )
  const runtimeKey = `${item.area}\u0000${item.category}\u0000${item.id}\u0000${item.location}`
  const [failedRuntimeKey, setFailedRuntimeKey] = useState<string | null>(null)
  const [three, setThree] = useState<ThreeNamespace | undefined>(() =>
    getThree(),
  )
  const useThree = Boolean(three) && failedRuntimeKey !== runtimeKey

  useEffect(() => {
    let cancelled = false

    if (three || failedRuntimeKey === runtimeKey) return

    void loadThree()
      .then((runtime) => {
        if (!cancelled) setThree(runtime)
      })
      .catch(() => {
        if (!cancelled) setFailedRuntimeKey(runtimeKey)
      })

    return () => {
      cancelled = true
    }
  }, [failedRuntimeKey, runtimeKey, three])

  useEffect(() => {
    const container = hostRef.current

    if (!container || !useThree || !three) {
      return
    }

    try {
      return createCabinetViewer(container, model, three)
    } catch {
      setFailedRuntimeKey(runtimeKey)
      return
    }
  }, [model, runtimeKey, three, useThree])

  const frameStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(226,237,246,0.94), rgba(245,247,249,0.98))",
    border: "1px solid rgba(60,60,67,0.12)",
    borderRadius: 16,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
    height: 260,
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
    width: "100%",
  }

  return (
    <section
      aria-label="물품 보관 위치"
      style={{
        display: "grid",
        gap: 10,
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              color: "#8e8e93",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              margin: "0 0 3px",
              textTransform: "uppercase",
            }}
          >
            Storage location
          </p>
          <strong style={{ color: "#1c1c1e", fontSize: 16 }}>
            {item.area} · {model.prefix}
            {model.cabinetNumber}
          </strong>
        </div>
        <span
          style={{
            background: "rgba(240,185,66,0.16)",
            borderRadius: 999,
            color: "#8a5b00",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 9px",
          }}
        >
          {getZoneLabel(model)}
        </span>
      </div>

      {useThree ? (
        <div
          aria-label={`${model.prefix}${model.cabinetNumber}의 ${getZoneLabel(model)}가 금색으로 표시된 3D 보관함. 좌우로 드래그해 회전할 수 있습니다.`}
          ref={hostRef}
          role="img"
          style={frameStyle}
        />
      ) : (
        <CabinetFallback item={item} model={model} />
      )}

      <p
        style={{
          color: "#6c6c70",
          fontSize: 12,
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        금색 표시가 실제 보관 위치입니다.
        {item.location ? ` 기록 위치: ${item.location}.` : ""}
        {useThree ? " 좌우로 드래그해 보관함을 돌려볼 수 있습니다." : ""}
      </p>
    </section>
  )
}
