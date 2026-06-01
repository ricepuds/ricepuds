const SUPABASE_URL = "https://exgbktkirqnqyjvbwupp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4Z2JrdGtpcnFucXlqdmJ3dXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM2OTksImV4cCI6MjA5NDQyOTY5OX0._Oposq5zl8n0O96qk9I1pgUPi6XeNEuMq_Hz8Bgh5kg";
const ADMIN_EMAILS = ["rices2114@gmail.com"];

const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}

function getAccountInitial(email) {
  const normalized = normalizeEmail(email);
  return (normalized[0] || "?").toUpperCase();
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function isLowStockReagent(reagent) {
  const initial = Number(reagent.initialAmount);
  const remaining = Number(reagent.remainingAmount);

  if (!Number.isFinite(remaining)) {
    return false;
  }

  if (Number.isFinite(initial) && initial > 0 && remaining / initial <= 0.2) {
    return true;
  }

  return remaining > 0 && remaining <= 50;
}

function getInventorySummary() {
  const reagents = Array.isArray(window.REAGENTS) ? window.REAGENTS : [];
  const labItems = Array.isArray(window.LAB_ITEMS) ? window.LAB_ITEMS : [];
  const alertCount = reagents.filter((item) => item?.toxic || isLowStockReagent(item)).length;

  return {
    total: reagents.length + labItems.length,
    reagents: reagents.length,
    equipment: labItems.length,
    alerts: alertCount,
  };
}

function setText(selector, text) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = text;
  }
}

function getAuthErrorMessage(error, mode) {
  const message = String(error?.message || "").toLowerCase();

  if (!supabaseClient) {
    return "Supabase 연결을 불러오지 못했습니다. 잠시 후 새로고침해주세요.";
  }

  if (message.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (message.includes("email not confirmed")) {
    return "Supabase에서 이메일 확인이 켜져 있습니다. 이메일 인증 없이 쓰려면 Email provider의 Confirm email을 꺼주세요.";
  }

  if (message.includes("already registered")) {
    return "이미 가입된 이메일입니다. 로그인으로 들어가세요.";
  }

  if (message.includes("rate limit") || Number(error?.status) === 429) {
    return "Supabase 요청 제한에 걸렸습니다. 잠시 후 다시 시도해주세요.";
  }

  return error?.message || (mode === "signup" ? "회원가입에 실패했습니다." : "로그인에 실패했습니다.");
}

function showAuthToast(message) {
  const toast = document.querySelector(".toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showAuthToast.timer);
  showAuthToast.timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function initAuth() {
  const loginBtn = document.querySelector("#login-btn");
  const accountBtn = document.querySelector("#account-btn");
  const accountLabel = document.querySelector("#account-label");
  const accountAvatar = document.querySelector("#account-avatar");
  const loginModal = document.querySelector("#login-modal");
  const accountModal = document.querySelector("#account-modal");
  const closeModalBtn = document.querySelector("#close-login-modal");
  const closeAccountModalBtn = document.querySelector("#close-account-modal");
  const loginForm = document.querySelector("#login-form");
  const loginErrorMsg = document.querySelector("#login-error-msg");
  const heroNoteText = document.querySelector(".hero-note");
  const authTabs = document.querySelectorAll(".auth-tab");
  const submitBtn = document.querySelector("#auth-submit-btn");
  const modalTitle = document.querySelector("#modal-title");
  const modalSubtitle = document.querySelector("#auth-modal-subtitle");
  const authHelper = document.querySelector("#auth-helper");
  const accountAdminOpen = document.querySelector("#account-admin-open");
  const logoutButtons = document.querySelectorAll("[data-logout]");
  const adminPanel = document.querySelector("#admin-panel");
  let currentMode = "login";

  function setAuthMode(mode = "login") {
    currentMode = mode === "signup" ? "signup" : "login";

    authTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === currentMode);
    });

    if (modalTitle) {
      modalTitle.textContent = currentMode === "signup" ? "계정 만들기" : "로그인";
    }

    if (modalSubtitle) {
      modalSubtitle.textContent = currentMode === "signup"
        ? "새 계정은 Supabase에 저장됩니다."
        : "저장된 계정으로 접속합니다.";
    }

    if (authHelper) {
      authHelper.textContent = currentMode === "signup"
        ? "관리자 패널은 등록된 관리자 계정에만 표시됩니다."
        : "이메일 인증 없이 비밀번호로 접속합니다.";
    }

    submitBtn.textContent = currentMode === "signup" ? "계정 만들기" : "로그인";
    loginErrorMsg.textContent = "";
  }

  function openLoginModal(mode = "login") {
    setAuthMode(mode);
    loginModal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => loginForm.email.focus());
  }

  function closeLoginModal() {
    loginModal.hidden = true;
    document.body.style.overflow = "";
    loginErrorMsg.textContent = "";
    loginForm.reset();
  }

  function openAccountModal() {
    accountModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeAccountModal() {
    accountModal.hidden = true;
    document.body.style.overflow = "";
  }

  function updateAdminPanel(email) {
    const summary = getInventorySummary();

    setText("#admin-account-email", email);
    setText("#admin-email", email);
    setText("#admin-role-text", "관리자 계정");
    setText("#admin-account-avatar", getAccountInitial(email));
    setText("#admin-total-count", formatCount(summary.total));
    setText("#admin-reagent-count", formatCount(summary.reagents));
    setText("#admin-equipment-count", formatCount(summary.equipment));
    setText("#admin-alert-count", formatCount(summary.alerts));
  }

  function updateAuthUi(session) {
    const user = session?.user || null;
    const email = normalizeEmail(user?.email);
    const isAdmin = isAdminEmail(email);
    const initial = getAccountInitial(email);

    document.body.classList.toggle("is-admin", isAdmin);
    window.dispatchEvent(new CustomEvent("science-lab-auth-change", {
      detail: { email, isAdmin, isSignedIn: Boolean(user) },
    }));

    if (loginBtn) {
      loginBtn.hidden = Boolean(user);
    }

    if (accountBtn) {
      accountBtn.hidden = !user;
    }

    if (accountLabel) {
      accountLabel.textContent = "내 계정";
    }

    if (accountAvatar) {
      accountAvatar.textContent = initial;
    }

    setText("#account-modal-avatar", initial);
    setText("#account-email", email || "로그인 필요");
    setText("#account-role", isAdmin ? "관리자 계정" : "일반 계정");
    setText("#account-state", user ? "로그인됨" : "로그아웃됨");
    setText("#account-permission", isAdmin ? "관리자" : "일반");

    if (accountAdminOpen) {
      accountAdminOpen.hidden = !isAdmin;
    }

    if (adminPanel) {
      adminPanel.hidden = !isAdmin;
    }

    if (isAdmin) {
      updateAdminPanel(email);
    }

    if (!user && accountModal && !accountModal.hidden) {
      closeAccountModal();
    }

    if (heroNoteText) {
      heroNoteText.innerHTML = user
        ? `<span aria-hidden="true"></span>${email} 계정으로 로그인되었습니다.`
        : '<span aria-hidden="true"></span>로그인 없이 바로 열람할 수 있습니다.';
    }
  }

  loginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    openLoginModal("login");
  });

  accountBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    openAccountModal();
  });

  closeModalBtn?.addEventListener("click", closeLoginModal);
  closeAccountModalBtn?.addEventListener("click", closeAccountModal);

  loginModal?.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      closeLoginModal();
    }
  });

  accountModal?.addEventListener("click", (event) => {
    if (event.target === accountModal) {
      closeAccountModal();
    }
  });

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setAuthMode(tab.dataset.tab);
    });
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = normalizeEmail(loginForm.email.value);
    const password = String(loginForm.password.value || "");

    if (!email || !password) {
      loginErrorMsg.textContent = "이메일과 비밀번호를 입력해주세요.";
      return;
    }

    if (!supabaseClient) {
      loginErrorMsg.textContent = getAuthErrorMessage(null, currentMode);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = currentMode === "signup" ? "계정 만드는 중..." : "로그인 중...";
    loginErrorMsg.textContent = "";

    try {
      if (currentMode === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: email.split("@")[0],
            },
          },
        });

        if (error) {
          loginErrorMsg.textContent = getAuthErrorMessage(error, "signup");
          return;
        }

        if (!data?.session) {
          loginErrorMsg.textContent = "Supabase에서 이메일 확인이 켜져 있어 바로 로그인되지 않았습니다. Confirm email을 꺼주세요.";
          return;
        }

        closeLoginModal();
        showAuthToast("계정을 만들고 로그인했습니다.");
        return;
      }

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        loginErrorMsg.textContent = getAuthErrorMessage(error, "login");
        return;
      }

      closeLoginModal();
      showAuthToast("로그인되었습니다.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = currentMode === "signup" ? "계정 만들기" : "로그인";
    }
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }

      closeAccountModal();
      showAuthToast("로그아웃되었습니다.");
    });
  });

  accountAdminOpen?.addEventListener("click", () => {
    closeAccountModal();

    if (typeof window.openLabInventory === "function") {
      window.openLabInventory("전체");
    } else {
      window.location.hash = "prep-room";
    }
  });

  if (!supabaseClient) {
    updateAuthUi(null);
    return;
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthUi(session);
  });

  supabaseClient.auth.getSession().then(({ data }) => {
    updateAuthUi(data?.session || null);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth);
} else {
  initAuth();
}
