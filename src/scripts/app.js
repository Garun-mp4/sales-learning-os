/* Sales OS local-first interface. No analytics, cookies, trackers, or external APIs. */
const root = document.documentElement.dataset.root || "./";
const STORE = "sales-os-v2";
const statusLabels = {
  not_started: "Не начато",
  in_progress: "Изучаю",
  theory_completed: "Теория изучена",
  mastered: "Навык освоен",
  self_reviewed: "Самопроверка",
  completed: "Выполнено",
};
let contentIndex = null;
let state = loadState();
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
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!s || s.format !== "sales-os-v2" || s.version !== 2)
      return defaultState();
    const safe = defaultState();
    safe.lessonStatuses =
      s.lessonStatuses &&
      typeof s.lessonStatuses === "object" &&
      !Array.isArray(s.lessonStatuses)
        ? s.lessonStatuses
        : {};
    safe.practiceStatuses =
      s.practiceStatuses &&
      typeof s.practiceStatuses === "object" &&
      !Array.isArray(s.practiceStatuses)
        ? s.practiceStatuses
        : {};
    safe.bookmarks = Array.isArray(s.bookmarks)
      ? s.bookmarks.filter((x) => typeof x === "string")
      : [];
    safe.lastVisited = typeof s.lastVisited === "string" ? s.lastVisited : null;
    safe.legacyImported = s.legacyImported === true;
    return safe;
  } catch {
    return defaultState();
  }
}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    window.dispatchEvent(new Event("salesstatechange"));
  } catch {
    toast("Недостаточно места. Сохраните резервную копию.");
  }
}
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
const currentTheme = () => localStorage.getItem("sales-os-theme") || "system";
showTheme(currentTheme());
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (currentTheme() === "system") showTheme("system");
  });
document.querySelectorAll("[data-theme-select]").forEach((el) =>
  el.addEventListener("change", () => {
    localStorage.setItem("sales-os-theme", el.value);
    showTheme(el.value);
    toast("Тема изменена");
  }),
);
const toggleMenu = (on) => {
  document.body.classList.toggle("menu-open", on);
  document
    .querySelector("[data-menu-toggle]")
    ?.setAttribute("aria-expanded", String(on));
};
document
  .querySelector("[data-menu-toggle]")
  ?.addEventListener("click", () =>
    toggleMenu(!document.body.classList.contains("menu-open")),
  );
document
  .querySelector(".mobile-shade")
  ?.addEventListener("click", () => toggleMenu(false));
document
  .querySelector("[data-menu-close]")
  ?.addEventListener("click", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleMenu(false);
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
  const r = await fetch(root + "assets/client-index.json");
  if (!r.ok) throw new Error("index unavailable");
  contentIndex = await r.json();
  return contentIndex;
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
  document
    .querySelectorAll("[data-global-theory]")
    .forEach((el) => (el.textContent = st.theoryDone + " / " + st.theory));
  document
    .querySelectorAll("[data-global-practice]")
    .forEach((el) => (el.textContent = st.practiceDone + " / " + st.practice));
  document
    .querySelectorAll("[data-global-pct]")
    .forEach(
      (el) =>
        (el.textContent =
          Math.round(
            ((st.theoryDone + st.practiceDone) / (st.theory + st.practice)) *
              100,
          ) + "%"),
    );
  document
    .querySelectorAll("[data-global-fill]")
    .forEach(
      (el) =>
        (el.style.width =
          Math.round(
            ((st.theoryDone + st.practiceDone) / (st.theory + st.practice)) *
              100,
          ) + "%"),
    );
  for (const el of document.querySelectorAll("[data-module-pct]")) {
    const mod = el.dataset.modulePct;
    let arr = Object.values(idx.entries).filter(
      (e) => e.module === mod && e.kind !== "module",
    );
    let done = arr.filter(isDone).length;
    el.textContent = `${Math.round((done / arr.length) * 100)}%`;
  }
  for (const el of document.querySelectorAll("[data-module-fill]")) {
    const mod = el.dataset.moduleFill;
    let arr = Object.values(idx.entries).filter(
      (e) => e.module === mod && e.kind !== "module",
    );
    el.style.width = `${Math.round((arr.filter(isDone).length / arr.length) * 100)}%`;
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
  state.lastVisited = docId;
  persist();
}
document.querySelectorAll("[data-status-control]").forEach((el) => {
  const id = el.dataset.statusControl,
    kind = el.dataset.kind;
  el.value =
    (kind === "theory" ? state.lessonStatuses : state.practiceStatuses)[id] ||
    "not_started";
  el.addEventListener("change", () => {
    (kind === "theory" ? state.lessonStatuses : state.practiceStatuses)[id] =
      el.value;
    persist();
    toast("Прогресс сохранён");
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
  el.addEventListener("click", () => {
    const id = el.dataset.bookmark;
    if (state.bookmarks.includes(id))
      state.bookmarks = state.bookmarks.filter((x) => x !== id);
    else state.bookmarks.push(id);
    persist();
    bookmarkSync();
    toast(
      state.bookmarks.includes(id)
        ? "Сохранено в закладках"
        : "Удалено из закладок",
    );
  }),
);
// IndexedDB: personal notes and answers never leave this device.
const DBNAME = "sales-os-personal";
const DBSTORE = "notes";
function storageKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}
function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DBNAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DBSTORE))
        req.result.createObjectStore(DBSTORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function noteGet(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DBSTORE, "readonly"),
        req = tx.objectStore(DBSTORE).get(id);
      req.onsuccess = () => resolve(req.result || "");
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return localStorage.getItem("sales-os-note-" + id) || "";
  }
}
async function notePut(id, val) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DBSTORE, "readwrite");
      tx.objectStore(DBSTORE).put(val, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    try {
      localStorage.setItem("sales-os-note-" + id, val);
    } catch {}
  } catch {
    try {
      localStorage.setItem("sales-os-note-" + id, val);
    } catch {
      toast("Память переполнена — сделайте экспорт");
    }
  }
}
async function allNotes() {
  try {
    const db = await openDB();
    const val = await new Promise((resolve, reject) => {
      let data = {};
      const tx = db.transaction(DBSTORE, "readonly"),
        store = tx.objectStore(DBSTORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          data[c.key] = c.value;
          c.continue();
        } else resolve(data);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    for (const k of storageKeys()) {
      if (k.startsWith("sales-os-note-")) {
        const id = k.slice("sales-os-note-".length);
        val[id] = localStorage.getItem(k) ?? val[id];
      }
    }
    return val;
  } catch {
    return Object.fromEntries(
      storageKeys()
        .filter((x) => x.startsWith("sales-os-note-"))
        .map((x) => [
          x.substring("sales-os-note-".length),
          localStorage.getItem(x),
        ]),
    );
  }
}
let noteTimers = {};
window.addEventListener("pagehide", () => {
  document.querySelectorAll("[data-note]").forEach((el) => {
    try {
      localStorage.setItem("sales-os-note-" + el.dataset.note, el.value);
    } catch {}
  });
});
document.querySelectorAll("[data-note]").forEach((el) => {
  const id = el.dataset.note;
  let dirty = false;
  // Attach the listener before asynchronous IndexedDB hydration: otherwise a
  // fast typist could lose a fresh answer when the old value arrives.
  el.addEventListener("input", () => {
    dirty = true;
    const saveLabel = el.closest(".editbox")?.querySelector("[data-save-hint]");
    if (saveLabel) saveLabel.textContent = "Сохранение…";
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(async () => {
      await notePut(id, el.value);
      if (saveLabel) saveLabel.textContent = "Сохранено локально";
    }, 450);
  });
  const immediate = localStorage.getItem("sales-os-note-" + id);
  if (immediate !== null) el.value = immediate;
  else
    noteGet(id).then((previous) => {
      if (!dirty) el.value = previous;
    });
});
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
  for (const el of document.querySelectorAll("[data-note]"))
    await notePut(el.dataset.note, el.value);
  downloadJSON(
    { ...state, notes: await allNotes(), exportedAt: new Date().toISOString() },
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
      "Импорт заменит текущий прогресс и заметки. Убедитесь, что сохранили резервную копию. Продолжить?",
    )
  )
    return;
  // Clear notes first, then replace the lightweight progress state. The backup's
  // notes field must NEVER be persisted a second time inside localStorage state.
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DBSTORE, "readwrite");
      tx.objectStore(DBSTORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    // No IndexedDB (private mode / browser restrictions): localStorage remains available.
    // If the DB opens but its transaction fails, do not silently keep stale notes.
    if (
      err &&
      err.name !== "SecurityError" &&
      err.message !== "indexedDB unavailable"
    )
      throw err;
  }
  for (const key of storageKeys())
    if (key.startsWith("sales-os-note-")) localStorage.removeItem(key);
  state = next;
  persist();
  for (const [id, body] of Object.entries(notes)) await notePut(id, body);
  toast("Импорт успешно завершён");
  setTimeout(() => location.reload(), 600);
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
    } catch (err) {
      toast("Импорт не удался: файл повреждён или имеет неизвестный формат");
    }
    e.target.value = "";
  });
// Search index is loaded only on the search screen. Nothing from lessons is sent to a server.
const searchInput = document.querySelector("[data-search-input]");
if (searchInput) {
  const params = new URLSearchParams(location.search);
  searchInput.value = params.get("q") || "";
  const resultRoot = document.querySelector("[data-search-results]");
  let pagefind = null,
    searchIndex = [],
    serial = 0,
    lastTimer;
  const normalized = (s) =>
    s
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  (async () => {
    // Prefer the incremental Pagefind index after an Astro build; the JSON index
    // is the offline-compatible fallback for the precompiled Python version.
    try {
      pagefind = await import(root + "pagefind/pagefind.js");
      await pagefind.init();
    } catch {
      try {
        const r = await fetch(root + "assets/search-index.json");
        searchIndex = (await r.json()).map((item) => ({
          ...item,
          _title: normalized(item.title),
          _body: normalized(item.text),
        }));
      } catch {
        resultRoot.innerHTML =
          '<div class="notice">Поисковый индекс недоступен.</div>';
        return;
      }
    }
    await search();
  })();
  async function search() {
    const mine = ++serial;
    const query = searchInput.value.trim(),
      text = normalized(query);
    history.replaceState(
      null,
      "",
      location.pathname + (text ? "?q=" + encodeURIComponent(query) : ""),
    );
    if (!text) {
      resultRoot.innerHTML =
        '<div class="notice">Введите слово или фразу для поиска по материалам.</div>';
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
        resultRoot.innerHTML =
          `<div class="pill-note">Найдено: ${match.results.length}</div>` +
          (html || '<div class="notice">Совпадений не найдено.</div>');
        return;
      } catch {
        pagefind = null;
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
    resultRoot.innerHTML =
      `<div class="pill-note">Найдено: ${matches.length}${matches.length === 60 ? " (первые 60)" : ""}</div>` +
        matches
          .map(
            (item) =>
              `<a class="item" href="${root}${item.kind === "theory" ? "lesson" : item.kind === "practice" ? "practice" : "module"}/${encodeURIComponent(item.id)}/"><span class="number">${escapeHtml(item.id)}</span><div class="itext"><div class="ititle">${escapeHtml(item.title)}</div><div class="isub">${item.kind === "theory" ? "Теория" : item.kind === "practice" ? "Практика" : "Модуль"} · ${escapeHtml(item.module)}</div></div><span class="ic-right">→</span></a>`,
          )
          .join("") || '<div class="notice">Совпадений не найдено.</div>';
  }
  searchInput.addEventListener("input", () => {
    clearTimeout(lastTimer);
    lastTimer = setTimeout(search, 180);
  });
}
const bookRoot = document.querySelector("[data-bookmark-results]");
if (bookRoot) {
  getIndex().then((idx) => {
    const es = state.bookmarks.map((id) => idx.entries[id]).filter(Boolean);
    bookRoot.innerHTML = es.length
      ? es
          .map(
            (e) =>
              `<a class="item" href="${root}${e.kind === "practice" ? "practice" : "lesson"}/${e.id}/"><span class="number">${e.id}</span><div class="itext"><div class="ititle">${escapeHtml(e.title)}</div></div><span class="ic-right">→</span></a>`,
          )
          .join("")
      : '<div class="notice">Пока нет закладок. На странице урока нажмите «В закладки».</div>';
  });
}
// Optional filters on the all-practice directory.
document.querySelectorAll("[data-filter]").forEach((el) =>
  el.addEventListener("change", () => {
    const mod = document.querySelector('[data-filter="module"]')?.value || "",
      level = document.querySelector('[data-filter="level"]')?.value || "";
    let visible = 0;
    document.querySelectorAll("[data-filter-item]").forEach((e) => {
      let show =
        (!mod || e.dataset.mod === mod) &&
        (!level || e.dataset.level === level);
      e.hidden = !show;
      if (show) visible++;
    });
    const count = document.querySelector("[data-filter-count]");
    if (count) count.textContent = String(visible);
  }),
);
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
