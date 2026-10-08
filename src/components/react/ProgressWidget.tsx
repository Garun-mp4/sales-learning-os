import { useEffect, useState } from "react";

type ProgressState = {
  format?: string;
  version?: number;
  lessonStatuses: Record<string, string>;
  practiceStatuses: Record<string, string>;
  bookmarks: string[];
  lastVisited?: string | null;
  legacyImported?: boolean;
};

type SavedNote = {
  text: string;
  revision: number;
  generation: number;
  updatedAt: number;
  writerId: string;
};

type UserDataStore = {
  ready: Promise<{ state: ProgressState; mode: string }>;
  getState: () => Promise<ProgressState>;
  getNote: (id: string) => Promise<{
    record: SavedNote;
    draft: {
      text: string;
      baseRevision: number;
      baseGeneration: number;
    } | null;
  }>;
  replaceAll: (
    state: ProgressState,
    notes: Record<string, string>,
  ) => Promise<{ state: ProgressState; durable: boolean; mode: string }>;
};

declare global {
  interface Window {
    SalesOSUserStore: UserDataStore;
  }
}

export default function ProgressWidget() {
  const [t, setT] = useState(0),
    [p, setP] = useState(0);
  useEffect(() => {
    let latestRefresh = 0;
    async function refresh() {
      const store = window.SalesOSUserStore;
      if (!store) return;
      const request = ++latestRefresh;
      const data = await store.getState();
      if (request !== latestRefresh) return;
      setT(
        Object.values(data.lessonStatuses || {}).filter(
          (x) => x === "theory_completed" || x === "mastered",
        ).length,
      );
      setP(
        Object.values(data.practiceStatuses || {}).filter(
          (x) => x === "completed" || x === "self_reviewed",
        ).length,
      );
    }
    void refresh();
    window.addEventListener("salesstatechange", refresh);
    return () => window.removeEventListener("salesstatechange", refresh);
  }, []);
  return (
    <div className="stat-grid" aria-label="Прогресс обучения">
      <div className="stat">
        <div className="label">Пройдено теории</div>
        <div className="value">{t} / 336</div>
        <div className="label">336 уроков</div>
      </div>
      <div className="stat">
        <div className="label">Практика</div>
        <div className="value">{p} / 72</div>
        <div className="label">72 задания</div>
      </div>
      <div className="stat">
        <div className="label">Общий прогресс</div>
        <div className="value">{Math.round(((t + p) / 408) * 100)}%</div>
        <div className="progress">
          <span style={{ width: Math.round(((t + p) / 408) * 100) + "%" }} />
        </div>
      </div>
    </div>
  );
}
