/* IndexedDB-first local storage for Sales OS user data. */
(() => {
  const DB_NAME = "sales-os-personal";
  const DB_VERSION = 3;
  const STATE_STORE = "app-state";
  const NOTES_STORE = "notes";
  const RESTORE_STORE = "restore-points";
  const STATE_KEY = "current";
  const GENERATION_KEY = "generation";
  const LOCAL_SNAPSHOT_KEY = "sales-os-local-v2";
  const LEGACY_STATE_KEY = "sales-os-v2";
  const LEGACY_NOTE_PREFIX = "sales-os-note-";
  const NOTE_RECORD_PREFIX = "sales-os-note-record:";
  const DRAFT_PREFIX = "sales-os-unsaved-note:";
  const SYNC_KEY = "sales-os-sync";
  const LOCK_NAME = "sales-os-user-data";
  const listeners = new Set();
  const clientId = createClientId();
  let database = null;
  let storageMode = "initializing";
  let stateCache = readLegacyState();
  let stateCachePending = false;
  let noteCache = new Map();
  let pendingNotes = new Map();
  let generation = 0;
  let memoryRestorePoints = [];
  let channel = null;

  function createClientId() {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function defaultState() {
    return {
      format: "sales-os-v4",
      version: 4,
      lessonStatuses: {},
      practiceStatuses: {},
      bookmarks: [],
      practiceDrafts: {},
      practiceAttempts: {},
      trainerSessions: {},
      revisitQueue: {},
      revisitHistory: [],
      noteMergeSources: {},
      lastExport: null,
      lastVisited: null,
      legacyImported: false,
    };
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function safeObject(value) {
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          key !== "__proto__" && key !== "prototype" && key !== "constructor",
      ),
    );
  }

  function normalizeState(value) {
    if (!isRecord(value)) return defaultState();
    const state = defaultState();
    state.lessonStatuses = safeObject(value.lessonStatuses);
    state.practiceStatuses = safeObject(value.practiceStatuses);
    state.bookmarks = Array.isArray(value.bookmarks)
      ? [...new Set(value.bookmarks.filter((item) => typeof item === "string"))]
      : [];
    state.practiceDrafts = normalizePracticeDrafts(value.practiceDrafts);
    state.practiceAttempts = normalizePracticeAttempts(value.practiceAttempts);
    state.trainerSessions =
      value.trainerSessions && Object.keys(value.trainerSessions).length
        ? window.SalesOSTrainer.validateSessions(value.trainerSessions)
        : {};
    state.revisitQueue = normalizeRevisitQueue(value.revisitQueue);
    state.revisitHistory = Array.isArray(value.revisitHistory)
      ? value.revisitHistory
          .filter(isRecord)
          .slice(-500)
          .map((item) => ({
            entryId: safeText(item.entryId, 100),
            completedAt: safeTimestamp(item.completedAt),
            recallDraft: safeText(item.recallDraft, 10000),
          }))
      : [];
    state.noteMergeSources = normalizeNoteMergeSources(value.noteMergeSources);
    state.lastExport = normalizeLastExport(value.lastExport);
    state.lastVisited =
      typeof value.lastVisited === "string" ? value.lastVisited : null;
    state.legacyImported = value.legacyImported === true;
    return state;
  }

  function normalizePracticeDrafts(value) {
    const drafts = {};
    for (const [id, draft] of Object.entries(safeObject(value))) {
      if (!isRecord(draft)) continue;
      drafts[id] = {
        answers: normalizeStringMap(draft.answers),
        selfReview: normalizeReviewMap(draft.selfReview),
        nextStep: safeText(draft.nextStep, 10000),
        updatedAt: safeTimestamp(draft.updatedAt),
        writerId:
          typeof draft.writerId === "string" ? draft.writerId : "legacy",
        versions: Array.isArray(draft.versions)
          ? draft.versions
              .filter(isRecord)
              .slice(0, 20)
              .map(normalizePracticeDraftVersion)
          : [],
      };
    }
    return drafts;
  }

  function normalizePracticeAttempts(value) {
    const attempts = {};
    for (const [id, records] of Object.entries(safeObject(value))) {
      if (!Array.isArray(records)) continue;
      attempts[id] = records.flatMap((record) => {
        if (!isRecord(record) || typeof record.id !== "string") return [];
        return [
          {
            id: record.id,
            createdAt: safeTimestamp(record.createdAt),
            rubric: Array.isArray(record.rubric)
              ? record.rubric
                  .filter(isRecord)
                  .slice(0, 30)
                  .map((item, index) => ({
                    id: safeText(item.id, 80) || `criterion-${index + 1}`,
                    label: safeText(item.label, 500),
                    description: safeText(item.description, 2000),
                  }))
              : [],
            answers: normalizeStringMap(record.answers),
            selfReview: normalizeReviewMap(record.selfReview),
            nextStep: safeText(record.nextStep, 10000),
          },
        ];
      });
    }
    return attempts;
  }

  function normalizeRevisitQueue(value) {
    const queue = {};
    for (const [id, item] of Object.entries(safeObject(value))) {
      if (!isRecord(item)) continue;
      const dueAt = safeTimestamp(item.dueAt);
      if (!dueAt) continue;
      queue[id] = {
        entryId: typeof item.entryId === "string" ? item.entryId : id,
        dueAt,
        scheduledAt: safeTimestamp(item.scheduledAt) || Date.now(),
        prompt: safeText(item.prompt, 1000),
        recallDraft: safeText(item.recallDraft, 10000),
      };
    }
    return queue;
  }

  function normalizeNoteMergeSources(value) {
    return Object.fromEntries(
      Object.entries(safeObject(value)).map(([id, hashes]) => [
        id,
        Array.isArray(hashes)
          ? [
              ...new Set(hashes.filter((hash) => typeof hash === "string")),
            ].slice(-100)
          : [],
      ]),
    );
  }

  function normalizeLastExport(value) {
    if (!isRecord(value)) return null;
    return {
      exportedAt: safeTimestamp(value.exportedAt),
      sizeBytes:
        Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0
          ? value.sizeBytes
          : 0,
    };
  }

  function normalizeStringMap(value) {
    return Object.fromEntries(
      Object.entries(safeObject(value))
        .filter(([, text]) => typeof text === "string")
        .map(([key, text]) => [key, text.slice(0, 10000)]),
    );
  }

  function normalizePracticeDraftVersion(value) {
    return {
      answers: normalizeStringMap(value.answers),
      selfReview: normalizeReviewMap(value.selfReview),
      nextStep: safeText(value.nextStep, 10000),
      updatedAt: safeTimestamp(value.updatedAt),
      writerId: typeof value.writerId === "string" ? value.writerId : "legacy",
    };
  }

  function normalizeReviewMap(value) {
    return Object.fromEntries(
      Object.entries(safeObject(value)).filter(([, rating]) =>
        [0, 1, 2].includes(rating),
      ),
    );
  }

  function safeText(value, maxLength) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
  }

  function safeTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function isRestorePoint(value) {
    return (
      isRecord(value) &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      isRecord(value.snapshot) &&
      isRecord(value.snapshot.state) &&
      isRecord(value.snapshot.notes)
    );
  }

  function normalizeRestorePoints(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(isRestorePoint)
      .slice(-10)
      .map((point) => ({
        id: point.id,
        createdAt: safeTimestamp(point.createdAt) || Date.now(),
        reason:
          point.reason === "before-restore"
            ? "before-restore"
            : "before-import",
        snapshot: {
          state: normalizeState(point.snapshot.state),
          notes: Object.fromEntries(
            Object.entries(point.snapshot.notes).filter(
              ([, text]) => typeof text === "string",
            ),
          ),
        },
      }));
  }

  function cloneState(value) {
    return normalizeState(value);
  }

  function localStorageOrNull() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function parseJSON(value) {
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function readLegacyState() {
    const storage = localStorageOrNull();
    if (!storage) return defaultState();
    try {
      const snapshot = parseJSON(storage.getItem(LOCAL_SNAPSHOT_KEY));
      if (snapshot?.format === "sales-os-local-v2" && snapshot.version === 2)
        return normalizeState(snapshot.state);
      return normalizeState(parseJSON(storage.getItem(LEGACY_STATE_KEY)));
    } catch {
      return defaultState();
    }
  }

  function emptyNote(text = "") {
    return {
      text,
      revision: 0,
      updatedAt: 0,
      writerId: "legacy",
      generation: 0,
    };
  }

  function normalizeNote(value) {
    if (typeof value === "string") return emptyNote(value);
    if (!isRecord(value) || typeof value.text !== "string") return emptyNote();
    return {
      text: value.text,
      revision:
        Number.isSafeInteger(value.revision) && value.revision >= 0
          ? value.revision
          : 0,
      updatedAt:
        Number.isFinite(value.updatedAt) && value.updatedAt >= 0
          ? value.updatedAt
          : 0,
      writerId: typeof value.writerId === "string" ? value.writerId : "legacy",
      generation:
        Number.isSafeInteger(value.generation) && value.generation >= 0
          ? value.generation
          : 0,
    };
  }

  function compareNotes(left, right) {
    if (left.generation !== right.generation)
      return left.generation - right.generation;
    if (left.revision !== right.revision) return left.revision - right.revision;
    if (left.updatedAt !== right.updatedAt)
      return left.updatedAt - right.updatedAt;
    return left.writerId.localeCompare(right.writerId);
  }

  function readLocalData() {
    const storage = localStorageOrNull();
    const data = {
      state: defaultState(),
      notes: new Map(),
      restorePoints: [],
      generation: 0,
      hasSnapshot: false,
      storage,
    };
    if (!storage) return data;

    try {
      const snapshot = parseJSON(storage.getItem(LOCAL_SNAPSHOT_KEY));
      if (snapshot?.format === "sales-os-local-v2" && snapshot.version === 2) {
        data.hasSnapshot = true;
        data.state = normalizeState(snapshot.state);
        data.generation =
          Number.isSafeInteger(snapshot.generation) && snapshot.generation >= 0
            ? snapshot.generation
            : 0;
        data.restorePoints = normalizeRestorePoints(snapshot.restorePoints);
        if (isRecord(snapshot.notes)) {
          for (const [id, note] of Object.entries(snapshot.notes))
            data.notes.set(id, normalizeNote(note));
        }
      } else {
        data.state = normalizeState(
          parseJSON(storage.getItem(LEGACY_STATE_KEY)),
        );
      }

      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key || key.startsWith(DRAFT_PREFIX)) continue;
        if (data.hasSnapshot) continue;

        if (key.startsWith(NOTE_RECORD_PREFIX)) {
          const id = key.slice(NOTE_RECORD_PREFIX.length);
          const record = normalizeNote(parseJSON(storage.getItem(key)));
          const current = data.notes.get(id);
          if (!current || compareNotes(record, current) > 0)
            data.notes.set(id, record);
          continue;
        }

        if (
          key.startsWith(LEGACY_NOTE_PREFIX) &&
          !key.startsWith(NOTE_RECORD_PREFIX)
        ) {
          const id = key.slice(LEGACY_NOTE_PREFIX.length);
          if (!data.notes.has(id))
            data.notes.set(id, emptyNote(storage.getItem(key) || ""));
        }
      }
    } catch {
      data.storage = null;
      data.state = defaultState();
      data.notes.clear();
    }
    return data;
  }

  function openDatabase() {
    if (database) return Promise.resolve(database);
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      try {
        if (!window.indexedDB) throw new Error("IndexedDB unavailable");
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STATE_STORE))
          db.createObjectStore(STATE_STORE);
        if (!db.objectStoreNames.contains(NOTES_STORE))
          db.createObjectStore(NOTES_STORE);
        if (!db.objectStoreNames.contains(RESTORE_STORE))
          db.createObjectStore(RESTORE_STORE, { keyPath: "id" });
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new Error("IndexedDB upgrade is blocked by another tab"));
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error || new Error("IndexedDB could not be opened"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        database = db;
        db.onversionchange = () => {
          db.close();
          if (database === db) database = null;
        };
        resolve(db);
      };
    });
  }

  function runTransaction(db, stores, mode, setup) {
    return new Promise((resolve, reject) => {
      let result;
      let failure = null;
      let settled = false;
      let transaction;
      try {
        transaction = db.transaction(stores, mode);
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => {
        failure =
          transaction.error || new Error("IndexedDB transaction failed");
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(
          failure ||
            transaction.error ||
            new Error("IndexedDB transaction aborted"),
        );
      };

      const setResult = (value) => {
        result = value;
      };
      const abort = (error) => {
        failure = error;
        try {
          transaction.abort();
        } catch {
          if (settled) return;
          settled = true;
          reject(error);
        }
      };
      try {
        setup(transaction, setResult, abort);
      } catch (error) {
        abort(error);
      }
    });
  }

  function writeLocalSnapshot(storage, data) {
    const snapshot = {
      format: "sales-os-local-v2",
      version: 2,
      generation: data.generation,
      state: normalizeState(data.state),
      notes: Object.fromEntries(data.notes),
      restorePoints: normalizeRestorePoints(data.restorePoints),
    };
    storage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }

  function mirrorState(state) {
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      storage.setItem(LEGACY_STATE_KEY, JSON.stringify(normalizeState(state)));
    } catch {
      // IndexedDB or the local snapshot remains authoritative if the mirror is full.
    }
  }

  function mirrorNote(id, note) {
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      storage.setItem(LEGACY_NOTE_PREFIX + id, note.text);
    } catch {
      // The note record in IndexedDB/local snapshot remains authoritative.
    }
  }

  function clearLegacyNotes() {
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      const keys = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (
          key?.startsWith(LEGACY_NOTE_PREFIX) &&
          !key.startsWith(NOTE_RECORD_PREFIX)
        )
          keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // Legacy mirrors are never authoritative after a committed replacement.
    }
  }

  function readDraft(id) {
    const storage = localStorageOrNull();
    if (!storage) return null;
    try {
      const draft = parseJSON(storage.getItem(DRAFT_PREFIX + id));
      if (!isRecord(draft) || typeof draft.text !== "string") return null;
      return {
        text: draft.text,
        baseRevision:
          Number.isSafeInteger(draft.baseRevision) && draft.baseRevision >= 0
            ? draft.baseRevision
            : 0,
        updatedAt:
          Number.isFinite(draft.updatedAt) && draft.updatedAt >= 0
            ? draft.updatedAt
            : 0,
        baseGeneration:
          Number.isSafeInteger(draft.baseGeneration) &&
          draft.baseGeneration >= 0
            ? draft.baseGeneration
            : 0,
      };
    } catch {
      return null;
    }
  }

  function cacheDraft(id, text, baseRevision, baseGeneration = generation) {
    const storage = localStorageOrNull();
    if (!storage) return false;
    try {
      storage.setItem(
        DRAFT_PREFIX + id,
        JSON.stringify({
          text,
          baseRevision,
          baseGeneration,
          updatedAt: Date.now(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function clearDraft(id) {
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      storage.removeItem(DRAFT_PREFIX + id);
    } catch {
      // Draft cleanup is best effort; a stale draft never overrides IndexedDB.
    }
  }

  function getDrafts() {
    const storage = localStorageOrNull();
    const drafts = {};
    if (!storage) return drafts;
    try {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(DRAFT_PREFIX)) continue;
        const draft = readDraft(key.slice(DRAFT_PREFIX.length));
        if (draft) drafts[key.slice(DRAFT_PREFIX.length)] = draft.text;
      }
    } catch {
      // Export still includes the saved records and current editor buffer.
    }
    return drafts;
  }

  function dispatch(message) {
    const payload = { ...message, source: clientId, nonce: createClientId() };
    for (const listener of listeners) listener(payload);
    try {
      channel?.postMessage(payload);
    } catch {
      // Local updates still work when BroadcastChannel is restricted.
    }
    const storage = localStorageOrNull();
    if (storage) {
      try {
        storage.setItem(SYNC_KEY, JSON.stringify(payload));
      } catch {
        // BroadcastChannel remains available when localStorage is blocked/full.
      }
    }
  }

  function dispatchRemote(payload) {
    if (!isRecord(payload) || payload.source === clientId) return;
    for (const listener of listeners) listener(payload);
  }

  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("sales-os-user-data-v2");
      channel.addEventListener("message", (event) =>
        dispatchRemote(event.data),
      );
    }
  } catch {
    channel = null;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== SYNC_KEY || !event.newValue) return;
    dispatchRemote(parseJSON(event.newValue));
  });

  async function initializeIndexedDB() {
    const legacy = readLocalData();
    const db = await openDatabase();
    let loadedState = defaultState();
    const loadedNotes = new Map();
    let loadedGeneration = 0;

    await runTransaction(
      db,
      [STATE_STORE, NOTES_STORE, RESTORE_STORE],
      "readwrite",
      (transaction, _setResult, abort) => {
        const stateStore = transaction.objectStore(STATE_STORE);
        let storedGeneration = null;
        let generationRead = false;
        let notesRead = false;
        const finishMigration = () => {
          if (!generationRead || !notesRead) return;
          loadedGeneration = Math.max(
            storedGeneration ?? 0,
            legacy.generation,
            ...[...loadedNotes.values()].map((record) => record.generation),
          );
          stateStore.put(loadedGeneration, GENERATION_KEY);
        };
        const stateRequest = stateStore.get(STATE_KEY);
        stateRequest.onsuccess = () => {
          loadedState = normalizeState(
            stateRequest.result === undefined
              ? legacy.state
              : stateRequest.result,
          );
          if (
            stateRequest.result === undefined ||
            JSON.stringify(stateRequest.result) !== JSON.stringify(loadedState)
          )
            stateStore.put(loadedState, STATE_KEY);
        };
        stateRequest.onerror = () => abort(stateRequest.error);

        const generationRequest = stateStore.get(GENERATION_KEY);
        generationRequest.onsuccess = () => {
          storedGeneration =
            Number.isSafeInteger(generationRequest.result) &&
            generationRequest.result >= 0
              ? generationRequest.result
              : null;
          generationRead = true;
          finishMigration();
        };
        generationRequest.onerror = () => abort(generationRequest.error);

        const noteStore = transaction.objectStore(NOTES_STORE);
        const cursorRequest = noteStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            const record = normalizeNote(cursor.value);
            const id = String(cursor.key);
            loadedNotes.set(id, record);
            if (typeof cursor.value === "string") cursor.update(record);
            cursor.continue();
            return;
          }
          for (const [id, record] of legacy.notes) {
            if (loadedNotes.has(id)) continue;
            loadedNotes.set(id, record);
            noteStore.put(record, id);
          }
          notesRead = true;
          finishMigration();
        };
        cursorRequest.onerror = () => abort(cursorRequest.error);

        const restoreStore = transaction.objectStore(RESTORE_STORE);
        for (const point of legacy.restorePoints) {
          try {
            restoreStore.put(point);
          } catch (error) {
            abort(error);
          }
        }
      },
    );

    stateCache = loadedState;
    stateCachePending = false;
    noteCache = loadedNotes;
    pendingNotes = new Map();
    generation = loadedGeneration;
    storageMode = "indexeddb";
    mirrorState(stateCache);
    return { state: cloneState(stateCache), mode: storageMode };
  }

  function initializeFallback() {
    const data = readLocalData();
    stateCache = data.state;
    stateCachePending = false;
    noteCache = data.notes;
    memoryRestorePoints = data.restorePoints;
    pendingNotes = new Map();
    generation = data.generation;
    storageMode = data.storage ? "localStorage" : "memory";
    return { state: cloneState(stateCache), mode: storageMode };
  }

  const ready = initializeIndexedDB().catch(() => {
    if (database) {
      database.close();
      database = null;
    }
    return initializeFallback();
  });

  function withFallbackLock(callback) {
    try {
      if (navigator.locks?.request)
        return navigator.locks.request(
          LOCK_NAME,
          { mode: "exclusive" },
          callback,
        );
    } catch {
      // The synchronous localStorage update below is the fallback lock.
    }
    return Promise.resolve().then(callback);
  }

  async function getState() {
    await ready;
    if (storageMode === "memory" || stateCachePending)
      return cloneState(stateCache);
    if (storageMode !== "indexeddb" || !database) {
      stateCache = readLocalData().state;
      return cloneState(stateCache);
    }
    try {
      return await runTransaction(
        database,
        STATE_STORE,
        "readonly",
        (tx, setResult, abort) => {
          const request = tx.objectStore(STATE_STORE).get(STATE_KEY);
          request.onsuccess = () => {
            stateCache = normalizeState(request.result);
            setResult(cloneState(stateCache));
          };
          request.onerror = () => abort(request.error);
        },
      );
    } catch {
      return cloneState(stateCache);
    }
  }

  async function updateState(mutator) {
    await ready;
    let nextState = null;
    let mutationError = null;

    if (storageMode === "indexeddb" && database) {
      try {
        await runTransaction(
          database,
          STATE_STORE,
          "readwrite",
          (tx, _setResult, abort) => {
            const store = tx.objectStore(STATE_STORE);
            const request = store.get(STATE_KEY);
            request.onsuccess = () => {
              try {
                nextState = normalizeState(
                  mutator(normalizeState(request.result)),
                );
              } catch (error) {
                mutationError = error;
                abort(error);
                return;
              }
              try {
                store.put(nextState, STATE_KEY);
              } catch (error) {
                abort(error);
              }
            };
            request.onerror = () => abort(request.error);
          },
        );
        stateCache = nextState;
        stateCachePending = false;
        mirrorState(nextState);
        dispatch({ type: "state" });
        return {
          state: cloneState(nextState),
          durable: true,
          mode: storageMode,
        };
      } catch {
        if (mutationError) throw mutationError;
        // Degrade to the explicit fallback instead of silently dropping the failed write.
        if (!nextState)
          nextState = normalizeState(mutator(cloneState(stateCache)));
        stateCache = nextState;
        stateCachePending = true;
        storageMode = localStorageOrNull() ? "localStorage" : "memory";
        database?.close();
        database = null;
      }
    }

    if (storageMode === "memory" && nextState) {
      stateCache = nextState;
      stateCachePending = true;
      return { state: cloneState(nextState), durable: false, mode: "memory" };
    }

    if (storageMode === "memory") {
      nextState = normalizeState(mutator(cloneState(stateCache)));
      stateCache = nextState;
      stateCachePending = true;
      return { state: cloneState(nextState), durable: false, mode: "memory" };
    }

    return withFallbackLock(() => {
      const current = readLocalData();
      if (!nextState)
        nextState = normalizeState(
          mutator(stateCachePending ? cloneState(stateCache) : current.state),
        );
      let durable = false;
      if (current.storage) {
        try {
          writeLocalSnapshot(current.storage, {
            ...current,
            state: nextState,
          });
          durable = true;
        } catch {
          if (!current.hasSnapshot) {
            try {
              current.storage.setItem(
                LEGACY_STATE_KEY,
                JSON.stringify(nextState),
              );
              durable = true;
            } catch {
              durable = false;
            }
          }
        }
      }
      stateCache = nextState;
      stateCachePending = !durable;
      storageMode = current.storage ? "localStorage" : "memory";
      mirrorState(nextState);
      if (durable) dispatch({ type: "state" });
      return { state: cloneState(nextState), durable, mode: storageMode };
    });
  }

  async function getNote(id) {
    await ready;
    let record = noteCache.get(id) || { ...emptyNote(), generation };
    if (pendingNotes.has(id)) {
      record = pendingNotes.get(id);
    } else if (storageMode === "indexeddb" && database) {
      try {
        record = await runTransaction(
          database,
          [STATE_STORE, NOTES_STORE],
          "readonly",
          (tx, setResult, abort) => {
            let noteReady = false;
            let generationReady = false;
            let noteValue;
            let currentGeneration = generation;
            const finishRead = () => {
              if (!noteReady || !generationReady) return;
              generation = Math.max(generation, currentGeneration);
              const value =
                noteValue === undefined
                  ? { ...emptyNote(), generation: currentGeneration }
                  : normalizeNote(noteValue);
              setResult(value);
            };
            const noteRequest = tx.objectStore(NOTES_STORE).get(id);
            noteRequest.onsuccess = () => {
              noteValue = noteRequest.result;
              noteReady = true;
              finishRead();
            };
            noteRequest.onerror = () => abort(noteRequest.error);
            const generationRequest = tx
              .objectStore(STATE_STORE)
              .get(GENERATION_KEY);
            generationRequest.onsuccess = () => {
              if (
                Number.isSafeInteger(generationRequest.result) &&
                generationRequest.result >= 0
              )
                currentGeneration = generationRequest.result;
              generationReady = true;
              finishRead();
            };
            generationRequest.onerror = () => abort(generationRequest.error);
          },
        );
        noteCache.set(id, record);
      } catch {
        // The in-memory/legacy value remains available for export and the editor.
      }
    } else if (storageMode === "localStorage") {
      const local = readLocalData().notes.get(id);
      if (local) record = local;
      noteCache.set(id, record);
    }
    return { record: { ...record }, draft: readDraft(id) };
  }

  async function saveNote(
    id,
    text,
    expectedRevision,
    expectedGeneration = generation,
  ) {
    await ready;
    let result = null;
    if (storageMode === "indexeddb" && database) {
      try {
        await runTransaction(
          database,
          [STATE_STORE, NOTES_STORE],
          "readwrite",
          (tx, _setResult, abort) => {
            const store = tx.objectStore(NOTES_STORE);
            let noteReady = false;
            let generationReady = false;
            let noteValue;
            let currentGeneration = generation;
            const finishRead = () => {
              if (!noteReady || !generationReady) return;
              const current =
                noteValue === undefined
                  ? { ...emptyNote(), generation: currentGeneration }
                  : normalizeNote(noteValue);
              generation = Math.max(generation, currentGeneration);
              if (
                current.revision !== expectedRevision ||
                expectedGeneration !== currentGeneration
              ) {
                result = {
                  ok: false,
                  reason: "conflict",
                  record: { ...current, generation: currentGeneration },
                };
                return;
              }
              const record = {
                text,
                revision: current.revision + 1,
                updatedAt: Date.now(),
                writerId: clientId,
                generation: currentGeneration,
              };
              try {
                store.put(record, id);
                result = { ok: true, record };
              } catch (error) {
                abort(error);
              }
            };
            const noteRequest = store.get(id);
            noteRequest.onsuccess = () => {
              noteValue = noteRequest.result;
              noteReady = true;
              finishRead();
            };
            noteRequest.onerror = () => abort(noteRequest.error);
            const generationRequest = tx
              .objectStore(STATE_STORE)
              .get(GENERATION_KEY);
            generationRequest.onsuccess = () => {
              if (
                Number.isSafeInteger(generationRequest.result) &&
                generationRequest.result >= 0
              )
                currentGeneration = generationRequest.result;
              generationReady = true;
              finishRead();
            };
            generationRequest.onerror = () => abort(generationRequest.error);
          },
        );
        if (!result?.ok) return result;
        noteCache.set(id, result.record);
        mirrorNote(id, result.record);
        clearDraft(id);
        dispatch({ type: "note", id, record: result.record });
        return { ...result, durable: true, mode: storageMode };
      } catch (error) {
        return { ok: false, reason: "storage", error, mode: "memory" };
      }
    }

    return withFallbackLock(() => {
      const current =
        storageMode === "memory"
          ? { state: stateCache, notes: noteCache, generation, storage: null }
          : readLocalData();
      const existing =
        pendingNotes.get(id) || current.notes.get(id) || emptyNote();
      if (
        existing.revision !== expectedRevision ||
        current.generation !== expectedGeneration
      )
        return {
          ok: false,
          reason: "conflict",
          record: { ...existing, generation: current.generation },
        };
      const record = {
        text,
        revision: existing.revision + 1,
        updatedAt: Date.now(),
        writerId: clientId,
        generation: current.generation,
      };
      let durable = false;
      if (current.storage) {
        if (current.hasSnapshot) {
          const updatedNotes = new Map(current.notes);
          updatedNotes.set(id, record);
          try {
            writeLocalSnapshot(current.storage, {
              ...current,
              state: current.state,
              notes: updatedNotes,
            });
            durable = true;
          } catch {
            durable = false;
          }
        } else {
          try {
            current.storage.setItem(
              NOTE_RECORD_PREFIX + id,
              JSON.stringify(record),
            );
            durable = true;
          } catch {
            durable = false;
          }
        }
      }

      noteCache.set(id, record);
      storageMode = current.storage ? "localStorage" : "memory";
      if (durable) {
        pendingNotes.delete(id);
        mirrorNote(id, record);
        clearDraft(id);
        dispatch({ type: "note", id, record });
      } else {
        pendingNotes.set(id, record);
      }
      return durable
        ? { ok: true, record, durable: true, mode: storageMode }
        : { ok: false, reason: "storage", record, mode: "memory" };
    });
  }

  async function getAllNotes() {
    await ready;
    if (storageMode === "memory") {
      return Object.fromEntries(
        [...noteCache].map(([id, record]) => [id, record.text]),
      );
    }
    if (storageMode !== "indexeddb" || !database) {
      const local = readLocalData();
      noteCache = local.notes;
      for (const [id, record] of pendingNotes) noteCache.set(id, record);
      return Object.fromEntries(
        [...noteCache].map(([id, record]) => [id, record.text]),
      );
    }

    try {
      const records = await runTransaction(
        database,
        NOTES_STORE,
        "readonly",
        (tx, setResult, abort) => {
          const result = {};
          const request = tx.objectStore(NOTES_STORE).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              const id = String(cursor.key);
              const record = normalizeNote(cursor.value);
              result[id] = record.text;
              noteCache.set(id, record);
              cursor.continue();
              return;
            }
            setResult(result);
          };
          request.onerror = () => abort(request.error);
        },
      );
      return records;
    } catch {
      return Object.fromEntries(
        [...noteCache].map(([id, record]) => [id, record.text]),
      );
    }
  }

  function fingerprintText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${value.length}-${(hash >>> 0).toString(16)}`;
  }

  function samePracticeDraft(left, right) {
    return (
      JSON.stringify({
        answers: left.answers,
        selfReview: left.selfReview,
        nextStep: left.nextStep,
      }) ===
      JSON.stringify({
        answers: right.answers,
        selfReview: right.selfReview,
        nextStep: right.nextStep,
      })
    );
  }

  function mergeStates(currentValue, incomingValue) {
    const current = normalizeState(currentValue);
    const incoming = normalizeState(incomingValue);
    const merged = normalizeState(current);
    const statusRanks = {
      not_started: 0,
      in_progress: 1,
      theory_completed: 2,
      self_reviewed: 2,
      completed: 3,
      mastered: 3,
    };
    for (const field of ["lessonStatuses", "practiceStatuses"]) {
      for (const [id, status] of Object.entries(incoming[field])) {
        if (
          (statusRanks[status] ?? -1) > (statusRanks[merged[field][id]] ?? -1)
        )
          merged[field][id] = status;
      }
    }
    merged.bookmarks = [
      ...new Set([...current.bookmarks, ...incoming.bookmarks]),
    ];
    for (const [id, imported] of Object.entries(incoming.practiceDrafts)) {
      const local = merged.practiceDrafts[id];
      if (!local) {
        merged.practiceDrafts[id] = imported;
        continue;
      }
      const versions = [...local.versions, ...imported.versions];
      if (!samePracticeDraft(local, imported)) {
        const older = local.updatedAt <= imported.updatedAt ? local : imported;
        versions.push(normalizePracticeDraftVersion(older));
      }
      const seen = new Set();
      merged.practiceDrafts[id] = {
        ...(local.updatedAt > imported.updatedAt ? local : imported),
        versions: versions
          .filter((version) => {
            const key = fingerprintText(JSON.stringify(version));
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(-20),
      };
    }
    for (const [id, attempts] of Object.entries(incoming.practiceAttempts)) {
      const known = new Map(
        (merged.practiceAttempts[id] || []).map((attempt) => [
          attempt.id,
          attempt,
        ]),
      );
      for (const attempt of attempts)
        if (!known.has(attempt.id)) known.set(attempt.id, attempt);
      merged.practiceAttempts[id] = [...known.values()].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
    }
    for (const [id, imported] of Object.entries(incoming.revisitQueue)) {
      const local = merged.revisitQueue[id];
      if (!local || imported.dueAt < local.dueAt)
        merged.revisitQueue[id] = imported;
    }
    const history = new Map(
      [...current.revisitHistory, ...incoming.revisitHistory].map((item) => [
        `${item.entryId}:${item.completedAt}:${fingerprintText(item.recallDraft)}`,
        item,
      ]),
    );
    merged.revisitHistory = [...history.values()]
      .sort((a, b) => a.completedAt - b.completedAt)
      .slice(-500);
    for (const [id, hashes] of Object.entries(incoming.noteMergeSources)) {
      merged.noteMergeSources[id] = [
        ...new Set([...(merged.noteMergeSources[id] || []), ...hashes]),
      ].slice(-100);
    }
    for (const [id, session] of Object.entries(incoming.trainerSessions)) {
      const local = merged.trainerSessions[id];
      if (!local) merged.trainerSessions[id] = session;
      else if (JSON.stringify(local) !== JSON.stringify(session)) {
        const copyId = `${id.slice(0, 70)}-import-${fingerprintText(JSON.stringify(session))}`;
        merged.trainerSessions[copyId] = {
          ...session,
          id: copyId,
          conflictOf: id,
        };
      }
    }
    merged.lastExport =
      !current.lastExport ||
      incoming.lastExport?.exportedAt > current.lastExport.exportedAt
        ? incoming.lastExport
        : current.lastExport;
    merged.lastVisited = current.lastVisited || incoming.lastVisited;
    merged.legacyImported = current.legacyImported || incoming.legacyImported;
    return normalizeState(merged);
  }

  function mergeNoteTexts(currentState, currentNotes, incomingNotes) {
    const mergedState = normalizeState(currentState);
    const mergedNotes = new Map(currentNotes);
    const now = new Date().toLocaleDateString("ru-RU");
    for (const [id, incomingValue] of Object.entries(incomingNotes)) {
      const incoming = String(incomingValue);
      const current = mergedNotes.get(id)?.text || "";
      if (!incoming || incoming === current || current.includes(incoming))
        continue;
      const fingerprint = fingerprintText(incoming);
      const known = mergedState.noteMergeSources[id] || [];
      if (known.includes(fingerprint)) continue;
      const combined =
        !current || incoming.includes(current)
          ? incoming
          : `${current}\n\n---\n\n[Вариант из импортированной копии · ${now}]\n\n${incoming}`;
      if (combined.length > 250000)
        throw new Error(
          `Заметка ${id} после объединения превысит допустимый размер 250 КБ. Объединение отменено без изменений.`,
        );
      mergedNotes.set(id, {
        text: combined,
        revision: (mergedNotes.get(id)?.revision || 0) + 1,
        updatedAt: Date.now(),
        writerId: clientId,
        generation,
      });
      mergedState.noteMergeSources[id] = [
        ...new Set([...known, fingerprint]),
      ].slice(-100);
    }
    return { state: normalizeState(mergedState), notes: mergedNotes };
  }

  function createRestorePoint(state, notes, reason) {
    const noteEntries =
      notes instanceof Map ? [...notes] : Object.entries(safeObject(notes));
    return {
      id: createClientId(),
      createdAt: Date.now(),
      reason: reason === "before-restore" ? "before-restore" : "before-import",
      snapshot: {
        state: normalizeState(state),
        notes: Object.fromEntries(
          noteEntries.map(([id, note]) => [
            id,
            typeof note === "string" ? note : note.text,
          ]),
        ),
      },
    };
  }

  function importNotesToMap(values, currentNotes, nextGeneration) {
    return new Map(
      Object.entries(values).map(([id, text]) => [
        id,
        {
          text: String(text),
          revision: (currentNotes.get(id)?.revision || 0) + 1,
          updatedAt: Date.now(),
          writerId: clientId,
          generation: nextGeneration,
        },
      ]),
    );
  }

  async function replaceAll(nextState, nextNotes, options = {}) {
    await ready;
    const incomingState = normalizeState(nextState);
    const incomingNotes = Object.fromEntries(
      Object.entries(safeObject(nextNotes)).filter(
        ([, text]) => typeof text === "string",
      ),
    );
    const nextGeneration = generation + 1;

    if (storageMode === "indexeddb" && database) {
      let committedState = incomingState;
      let committedNotes = new Map();
      let restorePoint;
      const result = await runTransaction(
        database,
        [STATE_STORE, NOTES_STORE, RESTORE_STORE],
        "readwrite",
        (tx, setResult, abort) => {
          const stateStore = tx.objectStore(STATE_STORE);
          const noteStore = tx.objectStore(NOTES_STORE);
          let currentState = defaultState();
          const currentNotes = new Map();
          let stateReady = false;
          let notesReady = false;
          const finish = () => {
            if (!stateReady || !notesReady) return;
            try {
              const recoveryNotes = Object.fromEntries(
                [...currentNotes].map(([id, record]) => [id, record.text]),
              );
              Object.assign(recoveryNotes, options.recoveryNotes || {});
              restorePoint = createRestorePoint(
                currentState,
                recoveryNotes,
                options.reason,
              );
              const baseState = options.merge
                ? mergeStates(currentState, incomingState)
                : incomingState;
              const mergeResult = options.merge
                ? mergeNoteTexts(baseState, currentNotes, incomingNotes)
                : {
                    state: baseState,
                    notes: importNotesToMap(
                      incomingNotes,
                      currentNotes,
                      nextGeneration,
                    ),
                  };
              committedState = mergeResult.state;
              committedNotes = importNotesToMap(
                Object.fromEntries(
                  [...mergeResult.notes].map(([id, note]) => [id, note.text]),
                ),
                currentNotes,
                nextGeneration,
              );
              const restoreStore = tx.objectStore(RESTORE_STORE);
              restoreStore.put(restorePoint);
              const pointsRequest = restoreStore.getAll();
              pointsRequest.onsuccess = () => {
                const points = pointsRequest.result.sort(
                  (a, b) => a.createdAt - b.createdAt,
                );
                for (const oldPoint of points.slice(
                  0,
                  Math.max(0, points.length - 10),
                ))
                  restoreStore.delete(oldPoint.id);
              };
              pointsRequest.onerror = () => abort(pointsRequest.error);

              stateStore.put(committedState, STATE_KEY);
              stateStore.put(nextGeneration, GENERATION_KEY);
              noteStore.clear();
              for (const [id, record] of committedNotes)
                noteStore.put(record, id);
              setResult({ state: committedState });
            } catch (error) {
              abort(error);
            }
          };
          const stateRequest = stateStore.get(STATE_KEY);
          stateRequest.onsuccess = () => {
            currentState = normalizeState(stateRequest.result);
            stateReady = true;
            finish();
          };
          stateRequest.onerror = () => abort(stateRequest.error);
          const cursorRequest = noteStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              currentNotes.set(String(cursor.key), normalizeNote(cursor.value));
              cursor.continue();
              return;
            }
            notesReady = true;
            finish();
          };
          cursorRequest.onerror = () => abort(cursorRequest.error);
        },
      );
      committedState = normalizeState(result.state);
      stateCache = committedState;
      noteCache = committedNotes;
      pendingNotes = new Map();
      generation = nextGeneration;
      if (restorePoint)
        memoryRestorePoints = [...memoryRestorePoints, restorePoint].slice(-10);
      clearLegacyNotes();
      for (const [id, record] of committedNotes) mirrorNote(id, record);
      clearSavedDrafts();
      mirrorState(committedState);
      dispatch({ type: "replace" });
      return {
        state: cloneState(committedState),
        durable: true,
        mode: storageMode,
      };
    }

    if (storageMode === "localStorage") {
      return withFallbackLock(() => {
        const current = readLocalData();
        const currentState = stateCachePending
          ? cloneState(stateCache)
          : current.state;
        const availableNotes = new Map(current.notes);
        for (const [id, record] of pendingNotes) availableNotes.set(id, record);
        const recoveryNotes = Object.fromEntries(
          [...availableNotes].map(([id, record]) => [id, record.text]),
        );
        Object.assign(recoveryNotes, options.recoveryNotes || {});
        const restorePoint = createRestorePoint(
          currentState,
          recoveryNotes,
          options.reason,
        );
        const baseState = options.merge
          ? mergeStates(currentState, incomingState)
          : incomingState;
        const mergeResult = options.merge
          ? mergeNoteTexts(baseState, availableNotes, incomingNotes)
          : {
              state: baseState,
              notes: importNotesToMap(
                incomingNotes,
                availableNotes,
                nextGeneration,
              ),
            };
        const importedNotes = importNotesToMap(
          Object.fromEntries(
            [...mergeResult.notes].map(([id, note]) => [id, note.text]),
          ),
          availableNotes,
          nextGeneration,
        );
        const restorePoints = [...current.restorePoints, restorePoint].slice(
          -10,
        );
        try {
          writeLocalSnapshot(current.storage, {
            state: mergeResult.state,
            notes: importedNotes,
            restorePoints,
            generation: nextGeneration,
          });
        } catch (error) {
          throw new Error(
            `Cannot atomically replace local data within browser storage limits: ${error.message}`,
          );
        }
        stateCache = mergeResult.state;
        stateCachePending = false;
        noteCache = importedNotes;
        pendingNotes = new Map();
        generation = nextGeneration;
        memoryRestorePoints = restorePoints;
        clearLegacyNotes();
        for (const [id, record] of importedNotes) mirrorNote(id, record);
        clearSavedDrafts();
        mirrorState(mergeResult.state);
        dispatch({ type: "replace" });
        return {
          state: cloneState(mergeResult.state),
          durable: true,
          mode: storageMode,
        };
      });
    }

    const baseState = options.merge
      ? mergeStates(stateCache, incomingState)
      : incomingState;
    const availableNotes = new Map(noteCache);
    for (const [id, record] of pendingNotes) availableNotes.set(id, record);
    const mergeResult = options.merge
      ? mergeNoteTexts(baseState, availableNotes, incomingNotes)
      : {
          state: baseState,
          notes: importNotesToMap(
            incomingNotes,
            availableNotes,
            nextGeneration,
          ),
        };
    const recoveryPoint = createRestorePoint(
      stateCache,
      availableNotes,
      options.reason,
    );
    const importedNotes = importNotesToMap(
      Object.fromEntries(
        [...mergeResult.notes].map(([id, note]) => [id, note.text]),
      ),
      availableNotes,
      nextGeneration,
    );
    stateCache = mergeResult.state;
    stateCachePending = true;
    noteCache = importedNotes;
    pendingNotes = new Map();
    generation = nextGeneration;
    memoryRestorePoints = [...memoryRestorePoints, recoveryPoint].slice(-10);
    dispatch({ type: "replace", state: cloneState(stateCache) });
    return { state: cloneState(stateCache), durable: false, mode: "memory" };
  }

  async function getRestorePoints() {
    await ready;
    if (storageMode === "indexeddb" && database) {
      return runTransaction(
        database,
        RESTORE_STORE,
        "readonly",
        (tx, setResult, abort) => {
          const request = tx.objectStore(RESTORE_STORE).getAll();
          request.onsuccess = () =>
            setResult(
              request.result
                .filter(isRestorePoint)
                .sort((a, b) => b.createdAt - a.createdAt)
                .map(({ id, createdAt, reason }) => ({
                  id,
                  createdAt,
                  reason,
                })),
            );
          request.onerror = () => abort(request.error);
        },
      );
    }
    const points =
      storageMode === "localStorage"
        ? readLocalData().restorePoints
        : memoryRestorePoints;
    return normalizeRestorePoints(points)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, createdAt, reason }) => ({ id, createdAt, reason }));
  }

  async function restoreBackup(id) {
    await ready;
    let point = null;
    if (storageMode === "indexeddb" && database) {
      point = await runTransaction(
        database,
        RESTORE_STORE,
        "readonly",
        (tx, setResult, abort) => {
          const request = tx.objectStore(RESTORE_STORE).get(id);
          request.onsuccess = () => setResult(request.result || null);
          request.onerror = () => abort(request.error);
        },
      );
    } else {
      point =
        normalizeRestorePoints(
          storageMode === "localStorage"
            ? readLocalData().restorePoints
            : memoryRestorePoints,
        ).find((item) => item.id === id) || null;
    }
    if (!isRestorePoint(point)) throw new Error("Restore point is unavailable");
    return replaceAll(point.snapshot.state, point.snapshot.notes, {
      reason: "before-restore",
    });
  }

  function clearSavedDrafts() {
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (key?.startsWith(DRAFT_PREFIX)) storage.removeItem(key);
      }
    } catch {
      // Committed state and notes remain authoritative if draft cleanup is blocked.
    }
  }

  function readTheme() {
    const storage = localStorageOrNull();
    if (!storage) return "system";
    try {
      const theme = storage.getItem("sales-os-theme");
      return ["system", "light", "dark"].includes(theme) ? theme : "system";
    } catch {
      return "system";
    }
  }

  function writeTheme(theme) {
    const storage = localStorageOrNull();
    if (!storage) return false;
    try {
      storage.setItem("sales-os-theme", theme);
      return true;
    } catch {
      return false;
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getMode() {
    return storageMode;
  }

  function close() {
    if (!database) return;
    database.close();
    database = null;
  }

  window.SalesOSUserStore = {
    ready,
    initialState: cloneState(stateCache),
    clientId,
    getMode,
    getState,
    updateState,
    getNote,
    saveNote,
    getAllNotes,
    getDrafts,
    cacheDraft,
    clearDraft,
    replaceAll,
    getRestorePoints,
    restoreBackup,
    readTheme,
    writeTheme,
    subscribe,
    close,
  };
})();
