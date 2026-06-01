const soonLinks = document.querySelectorAll("[data-soon]");
const openPrepLinks = document.querySelectorAll("[data-open-prep]");
const reservationOpenLinks = document.querySelectorAll("[data-reservation-open]");
const reservationModal = document.querySelector("#reservation-modal");
const reservationCloseButtons = document.querySelectorAll("[data-reservation-close]");
const reservationForm = document.querySelector("#reservation-form");
const reservationDateInput = document.querySelector("#reservation-date");
const reservationAdminPanel = document.querySelector("#reservation-admin-panel");
const reservationList = document.querySelector("#reservation-list");
const reservationClearButton = document.querySelector("#reservation-clear-btn");
const itemDetailModal = document.querySelector("#item-detail-modal");
const itemDetailCloseButtons = document.querySelectorAll("[data-item-detail-close]");
const spaceCards = document.querySelectorAll("[data-space-card]");
const areaNavLinks = document.querySelectorAll("[data-area-nav]");
const adminAreaButtons = document.querySelectorAll("[data-admin-area]");
const prepRoom = document.querySelector("#prep-room");
const closePrepButton = document.querySelector("#close-prep");
const themeToggleButtons = document.querySelectorAll("[data-theme-toggle]");
const toast = document.querySelector(".toast");
const categoryList = document.querySelector("#category-list");
const categoryTitle = document.querySelector("[data-category-title]");
const statusFilter = document.querySelector("[data-status-filter]");
const statusChips = document.querySelectorAll("[data-status]");
const sortButtons = document.querySelectorAll("[data-sort]");
const searchInput = document.querySelector("#reagent-search");
const searchButton = document.querySelector("#search-button");
const resetFiltersButton = document.querySelector("#reset-filters");
const tableBody = document.querySelector("#reagent-table-body");
const emptyState = document.querySelector("#empty-state");
const visibleCount = document.querySelector("#visible-count");
const totalReagents = document.querySelector("#total-reagents");
const toxicReagents = document.querySelector("#toxic-reagents");
const lowReagents = document.querySelector("#low-reagents");
const itemInspector = document.querySelector("#item-inspector");
const inspectorArea = document.querySelector("#inspector-area");
const inspectorName = document.querySelector("#inspector-name");
const inspectorCategory = document.querySelector("#inspector-category");
const inspectorLocation = document.querySelector("#inspector-location");
const inspectorQuantity = document.querySelector("#inspector-quantity");
const inspectorStatus = document.querySelector("#inspector-status");
const inspectorDetailText = document.querySelector("#inspector-detail-text");
const inspectorSource = document.querySelector("#inspector-source");
const cabinetScene = document.querySelector("#cabinet-scene");

const baseReagents = Array.isArray(window.REAGENTS) ? window.REAGENTS : [];
const labItems = Array.isArray(window.LAB_ITEMS) ? window.LAB_ITEMS : [];
const AREA_ORDER = ["시약", "화학실", "생명실", "준비실", "전체"];
const AREA_LABELS = {
  시약: "시약",
  화학실: "화학실",
  생명실: "생명실",
  준비실: "준비실",
  전체: "전체",
};
const CABINET_LAYOUTS = {
  화학실: { prefix: "화", count: 6, basketColor: 0xf2c73a },
  생명실: { prefix: "생", count: 5, basketColor: 0xb73532 },
  준비실: { prefix: "준", count: 11, basketColor: 0xf2c73a },
  시약: { prefix: "시약", count: 4, basketColor: 0x4a8bbd },
};
const filterState = {
  area: "시약",
  category: "all",
  status: "all",
  sort: "id",
  query: "",
};
let inventoryItems = [];
let toastTimer;
let selectedItemId = "";
let cabinetViewer;

try {
  if (!history.state) {
    history.replaceState({ view: "home" }, "", window.location.href.split("#")[0]);
  }
} catch {
  // History updates can be restricted in some local-file contexts.
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatNumber(value) {
  if (value === "" || value === null || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRemainingRatio(reagent) {
  const initial = Number(reagent.initialAmount);
  const remaining = Number(reagent.remainingAmount);

  if (!Number.isFinite(initial) || initial <= 0 || !Number.isFinite(remaining)) {
    return 1;
  }

  return remaining / initial;
}

function isLowStock(reagent) {
  const remaining = Number(reagent.remainingAmount);
  return getRemainingRatio(reagent) <= 0.2 || (Number.isFinite(remaining) && remaining > 0 && remaining <= 50);
}

function getStatusLabel(item) {
  if (item.area !== "시약") {
    return "보관";
  }

  if (item.toxic) {
    return "유독";
  }

  if (item.lowStock) {
    return "부족";
  }

  return "보통";
}

function getStatusClass(item) {
  if (item.area !== "시약") {
    return "";
  }

  if (item.toxic) {
    return "toxic";
  }

  if (item.lowStock) {
    return "low";
  }

  return "";
}

function getDetailText(item) {
  if (item.area === "시약") {
    return `${item.detail}${item.formula && item.formula !== "-" ? ` · ${item.formula}` : ""}`;
  }

  return item.detail || "상세 정보 없음";
}

function getVisibleCabinetRange(model) {
  const visibleCount = Math.min(model.count, 6);
  const maxStart = Math.max(1, model.count - visibleCount + 1);
  const start = Math.min(Math.max(1, model.cabinetNumber - Math.floor(visibleCount / 2)), maxStart);

  return { start, visibleCount };
}

function getStorageModel(item) {
  const baseLayout = CABINET_LAYOUTS[item.area] || CABINET_LAYOUTS.준비실;
  const searchText = `${item.location || ""} ${item.category || ""} ${item.id || ""}`;
  let prefix = baseLayout.prefix;
  let count = baseLayout.count;
  let cabinetNumber = 1;

  if (item.area === "시약") {
    const letter = String(item.category || "").match(/[A-Z]/i)?.[0] || "A";
    cabinetNumber = ((letter.toUpperCase().charCodeAt(0) - 65) % count) + 1;
  } else if (item.area === "준비실" && searchText.includes("중앙")) {
    prefix = "중앙";
    count = 3;
    cabinetNumber = Number(searchText.match(/중앙\s*(\d+)/)?.[1]) || 1;
  } else {
    const locationMatch = searchText.match(new RegExp(`${prefix}\\s*(\\d+)`));
    cabinetNumber = Number(locationMatch?.[1]) || 1;
  }

  cabinetNumber = Math.min(Math.max(cabinetNumber, 1), count);

  const floorMatch = searchText.match(/(\d+)층/);
  let zone = "upper";

  if (searchText.includes("아래")) {
    zone = "lower";
  } else if (searchText.includes("서랍")) {
    zone = "drawer";
  } else if (floorMatch) {
    zone = "level";
  }

  return {
    area: item.area,
    prefix,
    count,
    cabinetNumber,
    zone,
    level: Number(floorMatch?.[1]) || 0,
    basketColor: baseLayout.basketColor,
  };
}

function getZoneSettings(model) {
  if (model.zone === "lower") {
    return { y: -0.92, height: 0.92 };
  }

  if (model.zone === "drawer") {
    return { y: -0.32, height: 0.34 };
  }

  if (model.zone === "level") {
    const level = Math.min(Math.max(model.level || 1, 1), 5);
    return { y: 1.2 - (level - 1) * 0.43, height: 0.32 };
  }

  return { y: 0.54, height: 1.5 };
}

function renderCabinetFallback(model) {
  if (!cabinetScene) {
    return;
  }

  const range = getVisibleCabinetRange(model);
  const cabinets = Array.from({ length: range.visibleCount }, (_, index) => range.start + index);

  cabinetScene.innerHTML = `
    <div class="cabinet-fallback" data-zone="${escapeHtml(model.zone)}">
      ${cabinets.map((number) => `
        <span class="fallback-cabinet ${number === model.cabinetNumber ? "is-active" : ""}">
          <span class="fallback-glass"></span>
          <span class="fallback-shelf"></span>
          <span class="fallback-lower"></span>
          <strong>${escapeHtml(model.prefix)}${number}</strong>
        </span>
      `).join("")}
    </div>
  `;
}

function createCabinetViewer(container) {
  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const group = new THREE.Group();
  const unitWidth = 0.86;
  const unitGap = 0.08;
  const cabinetHeight = 3;
  let targetRotation = -0.18;
  let isDragging = false;
  let dragStartX = 0;
  let startRotation = targetRotation;

  container.innerHTML = "";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "cabinet-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.append(renderer.domElement);

  camera.position.set(0, 0.25, 9);
  camera.lookAt(0, 0.02, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x273747, 1.45));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(3.5, 5, 4);
  scene.add(keyLight);

  group.rotation.x = -0.05;
  scene.add(group);

  const materials = {
    body: new THREE.MeshStandardMaterial({ color: 0xe7e8e2, roughness: 0.46, metalness: 0.08 }),
    side: new THREE.MeshStandardMaterial({ color: 0xcfd4d5, roughness: 0.55, metalness: 0.06 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xc8edf8,
      roughness: 0.05,
      metalness: 0.02,
      transparent: true,
      opacity: 0.32,
    }),
    shadowGlass: new THREE.MeshStandardMaterial({
      color: 0x17222c,
      roughness: 0.72,
      transparent: true,
      opacity: 0.36,
    }),
    handle: new THREE.MeshStandardMaterial({ color: 0x949994, roughness: 0.38, metalness: 0.48 }),
    lower: new THREE.MeshStandardMaterial({ color: 0xe3e2da, roughness: 0.5, metalness: 0.06 }),
    shelf: new THREE.MeshStandardMaterial({ color: 0xd2d8d9, roughness: 0.5, metalness: 0.08 }),
    highlight: new THREE.MeshStandardMaterial({
      color: 0xf0b942,
      emissive: 0x8b5f00,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x263747,
      roughness: 0.85,
      transparent: true,
      opacity: 0.48,
    }),
  };

  function makeBox(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function makeTextSprite(text, active) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 96;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = active ? "#f0b942" : "#ffffff";
    context.font = "700 42px Malgun Gothic, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.58, 0.22, 1);
    return sprite;
  }

  function addCabinet(x, number, model, isActive) {
    const basketMaterial = new THREE.MeshStandardMaterial({
      color: isActive ? 0xf0b942 : model.basketColor,
      roughness: 0.62,
      metalness: 0.03,
    });

    group.add(makeBox(unitWidth, cabinetHeight, 0.56, materials.body, x, 0, 0));
    group.add(makeBox(unitWidth - 0.16, 1.5, 0.58, materials.shadowGlass, x, 0.54, 0.03));
    group.add(makeBox(unitWidth - 0.22, 1.42, 0.035, materials.glass, x, 0.54, 0.31));
    group.add(makeBox(unitWidth - 0.14, 0.92, 0.05, materials.lower, x, -0.96, 0.32));
    group.add(makeBox(0.055, cabinetHeight + 0.05, 0.62, materials.side, x - unitWidth / 2, 0, 0.02));
    group.add(makeBox(0.055, cabinetHeight + 0.05, 0.62, materials.side, x + unitWidth / 2, 0, 0.02));
    group.add(makeBox(unitWidth + 0.04, 0.055, 0.62, materials.side, x, 1.5, 0.02));
    group.add(makeBox(unitWidth + 0.04, 0.055, 0.62, materials.side, x, -1.5, 0.02));
    group.add(makeBox(unitWidth - 0.1, 0.045, 0.58, materials.shelf, x, 0.12, 0.02));
    group.add(makeBox(unitWidth - 0.1, 0.045, 0.58, materials.shelf, x, 0.83, 0.02));

    [-0.18, 0.52, 1.08].forEach((y) => {
      group.add(makeBox(unitWidth - 0.24, 0.2, 0.38, basketMaterial, x, y, 0.02));
    });

    group.add(makeBox(0.055, 0.48, 0.035, materials.handle, x + unitWidth * 0.34, -0.93, 0.36));
    group.add(makeBox(0.045, 0.44, 0.035, materials.handle, x + unitWidth * 0.34, 0.22, 0.36));

    if (isActive) {
      const zone = getZoneSettings(model);
      group.add(makeBox(unitWidth - 0.08, zone.height, 0.09, materials.highlight, x, zone.y, 0.42));
    }

    const label = makeTextSprite(`${model.prefix}${number}`, isActive);
    label.position.set(x, 1.76, 0.44);
    group.add(label);
  }

  function addPrepRoomLayout(model) {
    const rowCount = 10;
    const prepUnitWidth = unitWidth;
    const prepUnitGap = unitGap;
    const totalWidth = rowCount * prepUnitWidth + (rowCount - 1) * prepUnitGap;
    const activeNumber = model.prefix === "준" ? model.cabinetNumber : 0;

    for (let number = 1; number <= rowCount; number += 1) {
      const x = -totalWidth / 2 + prepUnitWidth / 2 + (number - 1) * (prepUnitWidth + prepUnitGap);
      const isActive = number === activeNumber;
      addCabinet(x, number, model, isActive);
    }

    return totalWidth;
  }

  function rebuild(model) {
    while (group.children.length) {
      group.remove(group.children[0]);
    }

    if (model.area === "준비실" && model.prefix === "준") {
      const totalWidth = 10 * unitWidth + 9 * unitGap;
      const floor = makeBox(totalWidth + 0.8, 0.035, 1.35, materials.floor, 0, -1.54, 0.1);
      group.add(floor);
      addPrepRoomLayout(model);
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0.25, 9);
      camera.lookAt(0, 0.02, 0);
      targetRotation = 0.16;
      resize();
      return;
    }

    camera.up.set(0, 1, 0);
    camera.position.set(0, 0.25, 9);
    camera.lookAt(0, 0.02, 0);

    const range = getVisibleCabinetRange(model);
    const totalWidth = range.visibleCount * unitWidth + (range.visibleCount - 1) * unitGap;
    const floor = makeBox(totalWidth + 0.8, 0.035, 1.35, materials.floor, 0, -1.54, 0.1);
    group.add(floor);

    for (let index = 0; index < range.visibleCount; index += 1) {
      const number = range.start + index;
      const x = -totalWidth / 2 + unitWidth / 2 + index * (unitWidth + unitGap);
      addCabinet(x, number, model, number === model.cabinetNumber);
    }

    camera.position.set(0, 0.25, 9);
    targetRotation = model.cabinetNumber % 2 === 0 ? -0.28 : 0.22;
    resize();
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    group.rotation.y += (targetRotation - group.rotation.y) * 0.075;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  container.addEventListener("pointerdown", (event) => {
    isDragging = true;
    dragStartX = event.clientX;
    startRotation = targetRotation;
    container.setPointerCapture?.(event.pointerId);
  });

  container.addEventListener("pointermove", (event) => {
    if (!isDragging) {
      return;
    }

    targetRotation = startRotation + (event.clientX - dragStartX) * 0.01;
  });

  container.addEventListener("pointerup", (event) => {
    isDragging = false;
    container.releasePointerCapture?.(event.pointerId);
  });

  container.addEventListener("pointercancel", () => {
    isDragging = false;
  });

  new ResizeObserver(resize).observe(container);
  animate();

  return { update: rebuild, resize };
}

function renderCabinetModel(model) {
  if (!cabinetScene) {
    return;
  }

  if (!window.THREE) {
    renderCabinetFallback(model);
    return;
  }

  if (!cabinetViewer) {
    cabinetViewer = createCabinetViewer(cabinetScene);
  }

  cabinetViewer.update(model);
}

function renderInspector(item) {
  if (!itemInspector) {
    return;
  }

  if (!item) {
    return;
  }

  const model = getStorageModel(item);
  const statusLabel = getStatusLabel(item);
  const detailText = getDetailText(item);
  const sourceText = item.sourceSheet
    ? `${item.sourceSheet}${item.sourceCell ? ` · ${item.sourceCell}` : ""}`
    : item.area === "시약"
      ? "시약 데이터"
      : "실험실 기구 목록";

  inspectorArea.textContent = `${item.area} · ${model.prefix}${model.cabinetNumber}`;
  inspectorName.textContent = item.name;
  inspectorCategory.textContent = item.category;
  inspectorLocation.textContent = item.location;
  inspectorQuantity.textContent = item.quantity;
  inspectorStatus.textContent = statusLabel;
  inspectorDetailText.textContent = detailText;
  inspectorSource.textContent = sourceText;

  renderCabinetModel(model);
}

function buildInventoryItems() {
  const reagentItems = baseReagents.map((reagent, index) => {
    const id = Number(reagent.id) || index + 1;
    const lowStock = isLowStock(reagent);
    const detail = reagent.iupac || reagent.commonName || "시약 정보 없음";
    const formula = reagent.formula || reagent.structuralFormula || "-";

    return {
      id: `시약-${String(id).padStart(3, "0")}`,
      numericId: id,
      area: "시약",
      category: reagent.category || "분류 없음",
      name: reagent.name || "이름 없음",
      detail,
      formula,
      quantity: formatNumber(reagent.remainingAmount),
      location: "시약장",
      toxic: Boolean(reagent.toxic),
      lowStock,
      searchText: [
        "시약",
        reagent.category,
        reagent.name,
        reagent.iupac,
        reagent.commonName,
        reagent.formula,
        reagent.structuralFormula,
        reagent.remainingAmount,
      ].join(" ").toLowerCase(),
    };
  });

  const equipmentItems = labItems.map((item, index) => ({
    id: `${item.area}-${String(index + 1).padStart(3, "0")}`,
    numericId: 10000 + index + 1,
    area: item.area,
    category: item.category || "위치 미정",
    name: item.name || "이름 없음",
    detail: item.location || "위치 미정",
    formula: "-",
    quantity: item.quantity || "-",
    location: item.location || "위치 미정",
    toxic: false,
    lowStock: false,
    sourceSheet: item.sourceSheet,
    sourceCell: item.sourceCell,
    searchText: [
      item.area,
      item.category,
      item.name,
      item.quantity,
      item.location,
      item.sourceSheet,
      item.sourceCell,
    ].join(" ").toLowerCase(),
  }));

  inventoryItems = [...reagentItems, ...equipmentItems];
}

function getAreaItems() {
  if (filterState.area === "전체") {
    return inventoryItems;
  }

  return inventoryItems.filter((item) => item.area === filterState.area);
}

function getCategoryValue(item) {
  if (filterState.area === "전체") {
    return item.area;
  }

  return item.category || "분류 없음";
}

function getCategorySortValue(value) {
  const orderIndex = AREA_ORDER.indexOf(value);
  return orderIndex >= 0 ? `${String(orderIndex).padStart(2, "0")}-${value}` : value;
}

function getFilteredItems() {
  const query = filterState.query.trim().toLowerCase();

  return getAreaItems()
    .filter((item) => {
      if (filterState.category !== "all" && getCategoryValue(item) !== filterState.category) {
        return false;
      }

      if (filterState.status === "toxic" && !item.toxic) {
        return false;
      }

      if (filterState.status === "low" && !item.lowStock) {
        return false;
      }

      if (!query) {
        return true;
      }

      return item.searchText.includes(query);
    })
    .sort((a, b) => {
      if (filterState.sort === "area") {
        return getCategorySortValue(a.area).localeCompare(getCategorySortValue(b.area), "ko-KR") ||
          a.numericId - b.numericId;
      }

      if (filterState.sort === "category") {
        return String(a.category).localeCompare(String(b.category), "ko-KR") ||
          String(a.name).localeCompare(String(b.name), "ko-KR");
      }

      if (filterState.sort === "name") {
        return String(a.name).localeCompare(String(b.name), "ko-KR");
      }

      if (filterState.sort === "location") {
        return String(a.location).localeCompare(String(b.location), "ko-KR") ||
          String(a.name).localeCompare(String(b.name), "ko-KR");
      }

      return a.numericId - b.numericId;
    });
}

function updateAreaControls() {
  spaceCards.forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.area === filterState.area);
  });

  areaNavLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.areaNav === filterState.area);
  });

  if (categoryTitle) {
    categoryTitle.textContent = filterState.area === "전체" ? "공간" : "분류";
  }

  if (statusFilter) {
    const showStatusFilter = filterState.area === "시약" || filterState.area === "전체";
    statusFilter.hidden = !showStatusFilter;

    if (!showStatusFilter) {
      filterState.status = "all";
      statusChips.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.status === "all");
      });
    }
  }
}

function buildCategoryFilters() {
  const counts = getAreaItems().reduce((result, item) => {
    const category = getCategoryValue(item);
    result.set(category, (result.get(category) || 0) + 1);
    return result;
  }, new Map());

  const categories = [...counts.entries()]
    .sort((a, b) => getCategorySortValue(a[0]).localeCompare(getCategorySortValue(b[0]), "ko-KR"));

  categoryList.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "category-chip is-active";
  allButton.dataset.category = "all";
  allButton.innerHTML = `전체 <span>${getAreaItems().length.toLocaleString("ko-KR")}</span>`;
  categoryList.append(allButton);

  categories.forEach(([category, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.dataset.category = category;
    button.innerHTML = `${escapeHtml(AREA_LABELS[category] || category)} <span>${count.toLocaleString("ko-KR")}</span>`;
    categoryList.append(button);
  });
}

function renderStats() {
  const areaItems = getAreaItems();
  const filteredItems = getFilteredItems();
  const categoryCount = new Set(areaItems.map((item) => getCategoryValue(item))).size;

  totalReagents.textContent = areaItems.length.toLocaleString("ko-KR");
  toxicReagents.textContent = categoryCount.toLocaleString("ko-KR");
  lowReagents.textContent = filteredItems.length.toLocaleString("ko-KR");
}

function renderTable() {
  const rows = getFilteredItems();
  const hasSelectedItem = rows.some((item) => item.id === selectedItemId);
  selectedItemId = hasSelectedItem ? selectedItemId : "";

  visibleCount.textContent = rows.length.toLocaleString("ko-KR");
  emptyState.hidden = rows.length > 0;

  tableBody.innerHTML = rows
    .map((item, index) => {
      const statusClass = getStatusClass(item);
      const statusLabel = getStatusLabel(item);
      const detail = getDetailText(item);
      const isSelected = item.id === selectedItemId;

      return `
        <tr class="${isSelected ? "is-selected" : ""}" data-item-id="${escapeHtml(item.id)}" tabindex="0" aria-selected="${String(isSelected)}" aria-label="${escapeHtml(item.name)} 보관 위치 상세 보기">
          <td>${String(index + 1).padStart(3, "0")}</td>
          <td><span class="category-badge">${escapeHtml(item.area)}</span></td>
          <td>${escapeHtml(item.category)}</td>
          <td>
            <span class="reagent-name">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.location)}</small>
            </span>
          </td>
          <td><span class="formula">${escapeHtml(detail)}</span></td>
          <td>${escapeHtml(item.quantity)}</td>
          <td><span class="state-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
        </tr>
      `;
    })
    .join("");

}

function renderDashboard() {
  updateAreaControls();
  buildCategoryFilters();
  renderStats();
  renderTable();
}

function resetFilters(options = {}) {
  if (options.area) {
    filterState.area = options.area;
  }

  filterState.category = "all";
  filterState.status = "all";
  filterState.sort = "id";
  filterState.query = "";
  searchInput.value = "";

  statusChips.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.status === "all");
  });

  sortButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sort === "id");
  });

  renderDashboard();
}

function openInventoryView(area = filterState.area, options = {}) {
  filterState.area = AREA_ORDER.includes(area) ? area : "시약";

  if (options.reset !== false) {
    resetFilters({ area: filterState.area });
  } else {
    renderDashboard();
  }

  prepRoom.hidden = false;
  document.body.classList.add("is-prep-open");
  window.scrollTo({ top: 0, behavior: "auto" });

  if (options.pushHistory !== false) {
    try {
      if (history.state?.view !== "prep") {
        history.pushState({ view: "prep" }, "", "#prep-room");
      }
    } catch {
      // The visual transition still works if history is unavailable.
    }
  }
}

window.openLabInventory = openInventoryView;

function closePrepRoom(options = {}) {
  const { fromHistory = false } = options;

  closeItemDetailModal();

  if (!fromHistory && document.body.classList.contains("is-prep-open") && history.state?.view === "prep") {
    history.back();
    return;
  }

  document.body.classList.remove("is-prep-open");
  prepRoom.hidden = true;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function selectSpace(card) {
  openInventoryView(card.dataset.area || "시약");
}

function selectInventoryItem(itemId) {
  if (!itemId) {
    return;
  }

  const item = inventoryItems.find((inventoryItem) => inventoryItem.id === itemId);

  if (!item) {
    return;
  }

  selectedItemId = itemId;
  renderTable();
  openItemDetailModal(item);
}

function openItemDetailModal(item) {
  if (!itemDetailModal) {
    renderInspector(item);
    return;
  }

  itemDetailModal.hidden = false;
  document.body.style.overflow = "hidden";
  renderInspector(item);
  itemDetailModal.querySelector("[data-item-detail-close]")?.focus({ preventScroll: true });
}

function closeItemDetailModal() {
  if (!itemDetailModal) {
    return;
  }

  itemDetailModal.hidden = true;
  document.body.style.overflow = "";
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("site-theme-dark", isDark);
  document.body.classList.toggle("prep-theme-light", !isDark);

  themeToggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
  });

  try {
    localStorage.setItem("science-lab-theme", isDark ? "dark" : "light");
  } catch {
    // Local files may block storage in some browsers.
  }
}

const RESERVATION_STORAGE_KEY = "science-lab-reservations";

function getSavedReservations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESERVATION_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReservations(reservations) {
  try {
    localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(reservations));
  } catch {
    showToast("예약 내역을 브라우저에 저장하지 못했습니다.");
  }
}

function isReservationAdmin() {
  return document.body.classList.contains("is-admin");
}

function renderReservationAdminPanel() {
  if (!reservationAdminPanel || !reservationList) {
    return;
  }

  const isAdmin = isReservationAdmin();
  reservationAdminPanel.hidden = !isAdmin;

  if (!isAdmin) {
    return;
  }

  const reservations = getSavedReservations();

  if (!reservations.length) {
    reservationList.innerHTML = `
      <p class="reservation-empty">아직 접수된 예약 요청이 없습니다.</p>
    `;
    return;
  }

  reservationList.innerHTML = reservations
    .map((reservation) => `
      <article class="reservation-request">
        <div>
          <strong>${escapeHtml(reservation.room)}</strong>
          <span>${escapeHtml(reservation.date)} · ${escapeHtml(reservation.time)}</span>
        </div>
        <p>${escapeHtml(reservation.className || "학급 미입력")} / ${escapeHtml(reservation.purpose || "사용 목적 미입력")}</p>
        <small>${escapeHtml(reservation.createdAt)}</small>
      </article>
    `)
    .join("");
}

function openReservationModal() {
  if (!reservationModal) {
    return;
  }

  renderReservationAdminPanel();
  reservationModal.hidden = false;
  document.body.style.overflow = "hidden";
  reservationDateInput?.focus();
}

function closeReservationModal() {
  if (!reservationModal) {
    return;
  }

  reservationModal.hidden = true;
  document.body.style.overflow = "";
}

if (reservationDateInput) {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  reservationDateInput.min = today.toISOString().slice(0, 10);
}

soonLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showToast("필요한 내용은 다음 단계에서 추가하면 됩니다.");
  });
});

reservationOpenLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openReservationModal();
  });
});

reservationCloseButtons.forEach((button) => {
  button.addEventListener("click", closeReservationModal);
});

itemDetailCloseButtons.forEach((button) => {
  button.addEventListener("click", closeItemDetailModal);
});

reservationModal?.addEventListener("click", (event) => {
  if (event.target === reservationModal) {
    closeReservationModal();
  }
});

itemDetailModal?.addEventListener("click", (event) => {
  if (event.target === itemDetailModal) {
    closeItemDetailModal();
  }
});

reservationForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(reservationForm);
  const reservations = getSavedReservations();
  const createdAt = new Date().toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  reservations.unshift({
    id: `${Date.now()}`,
    room: String(formData.get("room") || ""),
    date: String(formData.get("date") || ""),
    time: String(formData.get("time") || ""),
    className: String(formData.get("className") || ""),
    purpose: String(formData.get("purpose") || ""),
    createdAt,
  });

  saveReservations(reservations.slice(0, 30));
  renderReservationAdminPanel();
  closeReservationModal();
  reservationForm.reset();
  showToast("과학실 예약 요청이 접수되었습니다.");
});

reservationClearButton?.addEventListener("click", () => {
  saveReservations([]);
  renderReservationAdminPanel();
  showToast("예약 요청 목록을 정리했습니다.");
});

window.addEventListener("science-lab-auth-change", renderReservationAdminPanel);

openPrepLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openInventoryView(link.dataset.area || "시약");
  });
});

spaceCards.forEach((card) => {
  card.addEventListener("click", () => {
    selectSpace(card);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectSpace(card);
    }
  });
});

areaNavLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openInventoryView(link.dataset.areaNav || "시약");
  });
});

adminAreaButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openInventoryView(button.dataset.adminArea || "전체");
  });
});

categoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");

  if (!button) {
    return;
  }

  filterState.category = button.dataset.category;
  document.querySelectorAll("[data-category]").forEach((item) => item.classList.remove("is-active"));
  button.classList.add("is-active");
  renderStats();
  renderTable();
});

statusChips.forEach((button) => {
  button.addEventListener("click", () => {
    filterState.status = button.dataset.status;
    statusChips.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    renderStats();
    renderTable();
  });
});

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterState.sort = button.dataset.sort;
    sortButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    renderTable();
  });
});

tableBody.addEventListener("click", (event) => {
  const row = event.target.closest("[data-item-id]");

  if (!row) {
    return;
  }

  selectInventoryItem(row.dataset.itemId);
});

tableBody.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const row = event.target.closest("[data-item-id]");

  if (!row) {
    return;
  }

  event.preventDefault();
  selectInventoryItem(row.dataset.itemId);
});

searchInput.addEventListener("input", () => {
  filterState.query = searchInput.value;
  renderStats();
  renderTable();
});

searchButton.addEventListener("click", () => {
  filterState.query = searchInput.value;
  renderStats();
  renderTable();
});

resetFiltersButton.addEventListener("click", () => {
  resetFilters({ area: filterState.area });
});

closePrepButton.addEventListener("click", closePrepRoom);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && itemDetailModal && !itemDetailModal.hidden) {
    closeItemDetailModal();
  }
});

window.addEventListener("popstate", (event) => {
  if (event.state?.view === "prep") {
    openInventoryView(filterState.area, { pushHistory: false, reset: false });
    return;
  }

  closePrepRoom({ fromHistory: true });
});

themeToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("site-theme-dark") ? "light" : "dark";
    setTheme(nextTheme);
  });
});

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("science-lab-theme") || localStorage.getItem("prep-theme") || "dark";
} catch {
  savedTheme = "dark";
}

buildInventoryItems();
setTheme(savedTheme);
renderDashboard();
