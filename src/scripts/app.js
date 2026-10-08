/* Sales OS local-first interface. No analytics, cookies, trackers, or external APIs. */
const root = document.documentElement.dataset.root || "./";
const userStore = window.SalesOSUserStore;
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
function defaultState() {
  return {
    format: "sales-os-v2",
    version: 2,
    lessonStatuses: {},
    practiceStatuses: {},
    bookmarks: [],
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
});
userStore.subscribe(handleStoreMessage);
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
function showTheme(pref) {
  let dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelectorAll("[data-theme-select]")
    .forEach((e) => (e.value = pref));
}
const currentTheme = () => userStore.readTheme();
showTheme(currentTheme());
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (currentTheme() === "system") showTheme("system");
  });
document.querySelectorAll("[data-theme-select]").forEach((el) =>
  el.addEventListener("change", () => {
    userStore.writeTheme(el.value);
    showTheme(el.value);
    toast("Тема изменена");
  }),
);
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
  const continueBtn = document.querySelector("[data-continue]");
  if (continueBtn) {
    let id = state.lastVisited;
    let e = idx.entries[id];
    if (!e) {
      e = Object.values(idx.entries).find((x) => x.kind === "theory");
    }
    if (e) {
      continueBtn.href =
        root + (e.kind === "practice" ? "practice/" : "lesson/") + e.id + "/";
      const title = document.querySelector("[data-continue-title]");
      if (title) title.textContent = e.title;
    }
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
    el.innerHTML = b ? "★ В закладках" : "☆ В закладки";
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
function cacheAndFlushNotes() {
  for (const editor of noteEditors.values()) {
    editor.cacheDraft();
    editor.flush();
  }
}
window.addEventListener("pagehide", cacheAndFlushNotes);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") cacheAndFlushNotes();
});
window.addEventListener("beforeunload", (event) => {
  if (![...noteEditors.values()].some((editor) => editor.dirty)) return;
  cacheAndFlushNotes();
  event.preventDefault();
  event.returnValue = "";
});
async function handleStoreMessage(message) {
  if (message.source === userStore.clientId) return;
  if (message.type === "state" || message.type === "replace") {
    state = message.state || (await userStore.getState());
    renderUserState();
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
}
async function exportData() {
  const exportedState = await userStore.getState();
  const notes = await userStore.getAllNotes();
  Object.assign(notes, userStore.getDrafts());
  for (const el of document.querySelectorAll("[data-note]"))
    notes[el.dataset.note] = el.value;
  downloadJSON(
    { ...exportedState, notes, exportedAt: new Date().toISOString() },
    "sales-os-backup.json",
  );
  toast("Резервная копия подготовлена");
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
function validateV2(obj, idx) {
  if (
    !obj ||
    obj.format !== "sales-os-v2" ||
    obj.version !== 2 ||
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
  return next;
}
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
async function importData(file) {
  const obj = JSON.parse(await file.text());
  const idx = await getIndex();
  let next,
    notes = {};
  if (obj.format === "sales-os-roadmap-v1") {
    const result = migrateLegacy(obj, idx);
    next = result.incoming;
    notes = validateNotes(result.notes, idx);
  } else {
    next = validateV2(obj, idx);
    notes = validateNotes(obj.notes, idx);
  }
  if (
    !confirm(
      "Импорт заменит текущий прогресс и заметки, включая незавершённые изменения в открытой вкладке. Убедитесь, что скачали резервную копию. Продолжить?",
    )
  )
    return;
  const result = await userStore.replaceAll(next, notes);
  state = result.state;
  renderUserState();
  for (const editor of noteEditors.values()) {
    const { record } = await userStore.getNote(editor.id);
    editor.replaceFromImport(record);
  }
  if (result.durable) {
    toast("Импорт завершён и сохранён на этом устройстве");
    setTimeout(() => location.reload(), 600);
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
      await importData(file);
    } catch {
      toast(
        "Импорт не удался. Прежние сохранённые данные не изменены; проверьте файл и свободное место.",
      );
    }
    e.target.value = "";
  });
// Search index is loaded only on the search screen. Nothing from lessons is sent to a server.
const searchInput = document.querySelector("[data-search-input]");
if (searchInput) {
  const params = new URLSearchParams(location.search);
  searchInput.value = params.get("q") || "";
  const resultRoot = document.querySelector("[data-search-results]");
  const searchStatus = document.querySelector("[data-search-status]");
  let pagefind = null,
    searchIndex = [],
    fallbackLoaded = false,
    searchReady = false,
    serial = 0,
    lastTimer;
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
    if (!Array.isArray(items)) throw new Error("Invalid search index");
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
    const query = searchInput.value.trim(),
      text = normalized(query);
    history.replaceState(
      null,
      "",
      location.pathname + (text ? "?q=" + encodeURIComponent(query) : ""),
    );
    if (!text) {
      searchStatus.textContent =
        "Введите слово или фразу для поиска по материалам.";
      resultRoot.innerHTML = "";
      resultRoot.setAttribute("aria-busy", "false");
      searchStatus.setAttribute("aria-busy", "false");
      return;
    }
    if (pagefind) {
      try {
        const match = await pagefind.search(query),
          hits = await Promise.all(
            match.results.slice(0, 60).map((r) => r.data()),
          );
        if (mine !== serial) return;
        const html = hits
          .filter((d) => d.url?.startsWith("/"))
          .map(
            (d) =>
              `<a class="item" href="${escapeHtml(d.url)}"><div class="itext"><div class="ititle">${escapeHtml(d.meta?.title || d.url)}</div><div class="isub">${escapeHtml(d.excerpt?.replace(/<[^>]*>/g, "").slice(0, 180) || "Материал курса")}</div></div><span class="ic-right">→</span></a>`,
          )
          .join("");
        searchStatus.textContent = match.results.length
          ? `Найдено: ${match.results.length}${match.results.length > 60 ? " (показаны первые 60)" : ""}`
          : "Найдено: 0. Совпадений не найдено.";
        resultRoot.innerHTML = html;
        resultRoot.setAttribute("aria-busy", "false");
        searchStatus.setAttribute("aria-busy", "false");
        return;
      } catch {
        pagefind = null;
        try {
          await loadFallbackIndex();
          if (mine === serial) return search();
          return;
        } catch {
          if (mine === serial) showSearchError();
          return;
        }
      }
    }
    const terms = text.split(" ");
    const matches = searchIndex
      .map((item) => {
        const title = item._title,
          body = item._body;
        let score = terms.reduce(
          (v, t) =>
            v + (title.includes(t) ? 20 : 0) + (body.includes(t) ? 2 : 0),
          0,
        );
        if (!terms.every((t) => title.includes(t) || body.includes(t)))
          score = 0;
        return { ...item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
    if (mine !== serial) return;
    const html = matches
      .map(
        (item) =>
          `<a class="item" href="${root}${item.kind === "theory" ? "lesson" : item.kind === "practice" ? "practice" : "module"}/${encodeURIComponent(item.id)}/"><span class="number">${escapeHtml(item.id)}</span><div class="itext"><div class="ititle">${escapeHtml(item.title)}</div><div class="isub">${item.kind === "theory" ? "Теория" : item.kind === "practice" ? "Практика" : "Модуль"} · ${escapeHtml(item.module)}</div></div><span class="ic-right">→</span></a>`,
      )
      .join("");
    searchStatus.textContent = matches.length
      ? `Найдено: ${matches.length}${matches.length === 60 ? " (показаны первые 60)" : ""}`
      : "Найдено: 0. Совпадений не найдено.";
    resultRoot.innerHTML = html;
    resultRoot.setAttribute("aria-busy", "false");
    searchStatus.setAttribute("aria-busy", "false");
  }
  searchInput.addEventListener("input", () => {
    clearTimeout(lastTimer);
    lastTimer = setTimeout(search, 180);
  });
  void initializeSearch();
}
const bookRoot = document.querySelector("[data-bookmark-results]");
if (bookRoot) {
  const bookStatus = bookRoot.querySelector("[data-bookmark-status]");
  const bookList = bookRoot.querySelector("[data-bookmark-list]");
  async function renderBookmarks() {
    bookRoot.setAttribute("aria-busy", "true");
    bookStatus.textContent = "Загрузка закладок…";
    try {
      const idx = await getIndex();
      const es = state.bookmarks.map((id) => idx.entries[id]).filter(Boolean);
      bookStatus.textContent = es.length
        ? `Сохранено закладок: ${es.length}.`
        : "Пока нет закладок.";
      bookList.innerHTML = es.length
        ? es
            .map(
              (e) =>
                `<a class="item" href="${root}${e.kind === "practice" ? "practice" : "lesson"}/${e.id}/"><span class="number">${e.id}</span><div class="itext"><div class="ititle">${escapeHtml(e.title)}</div></div><span class="ic-right">→</span></a>`,
            )
            .join("")
        : `<div class="notice">Откройте <a href="${root}roadmap/">урок</a> или <a href="${root}practice/">задание</a> и сохраните его в закладки.</div>`;
    } catch {
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
  offlineBtn.addEventListener("click", async () => {
    if (!("caches" in window)) {
      toast("В этом браузере офлайн-кэш недоступен");
      return;
    }
    offlineBtn.disabled = true;
    const status = document.querySelector("[data-offline-status]");
    try {
      const list = await (
        await fetch(root + "assets/offline-files.json")
      ).json();
      const cache = await caches.open("sales-os-offline-" + list.version);
      let count = 0;
      for (let i = 0; i < list.urls.length; i += 6) {
        await Promise.all(
          list.urls.slice(i, i + 6).map(async (path) => {
            try {
              const r = await fetch(root + path, { cache: "reload" });
              if (!r.ok) throw Error("HTTP " + r.status);
              await cache.put(root + path, r);
              count++;
            } catch {}
          }),
        );
        status.textContent = `Сохранено ${count} из ${list.urls.length} страниц и ресурсов`;
      }
      status.textContent +=
        count === list.urls.length
          ? " · Готово к офлайн-чтению"
          : " · Часть ресурсов недоступна";
      toast("Офлайн-пакет обработан");
    } catch {
      status.textContent = "Не удалось подготовить офлайн-пакет";
    } finally {
      offlineBtn.disabled = false;
    }
  });
}
document
  .querySelector("[data-offline-clear]")
  ?.addEventListener("click", async () => {
    if (!("caches" in window)) return;
    for (const key of await caches.keys())
      if (key.startsWith("sales-os-")) await caches.delete(key);
    toast("Кэш приложения очищен. Личные записи сохранены.");
  });
