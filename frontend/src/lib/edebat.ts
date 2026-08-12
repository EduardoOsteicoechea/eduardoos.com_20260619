export type EdebatParticipant = {
  role: "challenger" | "opponent" | string;
  kind?: string;
  email?: string;
  displayName: string;
};

export type EdebatReferee = {
  challengerScore: number;
  opponentScore: number;
  analysis: string;
};

export type EdebatRound = {
  index: number;
  challengerArg: string;
  opponentArg: string;
  referee?: EdebatReferee;
  completedAt?: string;
};

export type EdebatResult = {
  winner: "challenger" | "opponent" | "draw" | string;
  summary: string;
  endedBy?: string;
  finalScores: {
    challenger: number;
    opponent: number;
  };
};

export type EdebatDocument = {
  version: number;
  id: string;
  title: string;
  topic: string;
  /** 0 = unlimited until surrender */
  roundsTotal: number;
  rules: string[];
  participants: EdebatParticipant[];
  rounds: EdebatRound[];
  result?: EdebatResult | null;
  createdAt: string;
  updatedAt: string;
};

export type EdebatRecord = {
  userId: string;
  debateId: string;
  title: string;
  topic: string;
  roundsTotal: number;
  roundsCompleted: number;
  s3Key: string;
  contentSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export const EDEBAT_UNLIMITED_ROUNDS = 0;
export const EDEBAT_MAX_ARGUMENT_CHARS = 750;

export function isEdebatUnlimited(roundsTotal: number): boolean {
  return roundsTotal === EDEBAT_UNLIMITED_ROUNDS;
}

export function isEdebatFinished(doc: EdebatDocument): boolean {
  if (doc.result) return true;
  if (isEdebatUnlimited(doc.roundsTotal)) return false;
  return doc.rounds.length >= doc.roundsTotal;
}

export const EDEBAT_ROUTES = {
  list: "/api/edebat",
  create: "/api/edebat",
  item: (id: string) => `/api/edebat/${encodeURIComponent(id)}`,
  turn: (id: string) => `/api/edebat/${encodeURIComponent(id)}/turn`,
  surrender: (id: string) => `/api/edebat/${encodeURIComponent(id)}/surrender`,
} as const;
