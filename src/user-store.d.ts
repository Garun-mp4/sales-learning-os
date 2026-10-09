export {};

type SalesOSProgressState = {
  format?: string;
  version?: number;
  lessonStatuses: Record<string, string>;
  practiceStatuses: Record<string, string>;
  bookmarks: string[];
  practiceDrafts: Record<string, SalesOSPracticeDraft>;
  practiceAttempts: Record<
    string,
    Array<{
      id: string;
      createdAt: number;
      rubric: Array<{ id: string; label: string; description: string }>;
      answers: Record<string, string>;
      selfReview: Record<string, number>;
      nextStep: string;
    }>
  >;
  revisitQueue: Record<string, { dueAt: number; recallDraft?: string }>;
  revisitHistory: Array<{ entryId: string; completedAt: number }>;
  noteMergeSources: Record<string, string[]>;
  lastExport: { exportedAt: number; sizeBytes: number } | null;
  lastVisited?: string | null;
  legacyImported?: boolean;
};

type SalesOSPracticeDraft = {
  answers: Record<string, string>;
  selfReview: Record<string, number>;
  nextStep?: string;
  updatedAt?: number;
  writerId?: string;
  versions?: Array<{
    answers: Record<string, string>;
    selfReview: Record<string, number>;
    nextStep?: string;
    updatedAt?: number;
    writerId?: string;
  }>;
};

type SalesOSSavedNote = {
  text: string;
  revision: number;
  generation: number;
  updatedAt: number;
  writerId: string;
};

type SalesOSUserDataStore = {
  clientId: string;
  initialState: SalesOSProgressState;
  ready: Promise<{ state: SalesOSProgressState; mode: string }>;
  getState: () => Promise<SalesOSProgressState>;
  updateState: (
    mutator: (current: SalesOSProgressState) => SalesOSProgressState,
  ) => Promise<{
    state: SalesOSProgressState;
    durable: boolean;
    mode: string;
  }>;
  subscribe: (listener: (message: unknown) => void) => () => void;
  getNote: (id: string) => Promise<{
    record: SalesOSSavedNote;
    draft: {
      text: string;
      baseRevision: number;
      baseGeneration: number;
    } | null;
  }>;
  replaceAll: (
    state: Partial<SalesOSProgressState>,
    notes: Record<string, string>,
    options?: {
      merge?: boolean;
      recoveryNotes?: Record<string, string>;
    },
  ) => Promise<{
    state: SalesOSProgressState;
    durable: boolean;
    mode: string;
  }>;
  getRestorePoints: () => Promise<
    Array<{ id: string; createdAt: number; reason: string }>
  >;
  restoreBackup: (id: string) => Promise<{
    state: SalesOSProgressState;
    durable: boolean;
    mode: string;
  }>;
};

declare global {
  interface Window {
    SalesOSUserStore: SalesOSUserDataStore;
  }
}
