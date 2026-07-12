const soonLinks = document.querySelectorAll("[data-soon]");
const openPrepLinks = document.querySelectorAll("[data-open-prep]");
const reservationOpenLinks = document.querySelectorAll("[data-reservation-open]");
const menuButton = document.querySelector("#menu-button");
const mobileMenu = document.querySelector("#mobile-menu");
const mobileMenuCloseButtons = document.querySelectorAll("[data-mobile-menu-close]");
const mobileMenuLinks = document.querySelectorAll("[data-mobile-menu-link]");
const reservationModal = document.querySelector("#reservation-modal");
const reservationCloseButtons = document.querySelectorAll("[data-reservation-close]");
const reservationForm = document.querySelector("#reservation-form");
const reservationRoomInput = document.querySelector("#reservation-room");
const reservationDateInput = document.querySelector("#reservation-date");
const reservationStartTimeInput = document.querySelector("#reservation-start-time");
const reservationEndTimeInput = document.querySelector("#reservation-end-time");
const reservationStatusBoard = document.querySelector("#reservation-status-board");
const reservationAdminPanel = document.querySelector("#reservation-admin-panel");
const reservationList = document.querySelector("#reservation-list");
const reservationClearButton = document.querySelector("#reservation-clear-btn");
const noticeListContainer = document.querySelector("#notice-list-container");
const adminNoticeForm = document.querySelector("#admin-notice-form");
const adminNoticeInput = document.querySelector("#admin-notice-input");
const reservationTabs = document.querySelector("#reservation-tabs");
const resModalBody = document.querySelector(".reservation-modal-body");
const aboutPage = document.querySelector("#about-page");
const aboutPageNoticeBox = document.querySelector("#about-page-notice-box");
const navAboutOpen = document.querySelector("#nav-about-open");
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
const INVENTORY_EDITS_STORAGE_KEY = "science-lab-inventory-edits";

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

function openMobileMenu() {
  if (!mobileMenu) {
    return;
  }

  mobileMenu.hidden = false;
  menuButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-mobile-menu-open");
  document.body.style.overflow = "hidden";
}

function closeMobileMenu() {
  if (!mobileMenu) {
    return;
  }

  mobileMenu.hidden = true;
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-mobile-menu-open");

  if (
    (!reservationModal || reservationModal.hidden) &&
    (!itemDetailModal || itemDetailModal.hidden) &&
    (!document.querySelector("#login-modal") || document.querySelector("#login-modal").hidden) &&
    (!document.querySelector("#account-modal") || document.querySelector("#account-modal").hidden)
  ) {
    document.body.style.overflow = "";
  }
}

window.closeMobileMenu = closeMobileMenu;

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

function getSavedInventoryEdits() {
  if (inventoryEditsStorageMode === "supabase") {
    return inventoryEditsCache;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(INVENTORY_EDITS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveInventoryEdits(edits) {
  inventoryEditsCache = edits;

  try {
    localStorage.setItem(INVENTORY_EDITS_STORAGE_KEY, JSON.stringify(edits));
  } catch {
    showToast("Changes were applied, but this browser could not save them.");
  }
}

function getInventorySearchText(item) {
  return [
    item.area,
    item.category,
    item.name,
    item.detail,
    item.formula,
    item.quantity,
    item.location,
    item.sourceSheet,
    item.sourceCell,
  ].join(" ").toLowerCase();
}

function normalizeInventoryItem(item) {
  item.searchText = getInventorySearchText(item);

  if (item.type === "reagent") {
    const numericQuantity = Number(String(item.quantity).replaceAll(",", ""));
    item.lowStock = Boolean(item.toxic) || (Number.isFinite(numericQuantity) && numericQuantity > 0 && numericQuantity <= 50);
  }

  return item;
}

function applyInventoryEdits() {
  const edits = getSavedInventoryEdits();

  inventoryItems = inventoryItems.map((item) => {
    const itemEdits = edits[item.id];

    if (!itemEdits || typeof itemEdits !== "object") {
      return normalizeInventoryItem(item);
    }

    return normalizeInventoryItem({
      ...item,
      category: itemEdits.category ?? item.category,
      name: itemEdits.name ?? item.name,
      detail: itemEdits.detail ?? item.detail,
      quantity: itemEdits.quantity ?? item.quantity,
      location: itemEdits.location ?? item.location,
    });
  });
}

async function updateInventoryItemField(itemId, field, value) {
  const editableFields = new Set(["category", "name", "detail", "quantity", "location"]);

  if (!isReservationAdmin() || !editableFields.has(field)) {
    return;
  }

  const item = inventoryItems.find((inventoryItem) => inventoryItem.id === itemId);

  if (!item) {
    return;
  }

  const nextValue = String(value || "").trim() || "-";

  if (String(item[field]) === nextValue) {
    return;
  }

  item[field] = nextValue;
  normalizeInventoryItem(item);

  const edits = getSavedInventoryEdits();
  edits[itemId] = {
    ...(edits[itemId] || {}),
    [field]: item[field],
  };
  saveInventoryEdits(edits);

  buildCategoryFilters();
  renderStats();
  renderTable();

  const savedToSupabase = await saveInventoryEditToSupabase(itemId, field, item[field]);
  showToast(savedToSupabase ? "Saved to Supabase." : "Saved on this device.");
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
      type: "reagent",
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
    type: "equipment",
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
  applyInventoryEdits();
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

function renderAdminEditInput(item, field, value, options = {}) {
  if (!isReservationAdmin()) {
    return escapeHtml(value);
  }

  const tag = options.multiline ? "textarea" : "input";
  const label = `${field} ${item.name}`;
  const className = `table-edit-field ${options.compact ? "is-compact" : ""}`;

  if (tag === "textarea") {
    return `<textarea class="${className}" data-edit-field="${field}" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}">${escapeHtml(value)}</textarea>`;
  }

  return `<input class="${className}" data-edit-field="${field}" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}" value="${escapeHtml(value)}">`;
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
      const nameContent = isReservationAdmin()
        ? `
            <span class="reagent-name edit-name">
              ${renderAdminEditInput(item, "name", item.name)}
              ${renderAdminEditInput(item, "location", item.location, { compact: true })}
            </span>
          `
        : `
            <span class="reagent-name">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.location)}</small>
            </span>
          `;

      return `
        <tr class="${isSelected ? "is-selected" : ""}" data-item-id="${escapeHtml(item.id)}" tabindex="0" aria-selected="${String(isSelected)}" aria-label="${escapeHtml(item.name)} 보관 위치 상세 보기">
          <td>${String(index + 1).padStart(3, "0")}</td>
          <td><span class="category-badge">${escapeHtml(item.area)}</span></td>
          <td>${renderAdminEditInput(item, "category", item.category, { compact: true })}</td>
          <td>${nameContent}</td>
          <td><span class="formula">${isReservationAdmin() ? renderAdminEditInput(item, "detail", item.detail, { multiline: true }) : escapeHtml(detail)}</span></td>
          <td>${renderAdminEditInput(item, "quantity", item.quantity, { compact: true })}</td>
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
  document.body.classList.toggle("site-theme-light", !isDark);
  document.body.classList.toggle("prep-theme-light", !isDark);

  themeToggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
  });

  themeToggleButtons.forEach((button) => {
    button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  });

  try {
    localStorage.setItem("science-lab-theme", isDark ? "dark" : "light");
  } catch {
    // Local files may block storage in some browsers.
  }
}

const RESERVATION_STORAGE_KEY = "science-lab-reservations";
const SUPABASE_RESERVATIONS_TABLE = "science_lab_reservations";
const SUPABASE_NOTICES_TABLE = "science_lab_notices";
const SUPABASE_INVENTORY_EDITS_TABLE = "science_lab_inventory_edits";
const RESERVATION_TIME_SLOTS = ["1교시", "2교시", "3교시", "4교시", "5교시", "6교시", "7교시", "방과후", "야자 1", "야자 2"];
let reservationCache = [];
let noticeCache = [];
let inventoryEditsCache = {};
let reservationStorageMode = "local";
let noticeStorageMode = "local";
let inventoryEditsStorageMode = "local";
let reservationListView = "pending";

function getSupabaseStorageClient() {
  return window.scienceLabSupabase || null;
}

async function loadSupabaseInventoryEdits() {
  const client = getSupabaseStorageClient();

  if (!client) {
    return false;
  }

  try {
    const { data, error } = await client
      .from(SUPABASE_INVENTORY_EDITS_TABLE)
      .select("item_id, field_name, field_value");

    if (error) {
      throw error;
    }

    const edits = {};

    (data || []).forEach((row) => {
      if (!row.item_id || !row.field_name) {
        return;
      }

      edits[row.item_id] = {
        ...(edits[row.item_id] || {}),
        [row.field_name]: row.field_value,
      };
    });

    inventoryEditsStorageMode = "supabase";
    saveInventoryEdits(edits);
    applyInventoryEdits();
    return true;
  } catch (error) {
    console.warn("Supabase inventory edits unavailable", error);
    return false;
  }
}

async function saveInventoryEditToSupabase(itemId, field, value) {
  if (!isReservationAdmin()) {
    return false;
  }

  const client = getSupabaseStorageClient();

  if (!client) {
    return false;
  }

  try {
    const { error } = await client
      .from(SUPABASE_INVENTORY_EDITS_TABLE)
      .upsert({
        item_id: itemId,
        field_name: field,
        field_value: value,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "item_id,field_name",
      });

    if (error) {
      throw error;
    }

    inventoryEditsStorageMode = "supabase";
    return true;
  } catch (error) {
    console.warn("Supabase inventory edit save failed", error);
    return false;
  }
}

function getSavedReservations() {
  if (reservationStorageMode === "supabase") {
    return reservationCache;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(RESERVATION_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReservations(reservations) {
  reservationCache = reservations;

  try {
    localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(reservations));
  } catch {
    showToast("예약 내역을 브라우저에 저장하지 못했습니다.");
  }
}

async function loadSupabaseReservations() {
  const client = getSupabaseStorageClient();

  if (!client) {
    return false;
  }

  try {
    const { data, error } = await client
      .from(SUPABASE_RESERVATIONS_TABLE)
      .select("id, room, date, time, class_name, applicant_student_id, applicant_name, purpose, created_at, status, status_reason")
      .order("created_at_sort", { ascending: false });

    if (error) {
      throw error;
    }

    reservationCache = (data || []).map((reservation) => ({
      id: reservation.id,
      room: reservation.room,
      date: reservation.date,
      time: reservation.time,
      className: reservation.class_name,
      applicantStudentId: reservation.applicant_student_id,
      applicantName: reservation.applicant_name,
      purpose: reservation.purpose,
      createdAt: reservation.created_at,
      status: reservation.status || "pending",
      statusReason: reservation.status_reason || "",
    }));
    reservationStorageMode = "supabase";
    return true;
  } catch (error) {
    console.warn("Supabase reservations unavailable", error);
    return false;
  }
}

async function addReservation(reservation) {
  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 예약을 저장하지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client.from(SUPABASE_RESERVATIONS_TABLE).insert({
      id: reservation.id,
      room: reservation.room,
      date: reservation.date,
      time: reservation.time,
      class_name: reservation.className,
      applicant_student_id: reservation.applicantStudentId,
      applicant_name: reservation.applicantName,
      purpose: reservation.purpose,
      created_at: reservation.createdAt,
      status: reservation.status || "pending",
      status_reason: reservation.statusReason || null,
    });

    if (error) {
      throw error;
    }

    reservationStorageMode = "supabase";
    reservationCache = [reservation, ...reservationCache].slice(0, 30);
    return true;
  } catch (error) {
    console.warn("Supabase reservation insert failed", error);
    showToast("Supabase 예약 저장에 실패했습니다. 테이블/RLS 설정을 확인해 주세요.");
    return false;
  }
}

async function clearReservations() {
  if (!isReservationAdmin()) {
    showToast("관리자만 예약 요청 목록을 정리할 수 있습니다.");
    return false;
  }

  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 예약 목록을 비우지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client.from(SUPABASE_RESERVATIONS_TABLE).delete().neq("id", "");

    if (error) {
      throw error;
    }

    reservationStorageMode = "supabase";
    reservationCache = [];
    return true;
  } catch (error) {
    console.warn("Supabase reservation clear failed", error);
    showToast("Supabase 예약 목록을 비우지 못했습니다.");
    return false;
  }
}

function isReservationAdmin() {
  return document.body.classList.contains("is-admin");
}

async function deleteReservation(id) {
  if (!isReservationAdmin()) {
    showToast("관리자만 예약 요청을 삭제할 수 있습니다.");
    return false;
  }

  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 예약 요청을 삭제하지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client.from(SUPABASE_RESERVATIONS_TABLE).delete().eq("id", id);

    if (error) {
      throw error;
    }

    reservationStorageMode = "supabase";
    reservationCache = reservationCache.filter((reservation) => reservation.id !== id);
    return true;
  } catch (error) {
    console.warn("Supabase reservation delete failed", error);
    showToast("예약 요청을 삭제하지 못했습니다. 관리자 권한/RLS 설정을 확인해 주세요.");
    return false;
  }
}

function bindReservationListTabs() {
  reservationList?.querySelectorAll("[data-reservation-list-view]").forEach((button) => {
    button.addEventListener("click", () => {
      reservationListView = button.dataset.reservationListView || "pending";
      renderReservationAdminPanel();
    });
  });
}

function getReservationStatus(status) {
  return ["pending", "approved", "rejected"].includes(status) ? status : "pending";
}

async function updateReservationStatus(id, status, statusReason = "") {
  if (!isReservationAdmin()) {
    showToast("관리자만 예약 요청을 처리할 수 있습니다.");
    return false;
  }

  if (!["approved", "rejected"].includes(status)) {
    return false;
  }

  const normalizedReason = String(statusReason || "").trim();

  if (status === "rejected" && !normalizedReason) {
    showToast("거절 사유를 입력해 주세요.");
    return false;
  }

  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 예약 상태를 저장하지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client
      .from(SUPABASE_RESERVATIONS_TABLE)
      .update({ status, status_reason: status === "rejected" ? normalizedReason : null })
      .eq("id", id);

    if (error) {
      throw error;
    }

    reservationStorageMode = "supabase";
    reservationCache = reservationCache.map((reservation) => (
      reservation.id === id ? { ...reservation, status, statusReason: status === "rejected" ? normalizedReason : "" } : reservation
    ));
    return true;
  } catch (error) {
    console.warn("Supabase reservation status update failed", error);
    showToast("예약 상태를 변경하지 못했습니다. 관리자 권한/RLS 설정을 확인해 주세요.");
    return false;
  }
}

/* ==========================================
   Notice Panel Logic & Storage
   ========================================== */

const NOTICE_STORAGE_KEY = "science-lab-notices";
const DEFAULT_NOTICES = [
  {
    id: "notice-1",
    content: "🧪 과학실 사용 전 예약은 최소 3일 전까지 완료해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:00"
  },
  {
    id: "notice-2",
    content: "⚠️ 실험 중 유독성 물질 사용 시 반드시 보안경과 실험용 장갑을 착용해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:05"
  },
  {
    id: "notice-3",
    content: "🧹 실험이 끝난 후 물품 정돈 및 전기/가스 차단 여부를 꼭 점검해 주세요.",
    createdAt: "2026. 6. 1. 오전 10:10"
  }
];

function getSavedNotices() {
  if (noticeStorageMode === "supabase") {
    return noticeCache;
  }

  try {
    const data = localStorage.getItem(NOTICE_STORAGE_KEY);
    if (!data) {
      localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(DEFAULT_NOTICES));
      return DEFAULT_NOTICES;
    }
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : DEFAULT_NOTICES;
  } catch {
    return DEFAULT_NOTICES;
  }
}

function saveNotices(notices) {
  noticeCache = notices;

  try {
    localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(notices));
  } catch {
    showToast("공지사항을 저장하지 못했습니다.");
  }
}

async function loadSupabaseNotices() {
  const client = getSupabaseStorageClient();

  if (!client) {
    return false;
  }

  try {
    const { data, error } = await client
      .from(SUPABASE_NOTICES_TABLE)
      .select("id, content, created_at")
      .order("created_at_sort", { ascending: false });

    if (error) {
      throw error;
    }

    noticeCache = (data || []).map((notice) => ({
      id: notice.id,
      content: notice.content,
      createdAt: notice.created_at,
    }));

    if (!noticeCache.length) {
      noticeCache = DEFAULT_NOTICES;
    }

    noticeStorageMode = "supabase";
    return true;
  } catch (error) {
    console.warn("Supabase notices unavailable", error);
    return false;
  }
}

async function saveNoticeToSupabase(notice) {
  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 공지를 저장하지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client.from(SUPABASE_NOTICES_TABLE).insert({
      id: notice.id,
      content: notice.content,
      created_at: notice.createdAt,
    });

    if (error) {
      throw error;
    }

    noticeStorageMode = "supabase";
    return true;
  } catch (error) {
    console.warn("Supabase notice insert failed", error);
    showToast("Supabase 공지 저장에 실패했습니다. 로그인/RLS 설정을 확인해 주세요.");
    return false;
  }
}

async function deleteNoticeFromSupabase(id) {
  const client = getSupabaseStorageClient();

  if (!client) {
    showToast("Supabase 연결이 없어 공지를 삭제하지 못했습니다.");
    return false;
  }

  try {
    const { error } = await client.from(SUPABASE_NOTICES_TABLE).delete().eq("id", id);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.warn("Supabase notice delete failed", error);
    showToast("Supabase 공지를 삭제하지 못했습니다.");
    return false;
  }
}

function renderAboutPageNotices() {
  if (!aboutPageNoticeBox) return;

  const notices = getSavedNotices();

  if (!notices.length) {
    aboutPageNoticeBox.innerHTML = `
      <p class="notice-empty">등록된 공지사항이 없습니다.</p>
    `;
    return;
  }

  aboutPageNoticeBox.innerHTML = notices
    .map((notice) => `
      <div class="about-page-notice-item" data-notice-id="${escapeHtml(notice.id)}">
        <p class="about-page-notice-content">${escapeHtml(notice.content)}</p>
        <span class="about-page-notice-date">${escapeHtml(notice.createdAt)}</span>
        <button type="button" class="notice-delete-btn about-page-notice-delete-btn" aria-label="공지 삭제" data-notice-delete>×</button>
      </div>
    `)
    .join("");

  aboutPageNoticeBox.querySelectorAll("[data-notice-delete]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const noticeItem = e.target.closest("[data-notice-id]");
      if (noticeItem) {
        deleteNotice(noticeItem.dataset.noticeId);
      }
    });
  });
}

function renderNotices() {
  renderAboutPageNotices();

  if (!noticeListContainer) {
    return;
  }

  const isAdmin = isReservationAdmin();

  if (adminNoticeForm) {
    adminNoticeForm.hidden = !isAdmin;
  }

  const notices = getSavedNotices();

  if (!notices.length) {
    noticeListContainer.innerHTML = `
      <p class="notice-empty">등록된 공지사항이 없습니다.</p>
    `;
    return;
  }

  noticeListContainer.innerHTML = notices
    .map((notice) => `
      <article class="notice-item" data-notice-id="${escapeHtml(notice.id)}">
        <p class="notice-item-content">${escapeHtml(notice.content)}</p>
        <small class="notice-item-meta">${escapeHtml(notice.createdAt)}</small>
        <button type="button" class="notice-delete-btn" aria-label="공지 삭제" data-notice-delete>×</button>
      </article>
    `)
    .join("");

  // Attach delete buttons events
  noticeListContainer.querySelectorAll("[data-notice-delete]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const noticeItem = e.target.closest("[data-notice-id]");
      if (noticeItem) {
        const id = noticeItem.dataset.noticeId;
        deleteNotice(id);
      }
    });
  });
}

async function addNotice(content) {
  if (!isReservationAdmin()) {
    showToast("관리자만 공지사항을 등록할 수 있습니다.");
    return false;
  }

  if (!content.trim()) return false;
  const createdAt = new Date().toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const notice = {
    id: `notice-${Date.now()}`,
    content: content.trim(),
    createdAt
  };

  if (!await saveNoticeToSupabase(notice)) {
    return false;
  }

  noticeCache = [notice, ...noticeCache.filter((item) => !DEFAULT_NOTICES.some((defaultNotice) => defaultNotice.id === item.id))];
  renderNotices();
  showToast("공지사항이 Supabase에 저장되었습니다.");
  return true;
}

async function deleteNotice(id) {
  if (!isReservationAdmin()) {
    showToast("관리자만 공지사항을 삭제할 수 있습니다.");
    return;
  }

  let notices = getSavedNotices();

  if (!await deleteNoticeFromSupabase(id)) {
    return;
  }

  notices = notices.filter((n) => n.id !== id);
  noticeStorageMode = "supabase";
  noticeCache = notices;
  renderNotices();
  showToast("공지사항이 삭제되었습니다.");
}

/* ==========================================
   Reservation Status & Tabs Logic
   ========================================== */

function renderReservationAdminPanel() {
  if (!reservationAdminPanel || !reservationList) {
    return;
  }

  const isAdmin = isReservationAdmin();
  reservationAdminPanel.hidden = false;

  if (reservationClearButton) {
    reservationClearButton.hidden = !isAdmin;
  }

  const allReservations = getSavedReservations();
  const pendingReservations = allReservations.filter((reservation) => getReservationStatus(reservation.status) === "pending");
  const completedReservations = allReservations.filter((reservation) => getReservationStatus(reservation.status) !== "pending");

  const reservations = reservationListView === "pending" ? pendingReservations : completedReservations;
  const pendingTabLabel = isAdmin ? "예약요청" : "대기중";
  const completedTabLabel = isAdmin ? "완료된 예약" : "완료됨";
  const reservationListTabs = `
    <div class="reservation-list-tabs" role="tablist" aria-label="예약 목록 구분">
      <button type="button" class="${reservationListView === "pending" ? "is-active" : ""}" data-reservation-list-view="pending">
        ${pendingTabLabel} <span>${pendingReservations.length}</span>
      </button>
      <button type="button" class="${reservationListView === "completed" ? "is-active" : ""}" data-reservation-list-view="completed">
        ${completedTabLabel} <span>${completedReservations.length}</span>
      </button>
    </div>
  `;
  const statusText = {
    pending: "대기",
    approved: "수락",
    rejected: "거절",
  };

  if (!reservations.length) {
    reservationList.innerHTML = `
      ${reservationListTabs}
      <p class="reservation-empty">${reservationListView === "pending" ? "대기중인 예약 요청이 없습니다." : "완료된 예약 요청이 없습니다."}</p>
    `;
    bindReservationListTabs();
    return;
  }

  reservationList.innerHTML = reservationListTabs + reservations
    .map((reservation) => {
      const status = getReservationStatus(reservation.status);
      const statusReason = String(reservation.statusReason || "").trim();
      const canReview = isAdmin && status === "pending";
      return `
      <article class="reservation-request ${canReview ? "is-clickable" : ""}" data-reservation-id="${escapeHtml(reservation.id)}" ${canReview ? 'tabindex="0" role="button" aria-label="예약 요청 처리 창 열기"' : ""}>
        <div>
          <strong>${escapeHtml(reservation.room)}</strong>
          <span>${escapeHtml(reservation.date)} · ${escapeHtml(reservation.time)}</span>
        </div>
        <p>${escapeHtml(reservation.className || "학급 미입력")} / ${escapeHtml(reservation.purpose || "사용 목적 미입력")}</p>
        <p class="reservation-applicant">신청자: ${escapeHtml(reservation.applicantStudentId || "학번 미입력")} · ${escapeHtml(reservation.applicantName || "이름 미입력")}</p>
        <div class="reservation-request-footer">
          <small>${escapeHtml(reservation.createdAt)}</small>
          <span class="reservation-status is-${status}">${escapeHtml(statusText[status])}</span>
          ${isAdmin ? `<button type="button" class="reservation-delete-btn" data-reservation-delete aria-label="예약 요청 삭제">삭제</button>` : ""}
        </div>
        ${status !== "pending" && statusReason ? `
          <p class="reservation-status-reason">
            <strong>처리 사유</strong>
            <span>${escapeHtml(statusReason)}</span>
          </p>
        ` : ""}
        ${isAdmin && status === "pending" ? `
          <div class="reservation-actions" aria-label="예약 요청 처리">
            <textarea class="reservation-reason-input" data-reservation-reason placeholder="거절할 때만 사유를 입력하세요."></textarea>
            <button type="button" class="reservation-action is-approve" data-reservation-status="approved">수락</button>
            <button type="button" class="reservation-action is-reject" data-reservation-status="rejected">거절</button>
          </div>
        ` : ""}
      </article>
    `;
    })
    .join("");

  bindReservationListTabs();

  reservationList.querySelectorAll("[data-reservation-status]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const request = event.target.closest("[data-reservation-id]");
      const status = event.target.dataset.reservationStatus;

      if (!request || !status) {
        return;
      }

      const reasonInput = request.querySelector("[data-reservation-reason]");
      const updated = await updateReservationStatus(request.dataset.reservationId, status, reasonInput?.value);

      if (!updated) {
        return;
      }

      renderReservationAdminPanel();
      renderReservationSchedule();
      showToast(status === "approved" ? "예약 요청을 수락했습니다." : "예약 요청을 거절했습니다.");
    });
  });

  reservationList.querySelectorAll("[data-reservation-delete]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const request = event.target.closest("[data-reservation-id]");

      if (!request) {
        return;
      }

      const deleted = await deleteReservation(request.dataset.reservationId);

      if (!deleted) {
        return;
      }

      renderReservationAdminPanel();
      renderReservationSchedule();
      showToast("예약 요청이 삭제되었습니다.");
    });
  });

  reservationList.querySelectorAll(".reservation-request.is-clickable").forEach((request) => {
    request.addEventListener("click", () => {
      openReservationDecisionDialog(request.dataset.reservationId);
    });

    request.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openReservationDecisionDialog(request.dataset.reservationId);
    });
  });
}

function closeReservationDecisionDialog() {
  document.querySelector("#reservation-decision-dialog")?.remove();
}

function openReservationDecisionDialog(reservationId) {
  if (!isReservationAdmin()) {
    return;
  }

  const reservation = getSavedReservations().find((item) => item.id === reservationId);

  if (!reservation || getReservationStatus(reservation.status) !== "pending") {
    return;
  }

  closeReservationDecisionDialog();

  const dialog = document.createElement("div");
  dialog.className = "reservation-decision-overlay";
  dialog.id = "reservation-decision-dialog";
  dialog.innerHTML = `
    <section class="reservation-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="reservation-decision-title">
      <header>
        <div>
          <p>Reservation Review</p>
          <h3 id="reservation-decision-title">예약 요청 처리</h3>
        </div>
        <button type="button" class="reservation-decision-close" data-decision-close aria-label="닫기">×</button>
      </header>
      <div class="reservation-decision-summary">
        <strong>${escapeHtml(reservation.room)} · ${escapeHtml(reservation.date)} · ${escapeHtml(reservation.time)}</strong>
        <span>${escapeHtml(reservation.className || "학급 미입력")} / ${escapeHtml(reservation.purpose || "사용 목적 미입력")}</span>
        <span>신청자: ${escapeHtml(reservation.applicantStudentId || "학번 미입력")} · ${escapeHtml(reservation.applicantName || "이름 미입력")}</span>
      </div>
      <label class="reservation-decision-reason">
        <span>거절 사유</span>
        <textarea data-decision-reason placeholder="거절할 때만 사유를 입력하세요."></textarea>
      </label>
      <div class="reservation-decision-actions">
        <button type="button" class="reservation-action is-approve" data-decision-status="approved">수락</button>
        <button type="button" class="reservation-action is-reject" data-decision-status="rejected">거절</button>
      </div>
    </section>
  `;

  document.body.appendChild(dialog);

  dialog.addEventListener("click", async (event) => {
    if (event.target === dialog || event.target.closest("[data-decision-close]")) {
      closeReservationDecisionDialog();
      return;
    }

    const statusButton = event.target.closest("[data-decision-status]");

    if (!statusButton) {
      return;
    }

    const status = statusButton.dataset.decisionStatus;
    const reason = dialog.querySelector("[data-decision-reason]")?.value;
    const updated = await updateReservationStatus(reservationId, status, reason);

    if (!updated) {
      return;
    }

    closeReservationDecisionDialog();
    renderReservationAdminPanel();
    renderReservationSchedule();
    showToast(status === "approved" ? "예약 요청을 수락했습니다." : "예약 요청을 거절했습니다.");
  });

  dialog.querySelector("[data-decision-reason]")?.focus();
}

function isActiveReservationForSlot(reservation, room, date, time) {
  return reservation.room === room &&
    reservation.date === date &&
    reservation.time === time &&
    getReservationStatus(reservation.status) !== "rejected";
}

function getReservationForSlot(room, date, time) {
  return getSavedReservations().find((reservation) => (
    isActiveReservationForSlot(reservation, room, date, time)
  ));
}

function getLocalDateValue(date = new Date()) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
}

function addDaysToDateValue(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return getLocalDateValue(date);
}

function getWeekdayScheduleDates(dateValue) {
  const selectedDate = new Date(`${dateValue}T00:00:00`);
  const day = selectedDate.getDay();
  const mondayOffset = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  selectedDate.setDate(selectedDate.getDate() + mondayOffset);

  const mondayValue = getLocalDateValue(selectedDate);
  return Array.from({ length: 5 }, (_, index) => addDaysToDateValue(mondayValue, index));
}

function formatScheduleDayLabel(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function renderReservationSchedule() {
  if (!reservationStatusBoard) {
    return;
  }

  const room = reservationRoomInput?.value || "";
  const startDate = reservationDateInput?.value || getLocalDateValue();
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysToDateValue(startDate, index));
  const requestToggle = "";
  const weekEndDate = weekDates[weekDates.length - 1];
  const dayHeaders = weekDates
    .map((dateValue) => `<div class="week-day-head">${escapeHtml(formatScheduleDayLabel(dateValue))}</div>`)
    .join("");
  const slotRows = RESERVATION_TIME_SLOTS.map((time) => {
    const cells = weekDates.map((dateValue) => {
      const reservation = getReservationForSlot(room, dateValue, time);
      const isReserved = Boolean(reservation);
      const statusClass = isReserved ? "is-reserved" : "is-available";
      const statusLabel = isReserved ? "예약됨" : "가능";
      const detailText = isReserved
        ? `${reservation.className || "학급 미입력"} · ${reservation.applicantName || "이름 미입력"}`
        : "빈 시간";

      return `
        <div class="week-schedule-cell ${statusClass}">
          <strong>${statusLabel}</strong>
          <small>${escapeHtml(detailText)}</small>
        </div>
      `;
    }).join("");

    return `
      <div class="week-time-head">${escapeHtml(time)}</div>
      ${cells}
    `;
  }).join("");

  reservationStatusBoard.innerHTML = `
    <header class="schedule-board-head">
      <div>
        <p>Weekly Status</p>
        <div class="schedule-title-row">
          <h3>${escapeHtml(room || "공간 선택")}</h3>
          ${requestToggle}
        </div>
      </div>
      <span>${escapeHtml(weekDates[0])} ~ ${escapeHtml(weekEndDate)}</span>
    </header>
    <div class="week-schedule-wrap">
      <div class="week-schedule-grid">
        <div class="week-corner">시간</div>
        ${dayHeaders}
        ${slotRows}
      </div>
    </div>
    <div class="schedule-legend" aria-label="예약 상태 설명">
      <span><i class="is-available"></i> 예약 가능</span>
      <span><i class="is-reserved"></i> 예약 있음</span>
    </div>
  `;
}

function renderReservationScheduleCompact() {
  if (!reservationStatusBoard) {
    return;
  }

  const room = reservationRoomInput?.value || "";
  const isAdmin = isReservationAdmin();
  const reservations = getSavedReservations();
  const pendingRequestCount = reservations.filter((reservation) => (
    getReservationStatus(reservation.status) === "pending"
  )).length;
  const visibleRequestCount = isAdmin
    ? reservations.length
    : reservations.filter((reservation) => getReservationStatus(reservation.status) !== "pending").length;
  const requestSummary = isAdmin
    ? `접수 ${reservations.length}건${pendingRequestCount ? ` · 대기 ${pendingRequestCount}건` : ""}`
    : `처리 완료 ${visibleRequestCount}건`;

  reservationStatusBoard.innerHTML = `
    <header class="schedule-board-head request-board-head">
      <div>
        <p>Reservation Requests</p>
        <div class="schedule-title-row">
          <h3>${escapeHtml(room || "공간 선택")}</h3>
        </div>
      </div>
      <span>${escapeHtml(requestSummary)}</span>
    </header>
  `;
}

renderReservationSchedule = renderReservationScheduleCompact;

function openReservationModal() {
  if (!reservationModal) {
    return;
  }

  const initialReservationTab = window.innerWidth <= 768 ? "form" : "notices";

  if (reservationTabs) {
    reservationTabs.querySelectorAll(".reservation-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.resTab === initialReservationTab);
    });
  }
  if (resModalBody) {
    resModalBody.className = `reservation-modal-body show-${initialReservationTab}`;
  }

  if (reservationDateInput && !reservationDateInput.value) {
    reservationDateInput.value = getLocalDateValue();
  }

  renderReservationSchedule();
  renderReservationAdminPanel();

  reservationModal.hidden = false;
  document.body.style.overflow = "hidden";

  if (window.innerWidth > 768) {
    reservationDateInput?.focus();
  }
}

function closeReservationModal() {
  if (!reservationModal) {
    return;
  }

  reservationModal.hidden = true;
  document.body.style.overflow = "";
}

if (reservationDateInput) {
  reservationDateInput.min = getLocalDateValue();
}

[reservationRoomInput, reservationDateInput, reservationStartTimeInput, reservationEndTimeInput].forEach((input) => {
  input?.addEventListener("change", renderReservationSchedule);
  input?.addEventListener("input", renderReservationSchedule);
});

reservationStartTimeInput?.addEventListener("change", () => {
  const startIndex = RESERVATION_TIME_SLOTS.indexOf(reservationStartTimeInput.value);
  const endIndex = RESERVATION_TIME_SLOTS.indexOf(reservationEndTimeInput?.value || "");

  if (reservationEndTimeInput && endIndex < startIndex) {
    reservationEndTimeInput.value = reservationStartTimeInput.value;
  }
});

soonLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showToast("필요한 내용은 다음 단계에서 추가하면 됩니다.");
  });
});

menuButton?.addEventListener("click", () => {
  if (mobileMenu && !mobileMenu.hidden) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
});

mobileMenuCloseButtons.forEach((button) => {
  button.addEventListener("click", closeMobileMenu);
});

mobileMenuLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");

    if (link.hasAttribute("data-mobile-about")) {
      event.preventDefault();
      closeMobileMenu();
      openAboutPage();
      return;
    }

    if (href === "#") {
      event.preventDefault();
      closeMobileMenu();
      closeAboutPage();
      closePrepRoom();
      try {
        history.pushState({ view: "home" }, "", "#");
      } catch {}
      return;
    }

    closeMobileMenu();
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

reservationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(reservationForm);
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const startTimeIndex = RESERVATION_TIME_SLOTS.indexOf(startTime);
  const endTimeIndex = RESERVATION_TIME_SLOTS.indexOf(endTime);

  if (startTimeIndex < 0 || endTimeIndex < 0 || startTimeIndex > endTimeIndex) {
    showToast("종료 교시는 시작 교시보다 같거나 늦어야 합니다.");
    return;
  }

  const createdAt = new Date().toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const reservation = {
    id: `${Date.now()}`,
    room: String(formData.get("room") || ""),
    date: String(formData.get("date") || ""),
    time: startTime === endTime ? startTime : `${startTime} ~ ${endTime}`,
    className: String(formData.get("className") || ""),
    applicantStudentId: String(formData.get("applicantStudentId") || ""),
    applicantName: String(formData.get("applicantName") || ""),
    purpose: String(formData.get("purpose") || ""),
    createdAt,
    status: "pending",
  };

  const saved = await addReservation(reservation);

  if (!saved) {
    return;
  }

  renderReservationAdminPanel();
  renderReservationSchedule();
  closeReservationModal();
  reservationForm.reset();
  showToast("과학실 예약 요청이 접수되었습니다.");
});

reservationClearButton?.addEventListener("click", async () => {
  const cleared = await clearReservations();

  if (!cleared) {
    return;
  }

  renderReservationAdminPanel();
  renderReservationSchedule();
  showToast("예약 요청 목록을 정리했습니다.");
});

// Admin notice form submit
adminNoticeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isReservationAdmin()) {
    showToast("관리자만 공지사항을 등록할 수 있습니다.");
    return;
  }

  if (adminNoticeInput) {
    const saved = await addNotice(adminNoticeInput.value);

    if (saved) {
      adminNoticeInput.value = "";
    }
  }
});

// Inner tabs click handler (Notices vs Reservation Status)
document.querySelectorAll(".notice-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.noticeTab;
    document.querySelectorAll(".notice-tab-btn").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });

    const tabBoard = document.querySelector("#notice-tab-board");
    const tabStatus = document.querySelector("#notice-tab-status");
    if (tabBoard) tabBoard.hidden = tabName !== "board";
    if (tabStatus) tabStatus.hidden = tabName !== "status";
  });
});

// Mobile responsive tabs click handler (Notices panel vs Reservation Form)
reservationTabs?.addEventListener("click", (event) => {
  const tabBtn = event.target.closest("[data-res-tab]");
  if (!tabBtn) return;

  reservationTabs.querySelectorAll(".reservation-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn === tabBtn);
  });

  const tabType = tabBtn.dataset.resTab;
  if (resModalBody) {
    resModalBody.className = `reservation-modal-body show-${tabType}`;
  }
});

window.addEventListener("science-lab-auth-change", () => {
  renderDashboard();
  renderReservationSchedule();
  renderReservationAdminPanel();
  renderNotices();
});

async function initializeSupabaseStorage() {
  const loadedInventoryEdits = await loadSupabaseInventoryEdits();
  const loadedReservations = await loadSupabaseReservations();
  const loadedNotices = await loadSupabaseNotices();

  if (loadedInventoryEdits) {
    renderDashboard();
  }

  if (loadedReservations) {
    renderReservationAdminPanel();
    renderReservationSchedule();
  }

  if (loadedNotices) {
    renderNotices();
  }
}

initializeSupabaseStorage();

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

tableBody.addEventListener("change", (event) => {
  const field = event.target.closest("[data-edit-field]");

  if (!field) {
    return;
  }

  updateInventoryItemField(field.dataset.itemId, field.dataset.editField, field.value);
});

tableBody.addEventListener("focusout", (event) => {
  const field = event.target.closest("[data-edit-field]");

  if (!field) {
    return;
  }

  updateInventoryItemField(field.dataset.itemId, field.dataset.editField, field.value);
});

tableBody.addEventListener("click", (event) => {
  if (event.target.closest("[data-edit-field]")) {
    event.stopPropagation();
    return;
  }

  const row = event.target.closest("[data-item-id]");

  if (!row) {
    return;
  }

  selectInventoryItem(row.dataset.itemId);
});

tableBody.addEventListener("keydown", (event) => {
  if (event.target.closest("[data-edit-field]")) {
    return;
  }

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

/* ==========================================
   About Page Event Handlers & Routing
   ========================================== */

function openAboutPage(options = {}) {
  if (!aboutPage) return;

  // Close prep room if open
  closePrepRoom({ fromHistory: true });

  // Hide home sections
  const hero = document.querySelector(".hero");
  const spaces = document.querySelector(".spaces");
  if (hero) hero.style.display = "none";
  if (spaces) spaces.style.display = "none";

  // Show about page
  aboutPage.hidden = false;
  renderAboutPageNotices();

  // Set active nav link
  document.querySelectorAll(".site-nav a").forEach((link) => {
    link.classList.toggle("is-active", link.id === "nav-about-open");
  });

  if (options.pushHistory !== false) {
    try {
      if (history.state?.view !== "about") {
        history.pushState({ view: "about" }, "", "#about");
      }
    } catch {
      // Local environments might restrict history
    }
  }
}

function closeAboutPage() {
  if (!aboutPage) return;

  aboutPage.hidden = true;

  // Restore home sections
  const hero = document.querySelector(".hero");
  const spaces = document.querySelector(".spaces");
  if (hero) hero.style.display = "";
  if (spaces) spaces.style.display = "";

  // Reset active nav link
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const isNow = link.getAttribute("href") === "#" && !link.id;
    link.classList.toggle("is-active", isNow);
  });
}

// Nav link click event wiring
document.querySelectorAll(".site-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    const id = link.id;

    if (id === "nav-about-open") {
      event.preventDefault();
      openAboutPage();
    } else if (href === "#") {
      event.preventDefault();
      closeAboutPage();
      closePrepRoom();
      try {
        history.pushState({ view: "home" }, "", "#");
      } catch {}
    } else if (href === "#spaces") {
      closeAboutPage();
      closePrepRoom();
    }
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (mobileMenu && !mobileMenu.hidden) {
      closeMobileMenu();
    }
    if (itemDetailModal && !itemDetailModal.hidden) {
      closeItemDetailModal();
    }
    if (reservationModal && !reservationModal.hidden) {
      closeReservationModal();
    }
  }
});

window.addEventListener("popstate", (event) => {
  if (event.state?.view === "prep") {
    openInventoryView(filterState.area, { pushHistory: false, reset: false });
    closeAboutPage();
    return;
  }

  if (event.state?.view === "about") {
    openAboutPage({ pushHistory: false });
    return;
  }

  closePrepRoom({ fromHistory: true });
  closeAboutPage();
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

// Initial routing check on load
if (window.location.hash === "#prep-room") {
  openInventoryView("시약", { pushHistory: false });
} else if (window.location.hash === "#about") {
  openAboutPage({ pushHistory: false });
}
