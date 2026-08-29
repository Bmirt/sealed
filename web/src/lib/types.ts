export interface RoundRecord {
  cycle_id: number;
  round_index: number;
  player_id: string;
  client_seed: string;
  nonce: number;
  target: number;
  wager_micros: number;
  roll: number;
  payout_micros: number;
  ts: number;
}
export interface ProofStep {
  hash: string;
  side: "left" | "right";
}
export interface CycleRounds {
  cycle_id: number;
  server_seed: string | null;
  seed_hash: string;
  status: "active" | "revealed";
  records: RoundRecord[];
  txs: { commit?: string; close?: string; reveal?: string };
  cheat_attempts: { signature: string; error: string; at: number }[];
  merkle_root?: string;
  committed_at?: number;
  revealed_at?: number;
  pda: string;
  merkle_root_local: string;
  proofs: ProofStep[][];
  leaves: string[];
}
export interface ServerState {
  program_id: string;
  cluster?: string;
  rpc: string;
  config_pda: string;
  rtp_pda: string;
  active_cycle: { cycle_id: number; seed_hash: string; pda: string; committed_at?: number; rounds: number; commit_tx?: string } | null;
  cycles: { cycle_id: number; status: "active" | "revealed"; rounds: number; pda: string; cheat_attempts: number }[];
  rtp: { totalRounds: number; totalWageredMicros: number; totalPaidMicros: number; rtp: number | null; declared: number };
}
export interface ChainCycle {
  cycleId: number;
  seedHash: string;
  revealed: boolean;
  closed: boolean;
  revealedSeed: string;
  committedAt: number;
  revealedAt: number;
  merkleRoot: string;
  rounds: number;
  wageredMicros: number;
  paidMicros: number;
}
export interface ChainRtp {
  totalRounds: number;
  totalWageredMicros: number;
  totalPaidMicros: number;
}
