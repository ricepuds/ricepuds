const soonLinks = document.querySelectorAll("[data-soon]");
const openPrepLinks = document.querySelectorAll("[data-open-prep]");
const reservationOpenLinks = document.querySelectorAll("[data-reservation-open]");
const reservationModal = document.querySelector("#reservation-modal");
const reservationCloseButtons = document.querySelectorAll("[data-reservation-close]");
const reservationForm = document.querySelector("#reservation-form");
const reservationDateInput = document.querySelector("#reservation-date");
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
const filterState = {
  area: "시약",
  category: "all",
  status: "all",
  sort: "id",
  query: "",
};
let inventoryItems = [];
let toastTimer;

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
  visibleCount.textContent = rows.length.toLocaleString("ko-KR");
  emptyState.hidden = rows.length > 0;

  tableBody.innerHTML = rows
    .map((item, index) => {
      const statusClass = getStatusClass(item);
      const statusLabel = getStatusLabel(item);
      const detail = item.area === "시약"
        ? `${item.detail}${item.formula && item.formula !== "-" ? ` · ${item.formula}` : ""}`
        : item.detail;

      return `
        <tr>
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

function openReservationModal() {
  if (!reservationModal) {
    return;
  }

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

reservationModal?.addEventListener("click", (event) => {
  if (event.target === reservationModal) {
    closeReservationModal();
  }
});

reservationForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  closeReservationModal();
  reservationForm.reset();
  showToast("과학실 예약 요청이 접수되었습니다.");
});

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
