export {};

type SalesOSProgressState = {
  format?: string;
  version?: number;
  lessonStatuses: Record<string, string>;
  practiceStatuses: Record<string, string>;
  bookmarks: string[];
  practiceDrafts: Record<string, SalesOSPracticeDraft>;
  today: {
    preferences: { budget: number; goal: string; updatedAt: number };
    plans: Record<string, unknown>;
  };
  projects: {
    activeId: string | null;
    activeUpdatedAt: number;
    items: Record<string, unknown>;
    tombstones: Record<string, number>;
    migrations: string[];
  };
  annotations: { items: Record<string, SalesOSHighlightRecord> };
  knowledgeReview: {
    enabled: boolean;
    settingsUpdatedAt: number;
    drafts: Record<string, unknown>;
    attempts: Record<string, unknown>;
    schedule: Record<string, unknown>;
    events: unknown[];
  };
  trainerSessions: Record<string, SalesOSTrainerSession>;
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

type SalesOSHighlightRecord = {
  id: string;
  documentId: string;
  blockIds: string[];
  quote: string;
  anchorQuote: string;
  contextBefore: string;
  contextAfter: string;
  textVersion: string;
  comment: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  deletedAt: number;
  reviewAt: number;
  scheduledAt: number;
  recallDraft: string;
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
  getMode: () => string;
  getAllNotes: () => Promise<Record<string, string>>;
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
    SalesOSProjects: {
      empty: () => SalesOSProgressState["projects"];
      validate: (v: unknown) => SalesOSProgressState["projects"];
      merge: (
        left: unknown,
        right: unknown,
      ) => SalesOSProgressState["projects"];
    };
    SalesOSPractice: {
      register: (form: HTMLFormElement, adapter: unknown) => unknown;
      unregister: (form: HTMLFormElement) => void;
    };
  }

  interface Window {
    SalesOSKnowledge: {
      empty: () => SalesOSProgressState["knowledgeReview"];
      validate: (value: unknown) => SalesOSProgressState["knowledgeReview"];
      merge: (
        left: unknown,
        right: unknown,
      ) => SalesOSProgressState["knowledgeReview"];
    };
  }
  interface Window {
    SalesOSUserStore: SalesOSUserDataStore;
    SalesOSToday: {
      empty: () => SalesOSProgressState["today"];
      validate: (raw: unknown) => SalesOSProgressState["today"];
      merge: (a: unknown, b: unknown) => SalesOSProgressState["today"];
    };
    SalesOSTrainer: {
      validateSessions: (raw: unknown) => Record<string, SalesOSTrainerSession>;
    };
  }
}

type SalesOSTrainerSession = {
  id: string;
  scenarioId: string;
  scenarioVersion: number;
  scenario: Record<string, unknown>;
  revision: number;
  createdAt: number;
  updatedAt: number;
  steps: Array<{ nodeId: string; choiceId: string; text: string; at: number }>;
  draft: { text: string; choiceId: string };
  deletedAt: number | null;
  conflictOf?: string;
};
