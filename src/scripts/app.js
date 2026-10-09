/* Sales OS local-first interface. No analytics, cookies, trackers, or external APIs. */
const root = document.documentElement.dataset.root || "./";
const userStore = window.SalesOSUserStore;
const rowChevron = document.getElementById("ui-row-chevron")?.innerHTML || "";
const statusLabels = {
  not_started: "Не начато",
  in_progress: "Изучаю",
  theory_completed: "Теория изучена",
  mastered: "Навык освоен",
  self_reviewed: "Самопроверка",
  completed: "Выполнено",
};
let contentIndex = null;
let contentIndexPromise = null;
let state = userStore.initialState;
const noteEditors = new Map();
const practiceEditors = new Map();
let pendingImport = null;
let pendingRestore = null;
function defaultState() {
  return {
    format: "sales-os-v5",
    version: 5,
    lessonStatuses: {},
    practiceStatuses: {},
    bookmarks: [],
    practiceDrafts: {},
    practiceAttempts: {},
    trainerSessions: {},
    today: window.SalesOSToday.empty(),
    revisitQueue: {},
    revisitHistory: [],
    noteMergeSources: {},
    lastExport: null,
    lastVisited: null,
    legacyImported: false,
  };
}
function renderUserState() {
  window.dispatchEvent(new Event("salesstatechange"));
  document.querySelectorAll("[data-status-control]").forEach((el) => {
    const statuses =
      el.dataset.kind === "theory"
        ? state.lessonStatuses
        : state.practiceStatuses;
    el.value = statuses[el.dataset.statusControl] || "not_started";
  });
  bookmarkSync();
  if (contentIndex) updateProgress(contentIndex);
}
function updateStorageWarning(mode, errorMessage = "") {
  const main = document.querySelector("#main");
  if (!main) return;
  let warning = document.querySelector("#storage-warning");
  if (!errorMessage && mode === "indexeddb") {
    warning?.remove();
    return;
  }
  if (!warning) {
    warning = document.createElement("section");
    warning.id = "storage-warning";
    warning.className = "notice storage-warning";
    warning.setAttribute("role", "status");
    warning.setAttribute("aria-live", "polite");
    main.prepend(warning);
  }
  warning.replaceChildren();
  const message = document.createElement("p");
  message.textContent =
    errorMessage ||
    (mode === "memory"
      ? "Браузер не разрешил постоянное хранилище. Изменения останутся только в этой вкладке; скачайте резервную копию до перехода на другую страницу или закрытия окна."
      : "IndexedDB недоступна. Данные сохраняются через резервное хранилище браузера, у которого ниже лимит. Регулярно скачивайте резервную копию.");
  warning.append(message);
  const exportButton = document.createElement("button");
  exportButton.className = "btn smallbtn";
  exportButton.type = "button";
  exportButton.textContent = "Скачать резервную копию";
  exportButton.addEventListener("click", () => {
    exportData().catch(() => toast("Не удалось подготовить резервную копию"));
  });
  warning.append(exportButton);
}
userStore.ready.then(({ state: loadedState, mode }) => {
  state = loadedState;
  renderUserState();
  updateStorageWarning(mode);
  for (const editor of practiceEditors.values()) editor.receiveState(state);
  renderReviewQueue();
  renderBackupCenter();
});
userStore.subscribe(handleStoreMessage);
userStore.subscribe((message) => {
  if (
    message.source !== userStore.clientId ||
    (message.type !== "state" && message.type !== "replace") ||
    !document.querySelector(".stat-grid [data-global-theory]")
  )
    return;
  void refreshHomeProgress();
});
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("on");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("on"), 3500);
}
const themeLabels = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};
function showTheme(pref) {
  let dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector("[data-theme-color]")
    ?.setAttribute("content", dark ? "#000000" : "#ffffff");
  document
    .querySelectorAll("[data-theme-select]")
    .forEach((e) => (e.value = pref));
  document.querySelectorAll("[data-theme-picker]").forEach((picker) => {
    const trigger = picker.querySelector("[data-theme-trigger]");
    const label = themeLabels[pref] ?? themeLabels.system;
    const labelElement = trigger?.querySelector("[data-theme-label]");
    if (labelElement) labelElement.textContent = label;
    trigger?.setAttribute("aria-label", `Цветовая тема: ${label}`);
    picker.querySelectorAll("[data-theme-option]").forEach((option) => {
      const selected = option.dataset.themeOption === pref;
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  });
}
const currentTheme = () => userStore.readTheme();
function setThemePreference(pref) {
  userStore.writeTheme(pref);
  showTheme(pref);
  toast("Тема изменена");
}
showTheme(currentTheme());
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (currentTheme() === "system") showTheme("system");
  });
document.querySelectorAll("[data-theme-select]").forEach((el) =>
  el.addEventListener("change", () => {
    setThemePreference(el.value);
  }),
);
const themePicker = document.querySelector("[data-theme-picker]");
if (themePicker) {
  const themeTrigger = themePicker.querySelector("[data-theme-trigger]");
  const themeOptions = [...themePicker.querySelectorAll("[data-theme-option]")];
  const selectedThemeOption = () =>
    themeOptions.find(
      (option) => option.dataset.themeOption === currentTheme(),
    ) || themeOptions[0];
  const closeThemePicker = (restoreFocus = false) => {
    themePicker.open = false;
    themeTrigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) themeTrigger?.focus();
  };

  themePicker.addEventListener("toggle", () => {
    const isOpen = themePicker.open;
    themeTrigger?.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) selectedThemeOption()?.focus({ preventScroll: true });
  });
  themePicker.addEventListener("keydown", (event) => {
    const currentIndex = themeOptions.indexOf(event.target);
    if (event.key === "Escape" && themePicker.open) {
      event.preventDefault();
      closeThemePicker(true);
      return;
    }
    if (event.key === "Tab" && themePicker.open) {
      closeThemePicker();
      return;
    }
    if (
      event.target === themeTrigger &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      themePicker.open = true;
      themeTrigger?.setAttribute("aria-expanded", "true");
      selectedThemeOption()?.focus({ preventScroll: true });
      return;
    }
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = currentIndex + 1;
    else if (event.key === "ArrowUp") nextIndex = currentIndex - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = themeOptions.length - 1;
    else return;

    event.preventDefault();
    themeOptions[
      (nextIndex + themeOptions.length) % themeOptions.length
    ].focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (themePicker.open && !themePicker.contains(event.target))
      closeThemePicker();
  });
  themeOptions.forEach((option) =>
    option.addEventListener("click", () => {
      const pref = option.dataset.themeOption;
      if (!pref) return;
      if (pref !== currentTheme()) setThemePreference(pref);
      closeThemePicker(true);
    }),
  );
}
const sideNavigation = document.querySelector("#side-navigation");
const menuToggle = document.querySelector("[data-menu-toggle]");
const drawerBackground = document.querySelector("[data-drawer-background]");
const mobileNavigation = window.matchMedia("(max-width: 768px)");
let previousBodyOverflow = "";
function toggleMenu(on, restoreFocus = true) {
  if (!sideNavigation) return;
  const mobile = mobileNavigation.matches;
  const open = Boolean(on && mobile);
  const wasOpen = document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  menuToggle?.setAttribute("aria-expanded", String(open));

  if (open) {
    sideNavigation.inert = false;
    sideNavigation.setAttribute("aria-hidden", "false");
    sideNavigation.setAttribute("role", "dialog");
    sideNavigation.setAttribute("aria-modal", "true");
    if (!wasOpen) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    sideNavigation.querySelector("[data-menu-close]")?.focus({
      preventScroll: true,
    });
    if (drawerBackground) {
      drawerBackground.inert = true;
      drawerBackground.setAttribute("aria-hidden", "true");
    }
    return;
  }

  if (drawerBackground) {
    drawerBackground.inert = false;
    drawerBackground.removeAttribute("aria-hidden");
  }
  sideNavigation.inert = mobile;
  sideNavigation.setAttribute("aria-hidden", String(mobile));
  sideNavigation.removeAttribute("role");
  sideNavigation.removeAttribute("aria-modal");
  if (wasOpen) document.body.style.overflow = previousBodyOverflow;
  if (wasOpen && restoreFocus && mobile) menuToggle?.focus();
}
menuToggle?.addEventListener("click", () =>
  toggleMenu(!document.body.classList.contains("menu-open")),
);
document
  .querySelector(".mobile-shade")
  ?.addEventListener("click", () => toggleMenu(false));
document
  .querySelector("[data-menu-close]")
  ?.addEventListener("click", () => toggleMenu(false));
mobileNavigation.addEventListener("change", () => toggleMenu(false, false));
toggleMenu(false, false);
document.addEventListener("keydown", (e) => {
  if (document.body.classList.contains("menu-open")) {
    if (e.key === "Escape") {
      e.preventDefault();
      toggleMenu(false);
      return;
    }
    if (e.key === "Tab" && sideNavigation) {
      const items = [
        ...sideNavigation.querySelectorAll(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (item) =>
          item.getClientRects().length > 0 &&
          !item.closest("[hidden], [inert]") &&
          item.getAttribute("aria-hidden") !== "true",
      );
      const currentIndex = items.indexOf(document.activeElement);
      const nextIndex = e.shiftKey
        ? currentIndex <= 0
          ? items.length - 1
          : currentIndex - 1
        : currentIndex < 0 || currentIndex >= items.length - 1
          ? 0
          : currentIndex + 1;
      e.preventDefault();
      (items[nextIndex] || sideNavigation).focus();
      return;
    }
  }
  if (
    (e.key === "/" &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement)) ||
    (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))
  ) {
    e.preventDefault();
    location.href = root + "search/";
  }
});
async function getIndex() {
  if (contentIndex) return contentIndex;
  if (!contentIndexPromise) {
    contentIndexPromise = (async () => {
      const response = await fetch(root + "assets/client-index.json");
      if (!response.ok) throw new Error("index unavailable");
      contentIndex = await response.json();
      return contentIndex;
    })();
  }
  try {
    return await contentIndexPromise;
  } catch (error) {
    contentIndexPromise = null;
    throw error;
  }
}
function isDone(e) {
  let value =
    e.kind === "theory"
      ? state.lessonStatuses[e.id]
      : state.practiceStatuses[e.id];
  return e.kind === "theory"
    ? value === "theory_completed" || value === "mastered"
    : value === "completed" || value === "self_reviewed";
}
function statusOf(e) {
  return e.kind === "theory"
    ? state.lessonStatuses[e.id]
    : state.practiceStatuses[e.id];
}
function coursePlan(idx) {
  const modules = Object.values(idx.entries)
    .filter((entry) => entry.kind === "module")
    .sort((a, b) => a.module.localeCompare(b.module, "en", { numeric: true }));
  return modules.flatMap((module) => {
    const inModule = Object.values(idx.entries).filter(
      (entry) => entry.module === module.module,
    );
    const requiredLessons = inModule
      .filter((entry) => entry.kind === "theory" && entry.level !== "advanced")
      .sort((a, b) => a.order - b.order);
    const requiredPractice = inModule
      .filter(
        (entry) => entry.kind === "practice" && entry.level !== "advanced",
      )
      .sort((a, b) => a.order - b.order);
    return [...requiredLessons, ...requiredPractice];
  });
}
function hrefForLearningEntry(entry) {
  return (
    root +
    (entry.kind === "practice" ? "practice/" : "lesson/") +
    encodeURIComponent(entry.id) +
    "/"
  );
}
function updateLearningNextSteps(idx) {
  const returnCard = document.querySelector("[data-return-card]");
  const returnLink = document.querySelector("[data-return]");
  const returnTitle = document.querySelector("[data-return-title]");
  const last = state.lastVisited && idx.entries[state.lastVisited];
  if (
    returnCard &&
    returnLink &&
    returnTitle &&
    last &&
    (last.kind === "theory" || last.kind === "practice")
  ) {
    returnCard.hidden = false;
    returnLink.href = hrefForLearningEntry(last);
    returnTitle.textContent = last.title;
    returnLink.textContent = "Вернуться к последнему материалу →";
  } else if (returnCard) {
    returnCard.hidden = true;
  }

  const continueLink = document.querySelector("[data-continue]");
  const programTitle = document.querySelector("[data-program-title]");
  const programDescription = document.querySelector(
    "[data-program-description]",
  );
  if (!continueLink || !programTitle || !programDescription) return;

  const plan = coursePlan(idx);
  const current =
    plan.find((entry) => statusOf(entry) === "in_progress") ||
    plan.find((entry) => !isDone(entry));
  if (!current) {
    continueLink.href = root + "final-project/";
    continueLink.textContent = "Открыть итоговый проект →";
    programTitle.textContent = "Основной маршрут завершён";
    programDescription.textContent =
      "Все обязательные уроки и практики отмечены. Продвинутые темы по-прежнему доступны из любого модуля.";
    return;
  }

  const position = plan.indexOf(current);
  const previous = position > 0 ? plan[position - 1] : null;
  continueLink.href = hrefForLearningEntry(current);
  continueLink.textContent = "Продолжить программу →";
  programTitle.textContent = current.title;
  if (current.kind === "practice") {
    programDescription.textContent = `Темы модуля ${current.module} идут перед упражнениями. Отметьте, что уже изучили, и примените знания в этой практике.`;
  } else if (
    previous &&
    previous.module !== current.module &&
    isDone(previous)
  ) {
    programDescription.textContent = `Основные темы и практика модуля ${previous.module} завершены. Следующий обязательный шаг — модуль ${current.module}.`;
  } else if (position === 0) {
    programDescription.textContent =
      "Начните с обязательных основ. Продвинутые темы доступны напрямую и не блокируются прогрессом.";
  } else {
    programDescription.textContent = `Следующая незавершённая обязательная тема модуля ${current.module}. Продвинутые материалы остаются доступны отдельно.`;
  }
}
function statIndex(idx) {
  const es = Object.values(idx.entries);
  let theory = es.filter((e) => e.kind === "theory"),
    practice = es.filter((e) => e.kind === "practice");
  return {
    theory: theory.length,
    practice: practice.length,
    theoryDone: theory.filter(isDone).length,
    practiceDone: practice.filter(isDone).length,
  };
}
function updateProgress(idx) {
  const st = statIndex(idx);
  const total = st.theory + st.practice;
  const globalPct = Math.round(
    ((st.theoryDone + st.practiceDone) / total) * 100,
  );
  document
    .querySelectorAll("[data-global-theory]")
    .forEach((el) => (el.textContent = st.theoryDone + " / " + st.theory));
  document
    .querySelectorAll("[data-global-practice]")
    .forEach((el) => (el.textContent = st.practiceDone + " / " + st.practice));
  document
    .querySelectorAll("[data-global-pct]")
    .forEach((el) => (el.textContent = globalPct + "%"));
  document
    .querySelectorAll("[data-global-fill]")
    .forEach((el) => (el.style.transform = `scaleX(${globalPct / 100})`));
  document.querySelectorAll("[data-global-progress]").forEach((el) => {
    el.setAttribute("aria-valuenow", String(globalPct));
    el.setAttribute("aria-valuetext", `${globalPct}%`);
  });
  for (const el of document.querySelectorAll("[data-module-pct]")) {
    const mod = el.dataset.modulePct;
    let arr = Object.values(idx.entries).filter(
      (e) => e.module === mod && e.kind !== "module",
    );
    let done = arr.filter(isDone).length;
    let pct = Math.round((done / arr.length) * 100);
    el.textContent = `${pct}%`;
  }
  for (const el of document.querySelectorAll("[data-module-progress]")) {
    const mod = el.dataset.moduleProgress;
    const arr = Object.values(idx.entries).filter(
      (e) => e.module === mod && e.kind !== "module",
    );
    const pct = Math.round((arr.filter(isDone).length / arr.length) * 100);
    el.setAttribute("aria-valuenow", String(pct));
    el.setAttribute("aria-valuetext", `${pct}%`);
  }
  for (const el of document.querySelectorAll("[data-module-fill]")) {
    const mod = el.dataset.moduleFill;
    let arr = Object.values(idx.entries).filter(
      (e) => e.module === mod && e.kind !== "module",
    );
    const pct = Math.round((arr.filter(isDone).length / arr.length) * 100);
    el.style.transform = `scaleX(${pct / 100})`;
  }
  for (const el of document.querySelectorAll("[data-topic-status]")) {
    const e = idx.entries[el.dataset.topicStatus];
    if (!e) continue;
    let value =
      e.kind === "theory"
        ? state.lessonStatuses[e.id]
        : state.practiceStatuses[e.id];
    el.textContent = statusLabels[value] || "Не начато";
    el.classList.toggle("ok", isDone(e));
  }
  for (const link of document.querySelectorAll("[data-module-continue]")) {
    const plan = coursePlan(idx).filter(
      (entry) => entry.module === link.dataset.moduleContinue,
    );
    const next =
      plan.find((entry) => statusOf(entry) === "in_progress") ||
      plan.find((entry) => !isDone(entry));
    link.href = next ? hrefForLearningEntry(next) : root + "final-project/";
    link.textContent = next
      ? "Продолжить модуль"
      : "Перейти к итоговому проекту";
  }
  updateLearningNextSteps(idx);
}
let latestHomeProgressRefresh = 0;
async function refreshHomeProgress() {
  const request = ++latestHomeProgressRefresh;
  try {
    const [latestState, idx] = await Promise.all([
      userStore.getState(),
      getIndex(),
    ]);
    if (request !== latestHomeProgressRefresh) return;
    state = latestState;
    updateProgress(idx);
  } catch {
    // The home route keeps its last rendered progress when the public index is unavailable.
  }
}
getIndex()
  .then((idx) => {
    updateProgress(idx);
    window.addEventListener("salesstatechange", () => updateProgress(idx));
  })
  .catch(() => {});
const docId = document.body.dataset.docId;
const docKind = document.body.dataset.docKind;
if (docId && (docKind === "theory" || docKind === "practice")) {
  userStore
    .updateState((current) => ({ ...current, lastVisited: docId }))
    .then((result) => {
      state = result.state;
      renderUserState();
      if (!result.durable)
        updateStorageWarning(
          result.mode,
          "Не удалось надёжно сохранить прогресс. Изменение доступно в этой вкладке — скачайте резервную копию перед выходом.",
        );
    });
}
document.querySelectorAll("[data-status-control]").forEach((el) => {
  const id = el.dataset.statusControl,
    kind = el.dataset.kind;
  el.value =
    (kind === "theory" ? state.lessonStatuses : state.practiceStatuses)[id] ||
    "not_started";
  el.addEventListener("change", async () => {
    const value = el.value;
    const field = kind === "theory" ? "lessonStatuses" : "practiceStatuses";
    try {
      const result = await userStore.updateState((current) => ({
        ...current,
        [field]: { ...current[field], [id]: value },
      }));
      state = result.state;
      renderUserState();
      if (result.durable) toast("Прогресс сохранён");
      else {
        updateStorageWarning(
          result.mode,
          "Прогресс изменён, но не сохранён надёжно. Скачайте резервную копию до выхода.",
        );
        toast("Прогресс доступен только во временной памяти");
      }
    } catch {
      el.value =
        (kind === "theory" ? state.lessonStatuses : state.practiceStatuses)[
          id
        ] || "not_started";
      updateStorageWarning(
        userStore.getMode(),
        "Не удалось сохранить прогресс. Прежние сохранённые данные не изменены.",
      );
      toast("Не удалось сохранить прогресс");
    }
  });
});
function bookmarkSync() {
  document.querySelectorAll("[data-bookmark]").forEach((el) => {
    const b = state.bookmarks.includes(el.dataset.bookmark);
    el.setAttribute("aria-pressed", String(b));
    const label = el.querySelector("[data-bookmark-label]");
    if (label) label.textContent = b ? "В закладках" : "В закладки";
    else el.textContent = b ? "В закладках" : "В закладки";
  });
}
bookmarkSync();
document.querySelectorAll("[data-bookmark]").forEach((el) =>
  el.addEventListener("click", async () => {
    const id = el.dataset.bookmark;
    try {
      const result = await userStore.updateState((current) => ({
        ...current,
        bookmarks: current.bookmarks.includes(id)
          ? current.bookmarks.filter((item) => item !== id)
          : [...current.bookmarks, id],
      }));
      state = result.state;
      renderUserState();
      if (result.durable)
        toast(
          state.bookmarks.includes(id)
            ? "Сохранено в закладках"
            : "Удалено из закладок",
        );
      else {
        updateStorageWarning(
          result.mode,
          "Закладка изменена, но не сохранена надёжно. Скачайте резервную копию до выхода.",
        );
        toast("Изменение доступно только во временной памяти");
      }
    } catch {
      bookmarkSync();
      updateStorageWarning(
        userStore.getMode(),
        "Не удалось сохранить закладку. Прежние сохранённые данные не изменены.",
      );
      toast("Не удалось сохранить закладку");
    }
  }),
);
// User notes are saved only on this device. IDB transactions arbitrate edits across tabs.
function setNoteStatus(editor, message, stateName) {
  editor.saveLabel.textContent = message;
  editor.saveLabel.dataset.state = stateName;
}
function addButton(parent, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn smallbtn";
  button.textContent = label;
  button.addEventListener("click", action);
  parent.append(button);
  return button;
}
function createNoteEditor(el) {
  const id = el.dataset.note;
  const container = el.closest(".editbox");
  const saveLabel = container?.querySelector("[data-save-hint]");
  if (!container || !saveLabel) return null;
  saveLabel.setAttribute("role", "status");
  saveLabel.setAttribute("aria-live", "polite");

  let revision = 0;
  let noteGeneration = 0;
  let editVersion = 0;
  let dirty = false;
  let saveInFlight = false;
  let timer = null;
  let conflictRecord = null;
  const fallbackPanel = document.createElement("div");
  fallbackPanel.className = "notice note-recovery";
  fallbackPanel.hidden = true;
  const fallbackText = document.createElement("p");
  fallbackText.textContent =
    "Ответ остался в поле, но браузер не подтвердил сохранение. Скачайте копию перед уходом со страницы.";
  fallbackPanel.append(fallbackText);
  addButton(fallbackPanel, "Скачать резервную копию", () => {
    exportData().catch(() => toast("Не удалось подготовить резервную копию"));
  });
  container.append(fallbackPanel);

  const conflictPanel = document.createElement("div");
  conflictPanel.className = "notice note-conflict";
  conflictPanel.hidden = true;
  conflictPanel.setAttribute("role", "group");
  conflictPanel.setAttribute("aria-label", "Разрешение конфликта заметки");
  const conflictText = document.createElement("p");
  conflictPanel.append(conflictText);
  addButton(conflictPanel, "Использовать сохранённую версию", () => {
    if (!conflictRecord) return;
    el.value = conflictRecord.text;
    revision = conflictRecord.revision;
    noteGeneration = conflictRecord.generation;
    editVersion++;
    dirty = false;
    conflictRecord = null;
    conflictPanel.hidden = true;
    fallbackPanel.hidden = true;
    userStore.clearDraft(id);
    setNoteStatus({ saveLabel }, "Загружена версия из другой вкладки", "saved");
  });
  addButton(conflictPanel, "Сохранить мой текст вместо этой версии", () => {
    if (!conflictRecord) return;
    revision = conflictRecord.revision;
    noteGeneration = conflictRecord.generation;
    conflictRecord = null;
    conflictPanel.hidden = true;
    dirty = true;
    setNoteStatus({ saveLabel }, "Сохраняем выбранную версию…", "saving");
    scheduleSave();
  });
  container.append(conflictPanel);

  const editor = {
    id,
    element: el,
    saveLabel,
    get dirty() {
      return dirty;
    },
    get revision() {
      return revision;
    },
    showConflict(record) {
      if (!record || record.writerId === userStore.clientId) return;
      conflictRecord = record;
      conflictText.textContent =
        "В другой вкладке сохранена новая версия этой заметки. Ваш текст оставлен здесь; выберите, какую версию оставить.";
      conflictPanel.hidden = false;
      setNoteStatus(
        { saveLabel },
        "Конфликт версий — выберите вариант ниже",
        "conflict",
      );
    },
    receiveRecord(record) {
      if (record.revision === revision && record.text === el.value) {
        noteGeneration = record.generation;
        return;
      }
      if (dirty) {
        this.showConflict(record);
        return;
      }
      revision = record.revision;
      noteGeneration = record.generation;
      el.value = record.text;
      setNoteStatus({ saveLabel }, "Обновлено в другой вкладке", "saved");
    },
    replaceFromImport(record) {
      revision = record.revision;
      noteGeneration = record.generation;
      editVersion++;
      dirty = false;
      conflictRecord = null;
      el.value = record.text;
      conflictPanel.hidden = true;
      fallbackPanel.hidden = true;
      setNoteStatus({ saveLabel }, "Заметка заменена импортом", "saved");
    },
    cacheDraft() {
      if (dirty) userStore.cacheDraft(id, el.value, revision, noteGeneration);
    },
    flush() {
      if (dirty) void persistEditor();
    },
  };

  async function persistEditor() {
    if (!dirty || saveInFlight) return;
    saveInFlight = true;
    try {
      await persistCurrentEditorValue();
    } finally {
      saveInFlight = false;
    }
  }

  async function persistCurrentEditorValue() {
    const savedVersion = editVersion;
    const text = el.value;
    setNoteStatus({ saveLabel }, "Сохраняем…", "saving");
    const result = await userStore.saveNote(id, text, revision, noteGeneration);
    if (!result.ok && result.reason === "conflict") {
      dirty = true;
      editor.showConflict(result.record);
      userStore.cacheDraft(id, el.value, revision, noteGeneration);
      return;
    }
    if (!result.ok) {
      dirty = true;
      userStore.cacheDraft(id, el.value, revision, noteGeneration);
      fallbackPanel.hidden = false;
      setNoteStatus(
        { saveLabel },
        "Не удалось сохранить — текст остался в поле",
        "error",
      );
      updateStorageWarning(
        result.mode,
        "Браузер не подтвердил сохранение пользовательских данных. Текст заметки остаётся на странице; скачайте резервную копию до выхода.",
      );
      return;
    }

    revision = result.record.revision;
    noteGeneration = result.record.generation;
    userStore.clearDraft(id);
    fallbackPanel.hidden = true;
    if (savedVersion === editVersion && text === el.value) {
      dirty = false;
      conflictRecord = null;
      conflictPanel.hidden = true;
      setNoteStatus({ saveLabel }, "Сохранено на этом устройстве", "saved");
      return;
    }
    dirty = true;
    setNoteStatus(
      { saveLabel },
      "Предыдущие изменения сохранены; сохраняем новые…",
      "saving",
    );
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      persistEditor().catch(() => {
        dirty = true;
        fallbackPanel.hidden = false;
        setNoteStatus(
          { saveLabel },
          "Не удалось сохранить — текст остался в поле",
          "error",
        );
        updateStorageWarning(
          userStore.getMode(),
          "Не удалось сохранить пользовательские данные. Скачайте резервную копию до выхода.",
        );
      });
    }, 450);
  }

  el.addEventListener("input", () => {
    dirty = true;
    editVersion++;
    fallbackPanel.hidden = true;
    setNoteStatus({ saveLabel }, "Несохранённые изменения", "dirty");
    scheduleSave();
  });

  userStore
    .getNote(id)
    .then(({ record, draft }) => {
      if (dirty) return;
      revision = record.revision;
      noteGeneration = record.generation;
      if (draft) {
        el.value = draft.text;
        dirty = true;
        editVersion++;
        if (
          draft.baseRevision !== record.revision ||
          draft.baseGeneration !== record.generation
        ) {
          revision = draft.baseRevision;
          noteGeneration = draft.baseGeneration;
          editor.showConflict(record);
        } else {
          noteGeneration = record.generation;
          setNoteStatus(
            { saveLabel },
            "Восстановлен незавершённый ответ — сохраняем…",
            "dirty",
          );
          scheduleSave();
        }
      } else {
        el.value = record.text;
        setNoteStatus(
          { saveLabel },
          record.text ? "Сохранено на этом устройстве" : "Изменений нет",
          record.text ? "saved" : "idle",
        );
      }
    })
    .catch(() => {
      setNoteStatus(
        { saveLabel },
        "Не удалось прочитать сохранённую заметку",
        "error",
      );
    });

  return editor;
}
for (const el of document.querySelectorAll("[data-note]")) {
  const editor = createNoteEditor(el);
  if (editor) noteEditors.set(editor.id, editor);
}
function createPracticeClientId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
function practiceDraftFromForm(form) {
  const answers = Object.fromEntries(
    [...form.querySelectorAll("[data-practice-answer]")].map((field) => [
      field.dataset.practiceAnswer,
      field.value,
    ]),
  );
  const selfReview = Object.fromEntries(
    [...form.querySelectorAll("[data-practice-review]:checked")].map(
      (field) => [field.dataset.practiceReview, Number(field.value)],
    ),
  );
  return {
    answers,
    selfReview,
    nextStep: form.querySelector("[data-practice-next]")?.value || "",
  };
}
function hydratePracticeForm(form, draft = {}) {
  const answers = draft.answers || {};
  for (const field of form.querySelectorAll("[data-practice-answer]"))
    field.value = answers[field.dataset.practiceAnswer] || "";
  const ratings = draft.selfReview || {};
  for (const field of form.querySelectorAll("[data-practice-review]"))
    field.checked =
      String(ratings[field.dataset.practiceReview]) === field.value;
  const nextStep = form.querySelector("[data-practice-next]");
  if (nextStep) nextStep.value = draft.nextStep || "";
  updateCriteriaProgress(form);
}
function updateCriteriaProgress(form) {
  const fields = [...form.querySelectorAll("[data-practice-answer]")];
  const filled = fields.filter((field) => field.value.trim());
  const workspace = form.closest(".practice-workspace");
  const progress = workspace?.querySelector("[data-criteria-progress]");
  if (progress)
    progress.textContent = `Заполнено ${filled.length} из ${fields.length}`;
  for (const field of fields) {
    const link = workspace?.querySelector(
      `.criterion-nav a[href="#criterion-${form.dataset.practiceForm}-${field.dataset.practiceAnswer}"]`,
    );
    if (link) link.dataset.filled = String(Boolean(field.value.trim()));
  }
}
function createPracticeFormEditor(form) {
  const id = form.dataset.practiceForm;
  const workspace = form.closest(".practice-workspace");
  const status = form.querySelector("[data-practice-draft-status]");
  const versionsPanel = workspace?.querySelector("[data-practice-versions]");
  const versionsList = workspace?.querySelector(
    "[data-practice-versions-list]",
  );
  const historyList = workspace?.querySelector("[data-practice-history-list]");
  const historyCount = workspace?.querySelector(
    "[data-practice-history-count]",
  );
  if (!id || !workspace || !status || !historyList || !historyCount)
    return null;
  let dirty = false;
  let timer = null;
  let baseUpdatedAt = 0;
  let conflictDraft = null;
  let editVersion = 0;
  let saving = null;
  const conflictPanel = document.createElement("div");
  conflictPanel.className = "notice practice-conflict";
  conflictPanel.hidden = true;
  conflictPanel.setAttribute("role", "group");
  conflictPanel.setAttribute("aria-label", "Разрешение конфликта черновика");
  const conflictText = document.createElement("p");
  conflictText.textContent =
    "В другой вкладке черновик изменился. Сохраните оба варианта или загрузите последнюю версию.";
  const useRemote = document.createElement("button");
  useRemote.type = "button";
  useRemote.className = "btn smallbtn";
  useRemote.textContent = "Загрузить сохранённый вариант";
  const keepBoth = document.createElement("button");
  keepBoth.type = "button";
  keepBoth.className = "btn smallbtn";
  keepBoth.textContent = "Сохранить мой вариант отдельно";
  conflictPanel.append(conflictText, useRemote, keepBoth);
  form.append(conflictPanel);

  function renderVersions(draft) {
    if (!versionsPanel || !versionsList) return;
    versionsList.replaceChildren();
    const versions = draft?.versions || [];
    versionsPanel.hidden = versions.length === 0;
    versions.forEach((version, index) => {
      const row = document.createElement("div");
      row.className = "draft-version";
      const text = document.createElement("span");
      text.textContent = `Вариант ${index + 1} · ${version.updatedAt ? formatTimestamp(version.updatedAt) : "дата не указана"}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn smallbtn";
      button.textContent = "Открыть в форме";
      button.addEventListener("click", () => {
        hydratePracticeForm(form, version);
        dirty = true;
        editVersion++;
        baseUpdatedAt = state.practiceDrafts?.[id]?.updatedAt || baseUpdatedAt;
        status.textContent =
          "Загружен сохранённый вариант — проверьте и сохраните";
        scheduleSave();
      });
      row.append(text, button);
      versionsList.append(row);
    });
  }

  function renderHistory(attempts = []) {
    historyList.replaceChildren();
    historyCount.textContent = `${attempts.length} ${attempts.length === 1 ? "сохранено" : "сохранено"}`;
    if (!attempts.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Сохранённых итераций пока нет.";
      historyList.append(empty);
      return;
    }
    for (const [index, attempt] of [...attempts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .entries()) {
      const details = document.createElement("details");
      details.className = "practice-attempt";
      const summary = document.createElement("summary");
      summary.textContent = `Итерация ${attempts.length - index} · ${formatTimestamp(attempt.createdAt)}`;
      const content = document.createElement("div");
      content.className = "practice-attempt-content";
      for (const criterion of attempt.rubric || []) {
        const answer = document.createElement("p");
        const label = document.createElement("strong");
        label.textContent = criterion.label;
        const body = document.createElement("span");
        body.textContent =
          attempt.answers?.[criterion.id] || "Ответ не записан.";
        const rating = attempt.selfReview?.[criterion.id];
        const self = document.createElement("span");
        self.className = "small muted";
        self.textContent =
          rating === undefined
            ? "Самопроверка не выбрана"
            : ["Пока не выполнено", "Частично", "Выполнено по условию"][rating];
        answer.append(
          label,
          document.createElement("br"),
          body,
          document.createElement("br"),
          self,
        );
        content.append(answer);
      }
      if (attempt.nextStep) {
        const next = document.createElement("p");
        next.textContent = `Следующая итерация: ${attempt.nextStep}`;
        content.append(next);
      }
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "btn smallbtn";
      restore.textContent = "Продолжить с этой версией";
      restore.addEventListener("click", () => {
        hydratePracticeForm(form, attempt);
        dirty = true;
        editVersion++;
        status.textContent = "Исторический ответ загружен как новый черновик";
        scheduleSave();
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      content.append(restore);
      details.append(summary, content);
      historyList.append(details);
    }
  }

  function receiveState(nextState, replaced = false) {
    const remote = nextState.practiceDrafts?.[id];
    renderVersions(remote);
    renderHistory(nextState.practiceAttempts?.[id] || []);
    if (!dirty) {
      hydratePracticeForm(form, remote);
      baseUpdatedAt = remote?.updatedAt || 0;
      status.textContent = remote?.updatedAt
        ? `Черновик сохранён ${formatTimestamp(remote.updatedAt)}`
        : "Черновик хранится только в этом браузере";
      conflictDraft = null;
      conflictPanel.hidden = true;
      return;
    }
    if (
      replaced ||
      (remote &&
        remote.writerId !== userStore.clientId &&
        remote.updatedAt !== baseUpdatedAt)
    ) {
      conflictDraft = remote || {
        answers: {},
        selfReview: {},
        nextStep: "",
        updatedAt: 0,
        writerId: "replaced",
      };
      conflictPanel.hidden = false;
      status.textContent =
        "Черновик обновлён в другой вкладке — выберите вариант";
      clearTimeout(timer);
    }
  }

  async function saveDraft() {
    clearTimeout(timer);
    if (!dirty) return true;
    if (conflictDraft) return false;
    if (saving) return saving;
    const editAtStart = editVersion;
    const candidate = {
      ...practiceDraftFromForm(form),
      updatedAt: Date.now(),
      writerId: userStore.clientId,
      versions: state.practiceDrafts?.[id]?.versions || [],
    };
    saving = userStore
      .updateState((current) => {
        const latest = current.practiceDrafts?.[id];
        if (
          latest &&
          latest.updatedAt !== baseUpdatedAt &&
          latest.writerId !== userStore.clientId
        ) {
          conflictDraft = latest;
          return current;
        }
        return {
          ...current,
          practiceDrafts: { ...current.practiceDrafts, [id]: candidate },
        };
      })
      .then((result) => {
        state = result.state;
        if (conflictDraft) {
          conflictPanel.hidden = false;
          status.textContent =
            "Черновик изменён в другой вкладке — сохраните оба варианта";
          return false;
        }
        baseUpdatedAt = candidate.updatedAt;
        if (editVersion === editAtStart) {
          dirty = false;
          status.textContent = result.durable
            ? `Черновик сохранён ${formatTimestamp(candidate.updatedAt)}`
            : "Черновик доступен только во временной памяти";
        } else {
          status.textContent = "Сохраняются последние изменения…";
          scheduleSave();
        }
        if (!result.durable)
          updateStorageWarning(
            result.mode,
            "Черновик практики не сохранён надёжно. Скачайте резервную копию до выхода.",
          );
        return true;
      })
      .finally(() => {
        saving = null;
      });
    return saving;
  }

  function showSaveError() {
    status.textContent =
      "Не удалось сохранить — ответ остался в форме. Попробуйте сохранить ещё раз или скачайте резервную копию.";
    updateStorageWarning(
      userStore.getMode(),
      "Черновик не сохранён надёжно. Ответ остаётся в форме; скачайте резервную копию до выхода.",
    );
  }
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => void saveDraft().catch(showSaveError), 450);
  }

  async function saveSeparateVersion() {
    if (!conflictDraft) return;
    const local = {
      ...practiceDraftFromForm(form),
      updatedAt: Date.now(),
      writerId: userStore.clientId,
    };
    const result = await userStore.updateState((current) => {
      const latest = current.practiceDrafts?.[id] || conflictDraft;
      const versions = [...(latest.versions || [])];
      if (
        !versions.some(
          (version) => JSON.stringify(version) === JSON.stringify(local),
        )
      )
        versions.push(local);
      return {
        ...current,
        practiceDrafts: {
          ...current.practiceDrafts,
          [id]: { ...latest, versions: versions.slice(-20) },
        },
      };
    });
    state = result.state;
    dirty = false;
    conflictDraft = null;
    conflictPanel.hidden = true;
    receiveState(state);
    status.textContent = "Оба черновика сохранены отдельно на этом устройстве";
  }

  useRemote.addEventListener("click", () => {
    const latest = state.practiceDrafts?.[id] || conflictDraft;
    hydratePracticeForm(form, latest);
    baseUpdatedAt = latest?.updatedAt || 0;
    dirty = false;
    conflictDraft = null;
    conflictPanel.hidden = true;
    status.textContent = "Загружен вариант из другой вкладки";
  });
  keepBoth.addEventListener("click", () =>
    saveSeparateVersion().catch(() =>
      toast("Не удалось сохранить оба черновика"),
    ),
  );
  form.addEventListener("input", () => {
    updateCriteriaProgress(form);
    dirty = true;
    editVersion++;
    status.textContent = "Несохранённые изменения — сохраняем черновик…";
    scheduleSave();
  });
  form.addEventListener("change", () => {
    dirty = true;
    editVersion++;
    scheduleSave();
  });
  let submitting = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    const buttons = document.querySelectorAll(
      `[data-practice-save], [data-practice-save-top]`,
    );
    const submitButtons = [...buttons].filter((button) => button.form === form);
    submitButtons.forEach((button) => (button.disabled = true));
    try {
      if (!(await saveDraft())) return;
      const snapshot = practiceDraftFromForm(form);
      if (!Object.values(snapshot.answers).some((answer) => answer.trim())) {
        status.textContent =
          "Сначала добавьте ответ хотя бы по одному критерию.";
        form.querySelector("[data-practice-answer]")?.focus();
        return;
      }
      const rubric = [
        ...form.querySelectorAll("[data-practice-criterion]"),
      ].map((item) => ({
        id: item.dataset.practiceCriterion,
        label: item.dataset.practiceLabel,
        description: item.dataset.practiceDescription,
      }));
      const attempt = {
        id: createPracticeClientId(),
        createdAt: Date.now(),
        rubric,
        ...snapshot,
      };
      const result = await userStore.updateState((current) => {
        const history = current.practiceAttempts?.[id] || [];
        const previous = history[history.length - 1];
        const signature = (item) =>
          JSON.stringify({
            answers: item.answers,
            selfReview: item.selfReview,
            nextStep: item.nextStep || "",
          });
        if (previous && signature(previous) === signature(attempt))
          return current;
        return {
          ...current,
          practiceAttempts: {
            ...current.practiceAttempts,
            [id]: [...history, attempt],
          },
        };
      });
      state = result.state;
      renderHistory(state.practiceAttempts?.[id] || []);
      status.textContent = result.durable
        ? "Итерация сохранена в истории на этом устройстве"
        : "Итерация доступна только во временной памяти";
      if (!result.durable)
        updateStorageWarning(
          result.mode,
          "История практики не сохранена надёжно. Скачайте резервную копию до выхода.",
        );
    } catch {
      showSaveError();
    } finally {
      submitting = false;
      submitButtons.forEach((button) => (button.disabled = false));
    }
  });
  const editor = {
    get dirty() {
      return dirty;
    },
    saveDraft,
    receiveState,
  };
  void userStore
    .getState()
    .then(receiveState)
    .catch(() => {
      status.textContent =
        "Не удалось прочитать черновик из локального хранилища.";
    });
  return editor;
}
for (const form of document.querySelectorAll("[data-practice-form]")) {
  const editor = createPracticeFormEditor(form);
  if (editor) practiceEditors.set(form.dataset.practiceForm, editor);
}
const recallBuffers = new Map();
const recallTimers = new Map();
function renderRevisitItem(item, entry) {
  const card = document.createElement("article");
  card.className = "revisit-card";
  const head = document.createElement("div");
  head.className = "revisit-card-head";
  const link = document.createElement("a");
  link.className = "revisit-title";
  link.href = hrefForLearningEntry(entry);
  link.textContent = entry.title;
  const due = document.createElement("span");
  due.className = "small muted";
  due.textContent = `Срок: ${formatTimestamp(item.dueAt)}`;
  head.append(link, due);
  const prompt = document.createElement("p");
  prompt.className = "revisit-prompt";
  prompt.textContent = item.prompt;
  const label = document.createElement("label");
  const fieldId = `recall-${entry.id}`;
  label.htmlFor = fieldId;
  label.textContent = "Что вы помните до перечитывания?";
  const answer = document.createElement("textarea");
  answer.id = fieldId;
  answer.dataset.recallId = entry.id;
  answer.rows = 3;
  answer.maxLength = 10000;
  answer.placeholder = "Сначала запишите то, что вспомнилось…";
  answer.value = recallBuffers.get(entry.id)?.dirty
    ? recallBuffers.get(entry.id).text
    : item.recallDraft || "";
  const actions = document.createElement("div");
  actions.className = "revisit-actions";
  const complete = document.createElement("button");
  complete.type = "button";
  complete.className = "btn smallbtn";
  complete.dataset.reviewDone = entry.id;
  complete.textContent = "Отметить просмотренным";
  const linkButton = document.createElement("a");
  linkButton.className = "btn smallbtn";
  linkButton.href = hrefForLearningEntry(entry);
  linkButton.textContent = "Открыть материал";
  const delay = document.createElement("select");
  delay.dataset.reviewDelay = entry.id;
  delay.setAttribute("aria-label", `Отложить повторение: ${entry.title}`);
  for (const [value, text] of [
    ["1", "Завтра"],
    ["3", "Через 3 дня"],
    ["7", "Через неделю"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    delay.append(option);
  }
  const reschedule = document.createElement("button");
  reschedule.type = "button";
  reschedule.className = "btn smallbtn";
  reschedule.dataset.reviewReschedule = entry.id;
  reschedule.textContent = "Перенести";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn smallbtn";
  remove.dataset.reviewRemove = entry.id;
  remove.textContent = "Убрать из очереди";
  actions.append(linkButton, complete, delay, reschedule, remove);
  card.append(head, prompt, label, answer, actions);
  return card;
}
async function renderReviewQueue() {
  const counter = document.querySelector("[data-review-count]");
  const rootElement = document.querySelector("[data-review-queue]");
  try {
    const current = await userStore.getState();
    state = current;
    const items = Object.values(current.revisitQueue || {}).filter((item) =>
      Number.isFinite(item.dueAt),
    );
    if (counter) {
      const dueCount = items.filter((item) => item.dueAt <= Date.now()).length;
      counter.textContent = String(dueCount);
      counter.hidden = dueCount === 0;
      counter.setAttribute("aria-label", `${dueCount} повтора пора выполнить`);
    }
    if (!rootElement) return;
    const index = await getIndex();
    const validItems = items.filter((item) => index.entries[item.entryId]);
    const dueGroup = rootElement.querySelector("[data-review-due-group]");
    const dueList = rootElement.querySelector("[data-review-due-list]");
    const dueCount = rootElement.querySelector("[data-review-due-count]");
    const upcomingGroup = rootElement.querySelector(
      "[data-review-upcoming-group]",
    );
    const upcomingList = rootElement.querySelector(
      "[data-review-upcoming-list]",
    );
    const empty = rootElement.querySelector("[data-review-empty]");
    const error = rootElement.querySelector("[data-review-error]");
    const due = validItems
      .filter((item) => item.dueAt <= Date.now())
      .sort((a, b) => a.dueAt - b.dueAt);
    const upcoming = validItems
      .filter((item) => item.dueAt > Date.now())
      .sort((a, b) => a.dueAt - b.dueAt);
    dueList.replaceChildren(
      ...due.map((item) =>
        renderRevisitItem(item, index.entries[item.entryId]),
      ),
    );
    upcomingList.replaceChildren(
      ...upcoming.map((item) =>
        renderRevisitItem(item, index.entries[item.entryId]),
      ),
    );
    dueGroup.hidden = due.length === 0;
    dueCount.textContent = String(due.length);
    upcomingGroup.hidden = upcoming.length === 0;
    empty.hidden = validItems.length > 0;
    error.hidden = true;
    rootElement.setAttribute("aria-busy", "false");
  } catch {
    if (rootElement) {
      rootElement.setAttribute("aria-busy", "false");
      rootElement.querySelector("[data-review-error]").hidden = false;
      rootElement.querySelector("[data-review-empty]").hidden = true;
    }
  }
}
async function saveRecallDraft(id, text) {
  const result = await userStore.updateState((current) => {
    const item = current.revisitQueue?.[id];
    if (!item) return current;
    return {
      ...current,
      revisitQueue: {
        ...current.revisitQueue,
        [id]: { ...item, recallDraft: text },
      },
    };
  });
  state = result.state;
  const buffer = recallBuffers.get(id);
  if (buffer) buffer.dirty = false;
  if (!result.durable)
    updateStorageWarning(result.mode, "Черновик повтора не сохранён надёжно.");
}
document
  .querySelector("[data-review-queue]")
  ?.addEventListener("input", (event) => {
    const field = event.target.closest("[data-recall-id]");
    if (!field) return;
    const id = field.dataset.recallId;
    recallBuffers.set(id, { text: field.value, dirty: true });
    clearTimeout(recallTimers.get(id));
    recallTimers.set(
      id,
      setTimeout(() => void saveRecallDraft(id, field.value), 450),
    );
  });
document
  .querySelector("[data-review-queue]")
  ?.addEventListener("click", async (event) => {
    const button =
      event.target instanceof Element ? event.target.closest("button") : null;
    const id =
      button?.dataset.reviewDone ||
      button?.dataset.reviewReschedule ||
      button?.dataset.reviewRemove;
    if (!id) return;
    const pendingText = recallBuffers.get(id)?.text;
    const result = await userStore.updateState((current) => {
      const item = current.revisitQueue?.[id];
      if (!item) return current;
      const recallDraft = pendingText ?? item.recallDraft ?? "";
      const queue = { ...current.revisitQueue };
      if (button.dataset.reviewDone) {
        delete queue[id];
        return {
          ...current,
          revisitQueue: queue,
          revisitHistory: [
            ...current.revisitHistory,
            { entryId: id, completedAt: Date.now(), recallDraft },
          ].slice(-500),
        };
      }
      if (button.dataset.reviewRemove) {
        delete queue[id];
        return { ...current, revisitQueue: queue };
      }
      const delay = Number(
        rootElementQuery(button, "[data-review-delay]")?.value || 1,
      );
      queue[id] = {
        ...item,
        recallDraft,
        scheduledAt: Date.now(),
        dueAt: Date.now() + delay * 86400000,
      };
      return { ...current, revisitQueue: queue };
    });
    state = result.state;
    recallBuffers.delete(id);
    clearTimeout(recallTimers.get(id));
    await renderReviewQueue();
    toast(
      button.dataset.reviewDone
        ? "Повтор отмечен просмотренным"
        : button.dataset.reviewReschedule
          ? "Повтор перенесён"
          : "Материал убран из очереди",
    );
  });
function rootElementQuery(element, selector) {
  return element.closest(".revisit-card")?.querySelector(selector);
}
for (const button of document.querySelectorAll("[data-revisit-add]")) {
  button.addEventListener("click", async () => {
    const id = button.dataset.revisitAdd;
    const delay = Number(
      document.querySelector(`[data-revisit-delay="${CSS.escape(id)}"]`)
        ?.value || 1,
    );
    const prompt = `Перед перечитыванием попробуйте вспомнить главное из материала «${button.dataset.revisitTitle}».`;
    const result = await userStore.updateState((current) => {
      const existing = current.revisitQueue?.[id];
      return {
        ...current,
        revisitQueue: {
          ...current.revisitQueue,
          [id]: {
            entryId: id,
            scheduledAt: Date.now(),
            dueAt: Date.now() + delay * 86400000,
            prompt,
            recallDraft: existing?.recallDraft || "",
          },
        },
      };
    });
    state = result.state;
    const status = document.querySelector(
      `[data-revisit-status="${CSS.escape(id)}"]`,
    );
    if (status)
      status.textContent = result.durable
        ? `Добавлено в очередь: ${formatTimestamp(result.state.revisitQueue[id].dueAt)}`
        : "Добавлено только во временную память";
    await renderReviewQueue();
  });
}
document
  .querySelector("[data-review-retry]")
  ?.addEventListener("click", () => void renderReviewQueue());
function cacheAndFlushNotes() {
  for (const editor of noteEditors.values()) {
    editor.cacheDraft();
    editor.flush();
  }
  for (const editor of practiceEditors.values()) void editor.saveDraft();
}
window.addEventListener("pagehide", cacheAndFlushNotes);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") cacheAndFlushNotes();
});
window.addEventListener("beforeunload", (event) => {
  if (
    ![...noteEditors.values()].some((editor) => editor.dirty) &&
    ![...practiceEditors.values()].some((editor) => editor.dirty)
  )
    return;
  cacheAndFlushNotes();
  event.preventDefault();
  event.returnValue = "";
});
async function handleStoreMessage(message) {
  if (message.source === userStore.clientId) return;
  if (message.type === "state" || message.type === "replace") {
    state = message.state || (await userStore.getState());
    renderUserState();
    for (const editor of practiceEditors.values())
      editor.receiveState(state, message.type === "replace");
    renderReviewQueue();
    renderBackupCenter();
  }
  if (message.type === "note" && message.id) {
    const editor = noteEditors.get(message.id);
    if (!editor) return;
    const { record } = message.record
      ? { record: message.record }
      : await userStore.getNote(message.id);
    editor.receiveRecord(record);
  }
  if (message.type === "replace") {
    for (const editor of noteEditors.values()) {
      const { record } = await userStore.getNote(editor.id);
      editor.receiveRecord(record);
    }
  }
}
async function downloadJSON(data, filename) {
  const b = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return b.size;
}
async function exportData() {
  await Promise.all(
    [...practiceEditors.values()].map((editor) => editor.saveDraft()),
  );
  const exportedState = await userStore.getState();
  const notes = await userStore.getAllNotes();
  Object.assign(notes, userStore.getDrafts());
  for (const el of document.querySelectorAll("[data-note]"))
    notes[el.dataset.note] = el.value;
  const exportedAt = Date.now();
  const sizeBytes = await downloadJSON(
    {
      ...exportedState,
      format: "sales-os-v5",
      version: 5,
      notes,
      exportedAt: new Date(exportedAt).toISOString(),
    },
    "sales-os-backup.json",
  );
  const saved = await userStore.updateState((current) => ({
    ...current,
    lastExport: { exportedAt, sizeBytes },
  }));
  state = saved.state;
  renderUserState();
  renderBackupCenter();
  toast(
    saved.durable
      ? "Резервная копия скачана"
      : "Копия скачана; дата и размер остались только в этой вкладке",
  );
}
function migrateLegacy(obj, idx) {
  const incoming = defaultState();
  if (
    !obj ||
    obj.format !== "sales-os-roadmap-v1" ||
    !isRecord(obj.checks) ||
    !isRecord(obj.notes)
  )
    throw Error("Invalid legacy export");
  for (const [key, checked] of Object.entries(obj.checks)) {
    const id = Object.hasOwn(idx.legacyMap, key) ? idx.legacyMap[key] : null;
    if (!id || checked !== true) continue;
    const e = idx.entries[id];
    if (e.kind === "theory") incoming.lessonStatuses[id] = "theory_completed";
    if (e.kind === "practice") incoming.practiceStatuses[id] = "self_reviewed";
  }
  incoming.legacyImported = true;
  const notes = {};
  for (const [oldIndex, content] of Object.entries(obj.notes)) {
    if (
      !/^(?:[0-9]|1[0-9]|2[01])$/.test(oldIndex) ||
      typeof content !== "string"
    )
      continue;
    const md = String(Number(oldIndex) + 1).padStart(2, "0");
    if (idx.entries[md + "-MODULE"]) notes[md + "-MODULE"] = content;
  }
  return { incoming, notes };
}
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function validateBackupState(obj, idx) {
  if (
    !obj ||
    !(
      (obj.format === "sales-os-v2" && obj.version === 2) ||
      (obj.format === "sales-os-v3" && obj.version === 3) ||
      (obj.format === "sales-os-v4" && obj.version === 4) ||
      (obj.format === "sales-os-v5" && obj.version === 5)
    ) ||
    !isRecord(obj.lessonStatuses) ||
    !isRecord(obj.practiceStatuses) ||
    !Array.isArray(obj.bookmarks)
  )
    throw Error("Invalid backup format");
  const next = defaultState();
  const allowedLesson = new Set([
    "not_started",
    "in_progress",
    "theory_completed",
    "mastered",
  ]);
  const allowedPractice = new Set([
    "not_started",
    "in_progress",
    "self_reviewed",
    "completed",
  ]);
  for (const [id, value] of Object.entries(obj.lessonStatuses)) {
    if (
      !Object.hasOwn(idx.entries, id) ||
      idx.entries[id].kind !== "theory" ||
      !allowedLesson.has(value)
    )
      throw Error("Invalid lesson status");
    next.lessonStatuses[id] = value;
  }
  for (const [id, value] of Object.entries(obj.practiceStatuses)) {
    if (
      !Object.hasOwn(idx.entries, id) ||
      idx.entries[id].kind !== "practice" ||
      !allowedPractice.has(value)
    )
      throw Error("Invalid practice status");
    next.practiceStatuses[id] = value;
  }
  for (const id of obj.bookmarks) {
    if (
      typeof id !== "string" ||
      !Object.hasOwn(idx.entries, id) ||
      idx.entries[id].kind === "module"
    )
      throw Error("Invalid bookmark ID");
  }
  next.bookmarks = [...new Set(obj.bookmarks)];
  next.lastVisited =
    typeof obj.lastVisited === "string" &&
    Object.hasOwn(idx.entries, obj.lastVisited) &&
    ["theory", "practice"].includes(idx.entries[obj.lastVisited].kind)
      ? obj.lastVisited
      : null;
  next.legacyImported = obj.legacyImported === true;
  if (obj.version >= 3) {
    next.practiceDrafts = validatePracticeDrafts(obj.practiceDrafts, idx);
    next.practiceAttempts = validatePracticeAttempts(obj.practiceAttempts, idx);
    next.revisitQueue = validateRevisitQueue(obj.revisitQueue, idx);
    next.revisitHistory = validateRevisitHistory(obj.revisitHistory, idx);
    next.noteMergeSources = validateNoteMergeSources(obj.noteMergeSources, idx);
    next.lastExport = validateLastExport(obj.lastExport);
  }
  if (obj.version >= 4)
    next.trainerSessions = window.SalesOSTrainer.validateSessions(
      obj.trainerSessions,
    );
  else if (obj.trainerSessions !== undefined)
    throw Error("Сессии тренажёра требуют формат sales-os-v4");
  if (obj.version === 5) next.today = window.SalesOSToday.validate(obj.today);
  else if (obj.today !== undefined)
    throw Error("Занятия требуют формат sales-os-v5");
  return next;
}
function isWorkspaceId(id, idx) {
  return (
    id === "FINAL_PROJECT" ||
    (Object.hasOwn(idx.entries, id) && idx.entries[id].kind === "practice")
  );
}
function validatePracticeDrafts(raw, idx) {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw Error("Invalid practice drafts");
  const drafts = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isWorkspaceId(id, idx) || !isRecord(value))
      throw Error("Invalid practice draft ID");
    const validateTextMap = (map) => {
      if (map === undefined) return {};
      if (
        !isRecord(map) ||
        Object.entries(map).some(
          ([key, text]) =>
            !/^criterion-\d{1,2}$/.test(key) ||
            typeof text !== "string" ||
            text.length > 10000,
        )
      )
        throw Error("Invalid practice draft text");
      return { ...map };
    };
    const validateRatings = (map) => {
      if (map === undefined) return {};
      if (
        !isRecord(map) ||
        Object.entries(map).some(
          ([key, rating]) =>
            !/^criterion-\d{1,2}$/.test(key) || ![0, 1, 2].includes(rating),
        )
      )
        throw Error("Invalid practice self-review");
      return { ...map };
    };
    const versions = value.versions ?? [];
    if (!Array.isArray(versions) || versions.length > 20)
      throw Error("Invalid draft versions");
    drafts[id] = {
      answers: validateTextMap(value.answers),
      selfReview: validateRatings(value.selfReview),
      nextStep:
        typeof value.nextStep === "string" && value.nextStep.length <= 10000
          ? value.nextStep
          : "",
      updatedAt:
        Number.isFinite(value.updatedAt) && value.updatedAt >= 0
          ? value.updatedAt
          : 0,
      writerId:
        typeof value.writerId === "string"
          ? value.writerId.slice(0, 100)
          : "imported",
      versions: versions.map((version) => {
        if (!isRecord(version)) throw Error("Invalid draft version");
        return {
          answers: validateTextMap(version.answers),
          selfReview: validateRatings(version.selfReview),
          nextStep:
            typeof version.nextStep === "string" &&
            version.nextStep.length <= 10000
              ? version.nextStep
              : "",
          updatedAt:
            Number.isFinite(version.updatedAt) && version.updatedAt >= 0
              ? version.updatedAt
              : 0,
          writerId:
            typeof version.writerId === "string"
              ? version.writerId.slice(0, 100)
              : "imported",
        };
      }),
    };
  }
  return drafts;
}
function validatePracticeAttempts(raw, idx) {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw Error("Invalid practice attempts");
  const attempts = {};
  let count = 0;
  let characters = 0;
  for (const [id, list] of Object.entries(raw)) {
    if (!isWorkspaceId(id, idx) || !Array.isArray(list))
      throw Error("Invalid practice attempt ID");
    attempts[id] = list.map((attempt) => {
      if (
        !isRecord(attempt) ||
        typeof attempt.id !== "string" ||
        attempt.id.length > 100 ||
        !Number.isFinite(attempt.createdAt) ||
        !Array.isArray(attempt.rubric) ||
        attempt.rubric.length < 3 ||
        attempt.rubric.length > 30 ||
        !isRecord(attempt.answers) ||
        !isRecord(attempt.selfReview) ||
        Object.values(attempt.answers).some(
          (answer) => typeof answer !== "string" || answer.length > 10000,
        ) ||
        Object.entries(attempt.selfReview).some(
          ([key, rating]) =>
            !/^criterion-\d{1,2}$/.test(key) || ![0, 1, 2].includes(rating),
        ) ||
        (attempt.nextStep !== undefined &&
          (typeof attempt.nextStep !== "string" ||
            attempt.nextStep.length > 10000))
      )
        throw Error("Invalid practice attempt");
      const rubric = attempt.rubric.map((criterion, index) => {
        if (
          !isRecord(criterion) ||
          typeof criterion.label !== "string" ||
          criterion.label.length > 500 ||
          typeof criterion.description !== "string" ||
          criterion.description.length > 2000
        )
          throw Error("Invalid rubric snapshot");
        return {
          id: `criterion-${index + 1}`,
          label: criterion.label,
          description: criterion.description,
        };
      });
      characters += [
        ...Object.values(attempt.answers),
        attempt.nextStep || "",
        ...rubric.map((x) => x.label + x.description),
      ].reduce((sum, text) => sum + text.length, 0);
      if (++count > 2000 || characters > 8000000)
        throw Error("Backup too large");
      return {
        id: attempt.id,
        createdAt: attempt.createdAt,
        rubric,
        answers: { ...attempt.answers },
        selfReview: { ...attempt.selfReview },
        nextStep: attempt.nextStep || "",
      };
    });
  }
  return attempts;
}
function validateRevisitQueue(raw, idx) {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw Error("Invalid revisit queue");
  const queue = {};
  for (const [id, item] of Object.entries(raw)) {
    if (
      !Object.hasOwn(idx.entries, id) ||
      !["theory", "practice"].includes(idx.entries[id].kind) ||
      !isRecord(item) ||
      (item.entryId !== undefined && item.entryId !== id) ||
      !Number.isFinite(item.dueAt) ||
      item.dueAt <= 0 ||
      (item.recallDraft !== undefined &&
        (typeof item.recallDraft !== "string" ||
          item.recallDraft.length > 10000)) ||
      (item.prompt !== undefined &&
        (typeof item.prompt !== "string" || item.prompt.length > 1000))
    )
      throw Error("Invalid revisit item");
    queue[id] = {
      entryId: id,
      dueAt: item.dueAt,
      scheduledAt: Number.isFinite(item.scheduledAt)
        ? item.scheduledAt
        : Date.now(),
      prompt: item.prompt || "",
      recallDraft: item.recallDraft || "",
    };
  }
  return queue;
}
function validateRevisitHistory(raw, idx) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 500)
    throw Error("Invalid revisit history");
  return raw.map((item) => {
    if (
      !isRecord(item) ||
      !Object.hasOwn(idx.entries, item.entryId) ||
      !["theory", "practice"].includes(idx.entries[item.entryId].kind) ||
      !Number.isFinite(item.completedAt) ||
      (item.recallDraft !== undefined &&
        (typeof item.recallDraft !== "string" ||
          item.recallDraft.length > 10000))
    )
      throw Error("Invalid revisit history item");
    return {
      entryId: item.entryId,
      completedAt: item.completedAt,
      recallDraft: item.recallDraft || "",
    };
  });
}
function validateNoteMergeSources(raw, idx) {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw Error("Invalid merged-note metadata");
  const sources = {};
  for (const [id, hashes] of Object.entries(raw)) {
    if (
      (!Object.hasOwn(idx.entries, id) && id !== "FINAL_PROJECT") ||
      !Array.isArray(hashes) ||
      hashes.length > 100 ||
      hashes.some((hash) => typeof hash !== "string" || hash.length > 100)
    )
      throw Error("Invalid merged-note metadata");
    sources[id] = [...new Set(hashes)];
  }
  return sources;
}
function validateLastExport(raw) {
  if (raw === undefined || raw === null) return null;
  if (
    !isRecord(raw) ||
    !Number.isFinite(raw.exportedAt) ||
    raw.exportedAt <= 0 ||
    !Number.isSafeInteger(raw.sizeBytes) ||
    raw.sizeBytes < 0
  )
    throw Error("Invalid export metadata");
  return { exportedAt: raw.exportedAt, sizeBytes: raw.sizeBytes };
}
function formatTimestamp(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}
function renderImportPreview(preview) {
  const dialog = document.querySelector("[data-import-dialog]");
  const meta = dialog?.querySelector("[data-import-file-meta]");
  const list = dialog?.querySelector("[data-import-preview]");
  if (!(meta instanceof HTMLElement) || !(list instanceof HTMLElement)) return;
  const labels = [
    ["Статусы уроков", preview.totals.lessons],
    ["Статусы практик", preview.totals.practices],
    ["Закладки", preview.totals.bookmarks],
    ["Заметки", preview.totals.notes],
    ["Итерации ответов", preview.totals.attempts],
    ["Сессии тренажёра (включая удалённые)", preview.totals.trainer],
    ["Записи в очереди повтора", preview.totals.revisit],
    ["Сохранённые занятия", preview.totals.today],
  ];
  meta.textContent = `${preview.format} · ${formatBytes(preview.bytes)}${preview.exportedAt ? ` · экспортировано ${preview.exportedAt}` : ""}`;
  list.replaceChildren();
  for (const [label, count] of labels) {
    const item = document.createElement("li");
    item.textContent = `${label}: ${count}`;
    list.append(item);
  }
}
async function renderBackupCenter() {
  const last = document.querySelector("[data-backup-last-export]");
  if (last) {
    last.textContent = state.lastExport
      ? `Последний экспорт: ${formatTimestamp(state.lastExport.exportedAt)} · ${formatBytes(state.lastExport.sizeBytes)}`
      : "Экспорт на этом устройстве ещё не выполнялся.";
  }
  const list = document.querySelector("[data-restore-points]");
  const empty = document.querySelector("[data-restore-empty]");
  if (!(list instanceof HTMLElement) || !(empty instanceof HTMLElement)) return;
  try {
    const points = await userStore.getRestorePoints();
    list.replaceChildren();
    for (const point of points) {
      const item = document.createElement("li");
      item.className = "restore-point";
      const meta = document.createElement("span");
      meta.textContent = `${formatTimestamp(point.createdAt)} · ${point.reason === "before-restore" ? "перед восстановлением" : "перед импортом"}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn smallbtn";
      button.textContent = "Восстановить";
      button.dataset.restoreId = point.id;
      item.append(meta, button);
      list.append(item);
    }
    empty.hidden = points.length > 0;
    list.hidden = points.length === 0;
  } catch {
    empty.textContent = "Не удалось прочитать локальные точки восстановления.";
    empty.hidden = false;
  }
}
document
  .querySelector("[data-restore-points]")
  ?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore-id]");
    if (!button) return;
    pendingRestore = button.dataset.restoreId;
    document.querySelector("[data-restore-dialog]")?.showModal();
  });
document
  .querySelector("[data-restore-confirm]")
  ?.addEventListener("click", async () => {
    if (!pendingRestore) return;
    try {
      const result = await userStore.restoreBackup(pendingRestore);
      state = result.state;
      renderUserState();
      document.querySelector("[data-restore-dialog]")?.close();
      pendingRestore = null;
      toast(
        result.durable
          ? "Предыдущие данные восстановлены"
          : "Восстановлено только во временной памяти",
      );
      renderBackupCenter();
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      toast(
        error instanceof Error
          ? `Не удалось восстановить копию: ${error.message}`
          : "Не удалось восстановить копию",
      );
    }
  });
function validateNotes(raw, idx) {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw Error("Invalid notes");
  const notes = {};
  let total = 0;
  for (const [id, body] of Object.entries(raw)) {
    // FINAL_PROJECT is a standalone page outside the 430-document content index.
    // Its notes must survive export/import just like lesson and module notes.
    if (
      (!Object.hasOwn(idx.entries, id) && id !== "FINAL_PROJECT") ||
      typeof body !== "string" ||
      body.length > 250000
    )
      throw Error("Invalid note");
    total += body.length;
    if (total > 8000000) throw Error("Backup too large");
    notes[id] = body;
  }
  return notes;
}
async function prepareImport(file) {
  const obj = JSON.parse(await file.text());
  const idx = await getIndex();
  let next,
    notes = {};
  if (obj.format === "sales-os-roadmap-v1") {
    const result = migrateLegacy(obj, idx);
    next = result.incoming;
    notes = validateNotes(result.notes, idx);
  } else {
    next = validateBackupState(obj, idx);
    notes = validateNotes(obj.notes, idx);
  }
  const totals = {
    lessons: Object.keys(next.lessonStatuses).length,
    practices: Object.keys(next.practiceStatuses).length,
    bookmarks: next.bookmarks.length,
    notes: Object.keys(notes).length,
    attempts: Object.values(next.practiceAttempts).reduce(
      (sum, items) => sum + items.length,
      0,
    ),
    revisit: Object.keys(next.revisitQueue).length,
    today: Object.keys(next.today.plans).length,
    trainer: Object.keys(next.trainerSessions).length,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(obj)).byteLength;
  if (bytes > 8_000_000) throw Error("Backup too large");
  return {
    state: next,
    notes,
    format: obj.format,
    exportedAt: obj.exportedAt || null,
    bytes,
    totals,
  };
}
function importWriteError(error, action) {
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("250 КБ")) return `${detail} Текущие данные не изменены.`;
  if (/quota|storage|transaction|abort|хранилищ/i.test(detail))
    return `Не удалось ${action} данные: браузер отказал в записи. Прежние сохранённые данные не изменены; проверьте свободное место и повторите попытку.`;
  return `Не удалось ${action} данные. Прежние сохранённые данные не изменены; проверьте файл и повторите попытку.`;
}
async function applyImport(strategy) {
  if (!pendingImport) return;
  const preview = pendingImport;
  pendingImport = null;
  document.querySelector("[data-import-dialog]")?.close();
  for (const editor of noteEditors.values()) editor.cacheDraft();
  await Promise.all(
    [...practiceEditors.values()].map((editor) => editor.saveDraft()),
  );
  const recoveryNotes = Object.fromEntries(
    [...document.querySelectorAll("textarea[data-note]")].map((textarea) => [
      textarea.dataset.note,
      textarea.value,
    ]),
  );
  const result = await userStore.replaceAll(preview.state, preview.notes, {
    merge: strategy === "merge",
    recoveryNotes,
  });
  state = result.state;
  renderUserState();
  for (const editor of noteEditors.values()) {
    const { record } = await userStore.getNote(editor.id);
    editor.replaceFromImport(record);
  }
  for (const editor of practiceEditors.values())
    editor.receiveState(state, strategy === "replace");
  await renderBackupCenter();
  await renderReviewQueue();
  if (result.durable) {
    toast(
      strategy === "merge"
        ? "Данные объединены; конфликтующие заметки сохранены отдельными блоками"
        : "Импорт заменил локальные данные; предыдущая версия доступна в центре резервных копий",
    );
  } else {
    updateStorageWarning(
      result.mode,
      "Импорт доступен только в этой вкладке и не сохранён надёжно. Скачайте резервную копию до выхода.",
    );
    toast("Импорт загружен только во временную память");
  }
}
document
  .querySelector("[data-export]")
  ?.addEventListener("click", () =>
    exportData().catch(() => toast("Не удалось экспортировать данные")),
  );
document
  .querySelector("[data-import]")
  ?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingImport = await prepareImport(file);
      renderImportPreview(pendingImport);
      document.querySelector("[data-import-dialog]")?.showModal();
    } catch (error) {
      toast(
        error instanceof Error
          ? `Файл не принят: ${error.message}`
          : "Файл не принят. Текущие данные не изменены.",
      );
    }
    e.target.value = "";
  });
document
  .querySelector("[data-import-merge]")
  ?.addEventListener("click", () =>
    applyImport("merge").catch((error) =>
      toast(importWriteError(error, "объединить")),
    ),
  );
document
  .querySelector("[data-import-replace]")
  ?.addEventListener("click", () =>
    applyImport("replace").catch((error) =>
      toast(importWriteError(error, "заменить")),
    ),
  );
document
  .querySelector("[data-import-cancel]")
  ?.addEventListener("click", () => {
    pendingImport = null;
    document.querySelector("[data-import-dialog]")?.close();
  });
document
  .querySelector("[data-restore-cancel]")
  ?.addEventListener("click", () => {
    pendingRestore = null;
    document.querySelector("[data-restore-dialog]")?.close();
  });
// Public search indexes are static and local; private notes never leave this browser.
function searchExcerpt(body, query) {
  const clean = String(body)
    .replace(/[#*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const term = query.trim().split(/\s+/)[0] || "";
  const position = clean
    .toLocaleLowerCase("ru")
    .indexOf(term.toLocaleLowerCase("ru"));
  let start = Math.max(0, position - 65);
  if (start) {
    const boundary = clean.indexOf(" ", start);
    if (boundary >= 0) start = boundary + 1;
  }
  let end = Math.min(clean.length, start + 220);
  if (end < clean.length) {
    const boundary = clean.lastIndexOf(" ", end);
    if (boundary > start) end = boundary;
  }
  return (
    (start ? "…" : "") +
    clean.slice(start, end) +
    (end < clean.length ? "…" : "")
  );
}
function highlightSearch(text, query) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) return escapeHtml(text);
  const expression = new RegExp(
    terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "giu",
  );
  let cursor = 0,
    html = "";
  for (const match of text.matchAll(expression)) {
    html +=
      escapeHtml(text.slice(cursor, match.index)) +
      "<mark>" +
      escapeHtml(match[0]) +
      "</mark>";
    cursor = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}
const searchInput = document.querySelector("[data-search-input]");
if (searchInput) {
  const params = new URLSearchParams(location.search);
  searchInput.value = params.get("q") || "";
  const resultRoot = document.querySelector("[data-search-results]");
  const searchStatus = document.querySelector("[data-search-status]");
  const moreButton = document.querySelector("[data-search-more]");
  let visibleLimit = 60;
  const levelFilter = document.querySelector("[data-search-level]");
  const moduleFilter = document.querySelector("[data-search-module]");
  const kindFilter = document.querySelector("[data-search-kind]");
  const privateToggle = document.querySelector("[data-search-private]");
  const filterControls = [
    { key: "level", control: levelFilter },
    { key: "module", control: moduleFilter },
    { key: "kind", control: kindFilter },
  ].flatMap((item) =>
    item.control instanceof HTMLSelectElement ? [item] : [],
  );
  const filters = filterControls.map((item) => item.control);
  for (const { key, control } of filterControls) {
    if ([...control.options].some((option) => option.value === params.get(key)))
      control.value = params.get(key);
  }
  let pagefind = null,
    searchIndex = [],
    fallbackLoaded = false,
    searchReady = false,
    serial = 0,
    lastTimer;
  // Remove the incoming query immediately; a phrase can itself contain a note.
  history.replaceState(null, "", location.pathname);
  const normalized = (s) =>
    s
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  async function loadFallbackIndex() {
    if (fallbackLoaded) return;
    const response = await fetch(root + "assets/search-index.json");
    if (!response.ok) throw new Error("Search index request failed");
    const items = await response.json();
    if (
      !Array.isArray(items) ||
      items.some(
        (item) =>
          typeof item.id !== "string" ||
          typeof item.title !== "string" ||
          typeof item.text !== "string" ||
          typeof item.url !== "string" ||
          !["required", "advanced", "extra"].includes(item.level) ||
          ![
            "theory",
            "practice",
            "module",
            "final_project",
            "library",
            "source",
          ].includes(item.kind),
      )
    )
      throw new Error("Invalid search index");
    searchIndex = items.map((item) => ({
      ...item,
      _title: normalized(item.title),
      _body: normalized(item.text),
    }));
    fallbackLoaded = true;
  }
  function showSearchError() {
    searchReady = false;
    searchStatus.textContent = "";
    resultRoot.innerHTML =
      '<div class="notice" role="alert">Не удалось загрузить индекс поиска. Проверьте соединение и повторите попытку. <button class="btn smallbtn" type="button" data-search-retry>Повторить</button></div>';
    resultRoot.setAttribute("aria-busy", "false");
    searchStatus.setAttribute("aria-busy", "false");
    resultRoot
      .querySelector("[data-search-retry]")
      ?.addEventListener("click", () => void initializeSearch(), {
        once: true,
      });
  }
  async function initializeSearch() {
    searchReady = false;
    resultRoot.setAttribute("aria-busy", "true");
    searchStatus.textContent = "Загрузка поиска…";
    searchStatus.setAttribute("aria-busy", "true");
    try {
      pagefind = null;
      searchIndex = [];
      fallbackLoaded = false;
      try {
        pagefind = await import(root + "pagefind/pagefind.js");
        await pagefind.init();
        await pagefind.filters();
      } catch {
        pagefind = null;
      }
      if (!pagefind) await loadFallbackIndex();
      searchReady = true;
      await search();
    } catch {
      showSearchError();
    }
  }
  async function search() {
    if (!searchReady) return;
    const mine = ++serial;
    resultRoot.setAttribute("aria-busy", "true");
    searchStatus.setAttribute("aria-busy", "true");
    if (moreButton) {
      moreButton.hidden = true;
      moreButton.disabled = true;
    }
    const query = searchInput.value.trim(),
      text = normalized(query);
    // Search state stays in the page, not in a request URL or browser history.
    history.replaceState(null, "", location.pathname);
    const selectedFilters = Object.fromEntries(
      filterControls
        .filter(({ control }) => control.value)
        .map(({ key, control }) => [key, control.value]),
    );
    const hasFilters = Object.keys(selectedFilters).length > 0;
    const includePrivate = Boolean(privateToggle?.checked);
    if (!text && !hasFilters && !includePrivate) {
      searchStatus.textContent =
        "Введите запрос, выберите фильтр или включите поиск по своим записям.";
      resultRoot.innerHTML = "";
      resultRoot.setAttribute("aria-busy", "false");
      searchStatus.setAttribute("aria-busy", "false");
      return;
    }
    let publicItems = [],
      publicCount = 0,
      privateItems = [],
      privateCount = 0,
      privateError = false;
    if (pagefind) {
      try {
        const match = await pagefind.search(text ? query : null, {
          filters: hasFilters ? selectedFilters : undefined,
        });
        publicCount = match.results.length;
        const hits = await Promise.all(
          match.results.slice(0, visibleLimit).map((result) => result.data()),
        );
        publicItems = hits
          .filter((item) => item.url?.startsWith("/"))
          .map((item) => ({
            id: item.meta?.id || "",
            title: item.meta?.title || item.url,
            url: item.url,
            kind: item.meta?.kind || "module",
            module: item.meta?.module || "extra",
            level: item.meta?.level || "extra",
            excerpt:
              item.plain_excerpt ||
              item.excerpt?.replace(/<[^>]*>/g, "") ||
              "Материал курса",
          }));
      } catch {
        pagefind = null;
        try {
          await loadFallbackIndex();
        } catch {
          if (mine === serial) showSearchError();
          return;
        }
      }
    }
    if (!pagefind) {
      const terms = text ? text.split(" ") : [];
      const matches = searchIndex
        .map((item) => {
          const title = item._title,
            body = item._body;
          const matchesQuery =
            !terms.length ||
            terms.every((term) => title.includes(term) || body.includes(term));
          const matchesFilters = Object.entries(selectedFilters).every(
            ([key, value]) => item[key] === value,
          );
          const score =
            matchesQuery && matchesFilters
              ? terms.reduce(
                  (total, term) =>
                    total +
                    (title.includes(term) ? 20 : 0) +
                    (body.includes(term) ? 2 : 0),
                  0,
                )
              : 0;
          return { ...item, score };
        })
        .filter(
          (item) =>
            item.score > 0 ||
            (!text &&
              Object.keys(selectedFilters).length &&
              Object.entries(selectedFilters).every(
                ([key, value]) => item[key] === value,
              )),
        )
        .sort((left, right) => right.score - left.score);
      publicCount = matches.length;
      publicItems = matches
        .slice(0, visibleLimit)
        .map((item) => ({ ...item, excerpt: searchExcerpt(item.text, query) }));
    }

    if (includePrivate) {
      try {
        const [index, savedState, savedNotes] = await Promise.all([
          getIndex(),
          userStore.getState(),
          userStore.getAllNotes(),
        ]);
        const notes = { ...savedNotes, ...userStore.getDrafts() };
        const answers = Object.fromEntries(
          Object.entries(savedState.practiceDrafts || {}).map(([id, draft]) => [
            id,
            [...Object.values(draft.answers || {}), draft.nextStep || ""].join(
              "\n",
            ),
          ]),
        );
        const entries = index.entries || {};
        const ids = new Set([
          ...savedState.bookmarks,
          ...Object.keys(notes).filter((id) => notes[id]?.trim()),
          ...Object.keys(answers).filter((id) => answers[id]?.trim()),
        ]);
        const localRecords = [...ids]
          .map((id) => {
            const entry = entries[id];
            const finalProject = id === "FINAL_PROJECT";
            if (!entry && !finalProject) return null;
            return {
              id,
              title: finalProject
                ? "От первого клиента до сделки"
                : entry.title,
              kind: finalProject ? "final_project" : entry.kind,
              module: finalProject ? "extra" : entry.module,
              level: finalProject ? "extra" : entry.level,
              url: finalProject
                ? "final-project/"
                : { theory: "lesson", practice: "practice", module: "module" }[
                    entry.kind
                  ] +
                  "/" +
                  encodeURIComponent(id) +
                  "/",
              note: [notes[id] || "", answers[id] || ""]
                .filter(Boolean)
                .join("\n"),
              bookmarked: savedState.bookmarks.includes(id),
            };
          })
          .filter(Boolean)
          .filter((item) =>
            Object.entries(selectedFilters).every(
              ([key, value]) => item[key] === value,
            ),
          )
          .filter((item) => {
            if (!text) return true;
            const haystack = normalized(
              `${item.title} ${item.note} ${item.bookmarked ? "закладка" : ""}`,
            );
            return text.split(" ").every((term) => haystack.includes(term));
          })
          .map((item) => ({
            ...item,
            excerpt: item.note
              ? searchExcerpt(item.note, query)
              : "Сохранено в закладках на этом устройстве",
          }));
        privateCount = localRecords.length;
        privateItems = localRecords.slice(0, visibleLimit);
      } catch {
        privateError = true;
      }
    }
    if (mine !== serial) return;
    const kindLabels = {
      theory: "Теория",
      practice: "Практика",
      module: "Глава модуля",
      final_project: "Итоговый проект",
      library: "Справочник",
      source: "Источник",
    };
    const renderItems = (items, privateResults = false) =>
      items
        .map((item) => {
          const href = item.url.startsWith("/")
            ? `${root}${item.url.slice(1)}`
            : `${root}${item.url}`;
          const id = item.id
            ? `<span class="number">${escapeHtml(item.id)}</span>`
            : "";
          const module =
            item.module && item.module !== "extra"
              ? ` · модуль ${escapeHtml(item.module)}`
              : "";
          const kind =
            privateResults && item.bookmarked
              ? `${kindLabels[item.kind] || "Материал"} · закладка`
              : (kindLabels[item.kind] || "Материал") + module;
          return `<a class="item" href="${escapeHtml(href)}">${id}<div class="itext"><div class="ititle">${escapeHtml(item.title)}</div><div class="isub">${escapeHtml(kind)}</div><div class="search-excerpt">${highlightSearch(searchExcerpt(item.excerpt || "Материал курса", query), query)}</div></div><span class="ic-right">${rowChevron}</span></a>`;
        })
        .join("");
    const publicHtml = publicItems.length
      ? `<section aria-label="Материалы курса">${publicItems.map((item) => renderItems([item])).join("")}</section>`
      : "";
    const privateHtml = privateItems.length
      ? `<section class="search-private-result" aria-label="Личные записи"><h2 class="h2">На этом устройстве</h2>${renderItems(privateItems, true)}</section>`
      : "";
    resultRoot.innerHTML = publicHtml + privateHtml;
    const publicSummary = publicCount
      ? `Материалов: ${publicCount}. Показано: ${publicItems.length}.`
      : "Совпадений в материалах нет.";
    const privateSummary = includePrivate
      ? privateError
        ? " Не удалось прочитать личные записи; они не отправлялись в запрос."
        : ` Личных совпадений: ${privateCount}. Показано: ${privateItems.length}.`
      : "";
    searchStatus.textContent = `${publicSummary}${privateSummary}`;
    if (moreButton) {
      moreButton.hidden =
        publicItems.length >= publicCount &&
        privateItems.length >= privateCount;
      moreButton.disabled = false;
    }
    resultRoot.setAttribute("aria-busy", "false");
    searchStatus.setAttribute("aria-busy", "false");
  }
  searchInput.addEventListener("input", () => {
    visibleLimit = 60;
    clearTimeout(lastTimer);
    lastTimer = setTimeout(search, 180);
  });
  filters.forEach((control) =>
    control.addEventListener("change", () => {
      visibleLimit = 60;
      void search();
    }),
  );
  privateToggle?.addEventListener("change", () => {
    visibleLimit = 60;
    void search();
  });
  moreButton?.addEventListener("click", () => {
    visibleLimit += 60;
    void search();
  });
  window.addEventListener("popstate", () => {
    const current = new URLSearchParams(location.search);
    searchInput.value = current.get("q") || "";
    for (const { key, control } of filterControls)
      control.value = current.get(key) || "";
    void search();
  });
  void initializeSearch();
}
const bookRoot = document.querySelector("[data-bookmark-results]");
if (bookRoot) {
  const bookStatus = bookRoot.querySelector("[data-bookmark-status]");
  const bookList = bookRoot.querySelector("[data-bookmark-list]");
  async function renderBookmarks() {
    bookRoot.setAttribute("aria-busy", "true");
    bookStatus.hidden = false;
    bookStatus.textContent = "Загрузка закладок…";
    try {
      const idx = await getIndex();
      const es = state.bookmarks.map((id) => idx.entries[id]).filter(Boolean);
      bookStatus.hidden = es.length === 0;
      bookStatus.textContent = es.length
        ? `Сохранено закладок: ${es.length}.`
        : "";
      bookList.innerHTML = es.length
        ? es
            .map(
              (e) =>
                `<a class="item" href="${root}${e.kind === "practice" ? "practice" : "lesson"}/${e.id}/"><span class="number">${e.id}</span><div class="itext"><div class="ititle">${escapeHtml(e.title)}</div></div><span class="ic-right">${rowChevron}</span></a>`,
            )
            .join("")
        : `<div class="empty-state"><h2 class="h2">Пока нет закладок</h2><p class="muted">Сохраните урок или задание, чтобы быстро вернуться к нему.</p><a class="btn primary" href="${root}roadmap/">Открыть программу</a></div>`;
    } catch {
      bookStatus.hidden = true;
      bookStatus.textContent = "";
      bookList.innerHTML =
        '<div class="notice" role="alert">Не удалось загрузить закладки. Попробуйте ещё раз. <button class="btn smallbtn" type="button" data-bookmarks-retry>Повторить</button></div>';
    } finally {
      bookRoot.setAttribute("aria-busy", "false");
    }
  }
  bookRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-bookmarks-retry]")) void renderBookmarks();
  });
  void renderBookmarks();
}
// Optional filters on the all-practice directory.
const practiceFilters = [...document.querySelectorAll("[data-filter]")];
const filterEmpty = document.querySelector("[data-filter-empty]");
function applyPracticeFilters() {
  const mod = document.querySelector('[data-filter="module"]')?.value || "",
    level = document.querySelector('[data-filter="level"]')?.value || "";
  let visible = 0;
  document.querySelectorAll("[data-filter-item]").forEach((e) => {
    let show =
      (!mod || e.dataset.mod === mod) && (!level || e.dataset.level === level);
    e.hidden = !show;
    if (show) visible++;
  });
  const count = document.querySelector("[data-filter-count]");
  if (count) count.textContent = String(visible);
  if (filterEmpty) filterEmpty.hidden = visible !== 0;
}
practiceFilters.forEach((el) =>
  el.addEventListener("change", applyPracticeFilters),
);
document.querySelector("[data-filter-reset]")?.addEventListener("click", () => {
  practiceFilters.forEach((filter) => (filter.value = ""));
  applyPracticeFilters();
  practiceFilters[0]?.focus();
});
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register(root + "sw.js", { scope: root })
      .catch(() => {}),
  );
}
const offlineBtn = document.querySelector("[data-offline-install]");
if (offlineBtn) {
  const status = document.querySelector("[data-offline-status]");
  const summary = document.querySelector("[data-offline-summary]");
  const meta = document.querySelector("[data-offline-meta]");
  const progress = document.querySelector("[data-offline-progress]");
  const cancelButton = document.querySelector("[data-offline-cancel]");
  const clearButton = document.querySelector("[data-offline-clear]");
  const storageStatus = document.querySelector("[data-offline-storage]");
  const moduleSummary = document.querySelector("[data-offline-module-summary]");
  const moduleList = document.querySelector("[data-offline-modules]");
  const failuresSection = document.querySelector("[data-offline-failures]");
  const failuresList = failuresSection?.querySelector("ul");
  const stateKey = "sales-os-offline-state-v2";
  const cachePrefix = "sales-os-offline-";
  const readyMarker = "__sales-os-offline-ready__";
  const installHeader = "x-salesos-offline-install";
  let manifest = null;
  let activeController = null;
  let savedState = null;
  let readyPack = null;
  const baseUrl = new URL(root, location.href);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

  function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return "объём уточняется";
    if (value < 1024) return `${value} Б`;
    const units = ["КБ", "МБ", "ГБ"];
    let amount = value / 1024,
      unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit++;
    }
    return `≈ ${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(amount)} ${units[unit]}`;
  }

  function resolveOfflineUrl(path) {
    if (
      typeof path !== "string" ||
      path.startsWith("/") ||
      path.includes("\\") ||
      /[?#]/.test(path)
    )
      throw new Error("В манифесте найден недопустимый путь");
    for (const segment of path.split("/")) {
      let decoded;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        throw new Error("В манифесте найден некорректный URL");
      }
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\")
      )
        throw new Error("Путь офлайн-ресурса выходит за каталог приложения");
    }
    const url = new URL(path, baseUrl);
    if (
      url.origin !== baseUrl.origin ||
      !url.pathname.startsWith(baseUrl.pathname)
    )
      throw new Error("Офлайн-ресурс находится вне приложения");
    return url;
  }

  function markerUrl() {
    return new URL(readyMarker, baseUrl).href;
  }

  function readSavedState() {
    try {
      const value = JSON.parse(localStorage.getItem(stateKey) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function persistState(value) {
    savedState = { ...value, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(stateKey, JSON.stringify(savedState));
      return true;
    } catch {
      return false;
    }
  }

  async function loadManifest() {
    const response = await fetch(root + "assets/offline-files.json", {
      cache: "no-cache",
    });
    if (!response.ok)
      throw new Error(`Манифест недоступен: HTTP ${response.status}`);
    const value = await response.json();
    if (
      value?.schemaVersion !== 2 ||
      !/^[a-f0-9]{12}$/i.test(value.version || "") ||
      !Array.isArray(value.resources) ||
      !Array.isArray(value.modules)
    )
      throw new Error("Формат офлайн-манифеста не поддерживается");
    const paths = new Set();
    for (const resource of value.resources) {
      if (
        !resource ||
        typeof resource.url !== "string" ||
        !Number.isFinite(resource.bytes) ||
        resource.bytes < 0 ||
        paths.has(resource.url)
      )
        throw new Error("Список ресурсов содержит ошибку");
      resolveOfflineUrl(resource.url);
      paths.add(resource.url);
    }
    if (
      !paths.has("assets/offline-files.json") ||
      value.urls?.length !== value.resources.length
    )
      throw new Error("Офлайн-манифест неполный");
    return value;
  }

  async function findReadyPack() {
    if (!("caches" in window)) return null;
    const names = (await caches.keys()).filter((name) =>
      name.startsWith(cachePrefix),
    );
    const packs = await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        const marker = await cache.match(markerUrl());
        if (!marker?.ok) return null;
        try {
          const value = await marker.json();
          if (
            value.version !== name.slice(cachePrefix.length) ||
            !Number.isFinite(value.installedAt)
          )
            return null;
          return { ...value, cacheName: name };
        } catch {
          return null;
        }
      }),
    );
    return (
      packs
        .filter(Boolean)
        .sort((left, right) => right.installedAt - left.installedAt)[0] || null
    );
  }

  function renderFailures(failures = []) {
    if (!failuresSection || !failuresList) return;
    failuresList.replaceChildren();
    failuresSection.hidden = failures.length === 0;
    for (const failure of failures) {
      const item = document.createElement("li");
      item.textContent = failure.reason
        ? `${failure.url} — ${failure.reason}`
        : failure.url;
      failuresList.append(item);
    }
  }

  function updateModuleList() {
    if (!manifest || !moduleList) return;
    moduleSummary.textContent = `В пакете ${manifest.modules.length} модулей, итоговый проект, 3 справочника и ${manifest.resources.filter((item) => item.url.startsWith("source/")).length} карточки источников`;
    moduleList.replaceChildren();
    for (const module of manifest.modules) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = root + module.url;
      link.textContent = `${module.id} · ${module.title}`;
      item.append(link);
      moduleList.append(item);
    }
  }

  async function updateStorageEstimate() {
    if (!storageStatus) return;
    try {
      if (!navigator.storage?.estimate) throw new Error("unavailable");
      const estimate = await navigator.storage.estimate();
      const used = Number.isFinite(estimate.usage)
        ? `Занято на этом сайте: ${formatBytes(estimate.usage)}`
        : "";
      const quota = Number.isFinite(estimate.quota)
        ? `из ${formatBytes(estimate.quota)}`
        : "";
      storageStatus.textContent = [used, quota].filter(Boolean).join(" ");
      if (
        manifest &&
        Number.isFinite(estimate.quota) &&
        Number.isFinite(estimate.usage)
      ) {
        const remaining = Math.max(0, estimate.quota - estimate.usage);
        if (manifest.estimatedBytes > remaining)
          storageStatus.textContent += ` · браузер может не вместить пакет (${formatBytes(manifest.estimatedBytes)} ожидается)`;
      }
    } catch {
      storageStatus.textContent =
        "Браузер не сообщает оценку свободного места; фактический объём уточнится во время загрузки.";
    }
  }

  function setManagerState(state, message, count, total) {
    if (!status || !summary) return;
    status.textContent = message;
    summary.dataset.state = state;
    clearButton.disabled =
      activeController !== null || (!readyPack && !savedState);
    offlineBtn.disabled =
      activeController !== null ||
      !manifest ||
      !("caches" in window) ||
      !("serviceWorker" in navigator);
    offlineBtn.textContent = [
      "partial",
      "cancelled",
      "quota",
      "error",
      "update",
    ].includes(state)
      ? "Продолжить или повторить загрузку"
      : state === "ready"
        ? "Обновить офлайн-пакет"
        : "Загрузить офлайн-пакет";
    if (progress) {
      progress.max = Math.max(1, total || manifest?.resources.length || 1);
      progress.value = Math.min(count || 0, progress.max);
      progress.hidden = activeController === null;
      progress.setAttribute(
        "aria-valuetext",
        `${progress.value} из ${progress.max}`,
      );
    }
    meta.textContent = manifest
      ? `Версия ${manifest.version} · ${manifest.resources.length} ресурсов · ${formatBytes(manifest.estimatedBytes)}`
      : "";
    cancelButton.hidden = activeController === null;
    renderFailures(savedState?.failures || []);
  }

  async function refreshOfflineManager() {
    savedState = readSavedState();
    try {
      manifest = await loadManifest();
      updateModuleList();
      readyPack = await findReadyPack();
      const stateMatches = savedState?.version === manifest.version;
      if (readyPack?.version === manifest.version) {
        setManagerState(
          "ready",
          `Пакет установлен ${new Date(readyPack.installedAt).toLocaleString("ru-RU")}. Все заявленные ресурсы подтверждены.`,
          manifest.resources.length,
          manifest.resources.length,
        );
      } else if (
        stateMatches &&
        ["partial", "cancelled", "quota", "error"].includes(savedState.state)
      ) {
        const messages = {
          partial: `Пакет загружен частично: ${savedState.cached || 0} из ${manifest.resources.length}. Повтор продолжит с недостающих ресурсов.`,
          cancelled: `Загрузка отменена: ${savedState.cached || 0} из ${manifest.resources.length} ресурсов сохранено. Пакет неполный.`,
          quota: `Недостаточно места в хранилище браузера: ${savedState.cached || 0} из ${manifest.resources.length} ресурсов сохранено.`,
          error: "Не удалось подготовить офлайн-пакет. Повторите попытку.",
        };
        const previous = readyPack
          ? ` Установленная версия ${readyPack.version} пока доступна офлайн.`
          : "";
        setManagerState(
          savedState.state,
          messages[savedState.state] + previous,
          savedState.cached || 0,
          manifest.resources.length,
        );
      } else if (readyPack) {
        setManagerState(
          "update",
          `Доступна новая версия ${manifest.version}; сохранённый пакет версии ${readyPack.version} пока доступен офлайн.`,
          savedState?.cached || 0,
          manifest.resources.length,
        );
      } else {
        setManagerState(
          "empty",
          "Офлайн-пакет ещё не установлен.",
          0,
          manifest.resources.length,
        );
      }
    } catch (error) {
      manifest = null;
      readyPack = await findReadyPack().catch(() => null);
      const message = readyPack
        ? `Пакет версии ${readyPack.version} сохранён; сведения о новой версии сейчас недоступны.`
        : `Не удалось проверить офлайн-пакет: ${error.message}. Повторите загрузку страницы.`;
      setManagerState(
        readyPack ? "ready" : "error",
        message,
        savedState?.cached || 0,
        savedState?.total || 1,
      );
    }
    await updateStorageEstimate();
  }

  function resourceBytes(response, fallback = 0) {
    const header = Number(response.headers.get("content-length"));
    return Number.isFinite(header) && header > 0
      ? Promise.resolve(header)
      : response
          .clone()
          .arrayBuffer()
          .then((buffer) => buffer.byteLength)
          .catch(() => fallback);
  }

  async function installOfflinePack() {
    if (activeController) return;
    if (!manifest) {
      await refreshOfflineManager();
      if (!manifest) return;
    }
    try {
      await navigator.serviceWorker.ready;
      const controller = new AbortController();
      activeController = controller;
      const currentManifest = manifest;
      const resources = currentManifest.resources;
      const cacheName = cachePrefix + currentManifest.version;
      const cache = await caches.open(cacheName);
      const failures = [];
      let cached = 0,
        bytesSaved = 0,
        processed = 0;
      progress.hidden = false;
      progress.max = Math.max(1, resources.length);
      progress.value = 0;
      cancelButton.hidden = false;
      offlineBtn.disabled = true;
      clearButton.disabled = true;
      summary.dataset.state = "installing";
      status.textContent = `Проверка ресурсов: 0 из ${resources.length}…`;
      savedState = {
        version: currentManifest.version,
        state: "installing",
        cached: 0,
        total: resources.length,
        failures: [],
      };

      const missing = [];
      for (const resource of resources) {
        if (controller.signal.aborted) break;
        const url = resolveOfflineUrl(resource.url);
        const existing = await cache.match(url.href);
        if (existing?.ok) {
          cached++;
          bytesSaved += await resourceBytes(existing, resource.bytes);
        } else {
          missing.push(resource);
        }
        processed++;
        if (processed % 40 === 0 || processed === resources.length) {
          progress.value = processed;
          status.textContent = `Проверка сохранённых файлов: ${processed} из ${resources.length}…`;
        }
      }

      for (
        let offset = 0;
        offset < missing.length && !controller.signal.aborted;
        offset += 4
      ) {
        const batch = missing.slice(offset, offset + 4);
        const outcomes = await Promise.all(
          batch.map(async (resource) => {
            const url = resolveOfflineUrl(resource.url);
            try {
              const response = await fetch(url.href, {
                cache: "reload",
                headers: { [installHeader]: "1" },
                signal: controller.signal,
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const byteCount = await resourceBytes(response, resource.bytes);
              await cache.put(url.href, response);
              return { ok: true, bytes: byteCount };
            } catch (error) {
              if (controller.signal.aborted || error.name === "AbortError")
                return { cancelled: true };
              const reason =
                error.name === "QuotaExceededError"
                  ? "Недостаточно места в хранилище браузера"
                  : error.message || "Ошибка сети";
              failures.push({ url: resource.url, reason });
              return { ok: false, quota: error.name === "QuotaExceededError" };
            }
          }),
        );
        cached += outcomes.filter((result) => result.ok).length;
        bytesSaved += outcomes.reduce(
          (total, result) => total + (result.bytes || 0),
          0,
        );
        processed += batch.length;
        progress.value = Math.min(processed, resources.length);
        status.textContent = `Сохранено ${cached} из ${resources.length} · получено ${formatBytes(bytesSaved)}`;
        persistState({
          version: currentManifest.version,
          state: "partial",
          cached,
          total: resources.length,
          bytes: bytesSaved,
          failures,
        });
      }

      if (controller.signal.aborted) {
        persistState({
          version: currentManifest.version,
          state: "cancelled",
          cached,
          total: resources.length,
          bytes: bytesSaved,
          failures,
        });
        readyPack = await findReadyPack();
        setManagerState(
          "cancelled",
          `Загрузка отменена: ${cached} из ${resources.length} ресурсов сохранено. Пакет неполный.`,
          cached,
          resources.length,
        );
        toast(
          "Офлайн-загрузка отменена; сохранённую часть можно продолжить позже",
        );
        return;
      }

      if (failures.length) {
        const quotaExceeded = failures.some((failure) =>
          failure.reason.includes("места"),
        );
        const saved = persistState({
          version: currentManifest.version,
          state: quotaExceeded ? "quota" : "partial",
          cached,
          total: resources.length,
          bytes: bytesSaved,
          failures,
        });
        readyPack = await findReadyPack();
        const message = quotaExceeded
          ? `Недостаточно места: ${cached} из ${resources.length} ресурсов сохранено. Освободите место и повторите.`
          : `Пакет неполный: ${cached} из ${resources.length} ресурсов сохранено. Ошибки перечислены ниже.`;
        setManagerState(
          quotaExceeded ? "quota" : "partial",
          message + (saved ? "" : " Статус останется до закрытия страницы."),
          cached,
          resources.length,
        );
        toast(
          quotaExceeded
            ? "Офлайн-пакет не поместился в хранилище"
            : "Часть офлайн-ресурсов не загрузилась",
        );
        return;
      }

      const installedAt = Date.now();
      const marker = new Response(
        JSON.stringify({
          version: currentManifest.version,
          installedAt,
          resourceCount: resources.length,
          bytes: bytesSaved,
        }),
        { headers: { "content-type": "application/json" } },
      );
      await cache.put(markerUrl(), marker);
      for (const oldCache of await caches.keys()) {
        if (oldCache.startsWith(cachePrefix) && oldCache !== cacheName)
          await caches.delete(oldCache);
      }
      const saved = persistState({
        version: currentManifest.version,
        state: "ready",
        cached,
        total: resources.length,
        bytes: bytesSaved,
        failures: [],
        installedAt,
      });
      readyPack = await findReadyPack();
      setManagerState(
        "ready",
        `Пакет установлен ${new Date(installedAt).toLocaleString("ru-RU")}. Сохранено ${cached} из ${resources.length} ресурсов (${formatBytes(bytesSaved)}).${saved ? "" : " Статус подтверждён браузерным кэшем."}`,
        cached,
        resources.length,
      );
      toast("Офлайн-пакет готов к работе без сети");
    } catch (error) {
      const isQuota = error.name === "QuotaExceededError";
      persistState({
        version: manifest?.version || "",
        state: isQuota ? "quota" : "error",
        cached: 0,
        total: manifest?.resources.length || 0,
        failures: [
          {
            url: "Пакет",
            reason: isQuota
              ? "Недостаточно места в хранилище браузера"
              : error.message || "Ошибка установки",
          },
        ],
      });
      setManagerState(
        isQuota ? "quota" : "error",
        isQuota
          ? "Браузеру не хватило места. Освободите место и повторите."
          : `Не удалось завершить установку: ${error.message}. Повторите попытку.`,
        0,
        manifest?.resources.length || 1,
      );
    } finally {
      activeController = null;
      cancelButton.hidden = true;
      offlineBtn.disabled =
        !manifest || !("caches" in window) || !("serviceWorker" in navigator);
      clearButton.disabled = !readyPack && !savedState;
      if (progress) progress.hidden = true;
      await refreshOfflineManager();
    }
  }

  offlineBtn.addEventListener("click", () => void installOfflinePack());
  cancelButton?.addEventListener("click", () => activeController?.abort());
  clearButton?.addEventListener("click", async () => {
    if (!("caches" in window) || activeController) return;
    for (const name of await caches.keys())
      if (name.startsWith(cachePrefix)) await caches.delete(name);
    try {
      localStorage.removeItem(stateKey);
    } catch {
      savedState = null;
    }
    readyPack = null;
    savedState = null;
    await refreshOfflineManager();
    toast("Офлайн-пакеты Sales OS удалены. Личные записи сохранены.");
  });
  void refreshOfflineManager();
}

const templateLibrary = document.querySelector("[data-template-copy]");
if (templateLibrary) {
  for (const heading of templateLibrary.querySelectorAll("h2")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn smallbtn template-copy";
    button.textContent = "Скопировать";
    button.setAttribute(
      "aria-label",
      `Скопировать шаблон «${heading.textContent.trim()}»`,
    );
    heading.append(button);
    button.addEventListener("click", async () => {
      const chunks = [
        heading.textContent.replace(button.textContent, "").trim(),
      ];
      for (
        let sibling = heading.nextElementSibling;
        sibling;
        sibling = sibling.nextElementSibling
      ) {
        if (sibling.matches("h1, h2")) break;
        chunks.push(sibling.innerText || sibling.textContent || "");
      }
      const text = chunks.filter(Boolean).join("\n\n").trim();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error("Clipboard API unavailable");
        }
        toast("Текст шаблона скопирован");
      } catch {
        toast("Не удалось скопировать. Выделите текст шаблона вручную.");
      }
    });
  }
}

// A single passive handler keeps both desktop and mobile contents in sync.
const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
const tocTargets = [
  ...new Set(
    tocLinks
      .map((link) =>
        document.getElementById(decodeURIComponent(link.hash.slice(1))),
      )
      .filter(Boolean),
  ),
];
if (tocTargets.length) {
  let scheduled = false;
  function updateToc() {
    scheduled = false;
    const current =
      [...tocTargets]
        .reverse()
        .find((target) => target.getBoundingClientRect().top <= 120) ||
      tocTargets[0];
    for (const link of tocLinks) {
      if (decodeURIComponent(link.hash.slice(1)) === current.id)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function scheduleToc() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateToc);
    }
  }
  window.addEventListener("scroll", scheduleToc, { passive: true });
  window.addEventListener("resize", scheduleToc);
  window.addEventListener("hashchange", scheduleToc);
  updateToc();
}
