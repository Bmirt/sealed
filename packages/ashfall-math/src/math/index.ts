/**
 * Public surface of the maths module. Pure, seeded, renderer-agnostic.
 *
 *   spin(config, seed, nonce)            → full round (base + feature)
 *   buySpin(config, seed, nonce, tier)   → full bought round
 *   validateConfig / assertValidConfig   → config invariants
 *   exactRtp                             → closed-form base-game RTP for tuning
 */
export { spin } from './spin';
export { buySpin, buyCostCoins } from './buy';
export { validateConfig, assertValidConfig } from './validate';
export type { ValidationIssue } from './validate';
export { exactRtp } from './exact';
export type { ExactBaseRtp } from './exact';
export { rngFor, rngFromString, cyrb128 } from './rng';
export type { Rng } from './rng';
export { evaluateGrid, spinsForScatters } from './ways';
export { gridFromStops, drawStops } from './grid';
export { contextFor } from './context';
export type { EvalContext } from './context';
export * from './types';
