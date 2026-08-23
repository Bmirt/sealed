import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { contextFor } from '@math/context';
import { evaluateGrid, spinsForScatters } from '@math/ways';
import { gridOf } from './helpers';

const ctx = contextFor(GAME_CONFIG);
const pay = GAME_CONFIG.paytable;

describe('243-ways evaluation', () => {
  it('pays a single 3-of-a-kind way', () => {
    const grid = gridOf([
      ['H1', 'L2', 'L3', 'L4', 'L1'],
      ['L2', 'H1', 'L4', 'L1', 'L2'],
      ['L3', 'L4', 'H1', 'L2', 'L3'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins).toHaveLength(1);
    const w = ev.wins[0];
    expect(w?.symbol).toBe('H1');
    expect(w?.length).toBe(3);
    expect(w?.ways).toBe(1);
    expect(w?.win).toBe(pay.H1[0]);
    expect(w?.positions).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(ev.lineWinCoins).toBe(pay.H1[0]);
  });

  it('multiplies ways across reels (2 × 1 × 3 = 6)', () => {
    const grid = gridOf([
      ['M1', 'L2', 'M1', 'L4', 'L1'],
      ['M1', 'M1', 'M1', 'L1', 'L2'],
      ['L3', 'L4', 'M1', 'L2', 'L3'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins).toHaveLength(1);
    expect(ev.wins[0]?.ways).toBe(6);
    expect(ev.wins[0]?.win).toBe(6 * pay.M1[0]);
  });

  it('does not pay when the symbol is missing from reel 1', () => {
    const grid = gridOf([
      ['L2', 'H1', 'H1', 'H1', 'H1'],
      ['L3', 'H1', 'H1', 'H1', 'H1'],
      ['L4', 'H1', 'H1', 'H1', 'H1'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins).toHaveLength(0);
  });

  it('stops at the first reel without the symbol', () => {
    const grid = gridOf([
      ['H2', 'H2', 'L1', 'H2', 'H2'],
      ['L2', 'L3', 'L1', 'H2', 'H2'],
      ['L3', 'L4', 'L1', 'H2', 'H2'],
    ]);
    expect(evaluateGrid(ctx, grid).wins).toHaveLength(0); // only 2 consecutive
  });

  it('wild substitutes for every paying symbol and counts for each', () => {
    const grid = gridOf([
      ['H1', 'W', 'H1', 'L4', 'L1'],
      ['H3', 'L3', 'H3', 'L1', 'L2'],
      ['L3', 'L4', 'L1', 'L2', 'L3'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    const syms = ev.wins.map((w) => w.symbol).sort();
    expect(syms).toEqual(['H1', 'H3']);
    for (const w of ev.wins) {
      expect(w.ways).toBe(1);
      expect(w.positions).toContainEqual([1, 0]); // the wild participates
    }
  });

  it('pays a full-screen 5-of-a-kind with 243 ways', () => {
    const grid = gridOf([
      ['H1', 'H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1', 'H1'],
      ['H1', 'H1', 'H1', 'H1', 'H1'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins).toHaveLength(1);
    expect(ev.wins[0]?.ways).toBe(243);
    expect(ev.wins[0]?.length).toBe(5);
    expect(ev.lineWinCoins).toBe(243 * pay.H1[2]);
  });

  it('counts scatters anywhere and pays the scatter table', () => {
    const grid = gridOf([
      ['S', 'L1', 'L3', 'L4', 'L1'],
      ['L2', 'L4', 'S', 'L1', 'L2'],
      ['L3', 'L4', 'L1', 'L2', 'S'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins).toHaveLength(0);
    expect(ev.scatter.count).toBe(3);
    expect(ev.scatter.positions).toEqual([[0, 0], [2, 1], [4, 2]]);
    expect(ev.scatter.pay).toBe(GAME_CONFIG.scatterPays[0]);
    expect(ev.lineWinCoins).toBe(GAME_CONFIG.scatterPays[0]);
    expect(spinsForScatters(ctx, 3)).toBe(GAME_CONFIG.freeSpins.awards[3]);
    expect(spinsForScatters(ctx, 5)).toBe(GAME_CONFIG.freeSpins.awards[5]);
    expect(spinsForScatters(ctx, 2)).toBe(0);
  });

  it('wild does not substitute for scatter', () => {
    const grid = gridOf([
      ['S', 'W', 'S', 'L4', 'L1'],
      ['L2', 'L3', 'L1', 'L1', 'L2'],
      ['L3', 'L4', 'L1', 'L2', 'L3'],
    ]);
    expect(evaluateGrid(ctx, grid).scatter.count).toBe(2);
  });

  it('sums several simultaneous symbol wins', () => {
    const grid = gridOf([
      ['L1', 'L1', 'L1', 'L4', 'L1'],
      ['L2', 'L2', 'L2', 'L2', 'L2'],
      ['L3', 'L4', 'L1', 'L2', 'L3'],
    ]);
    const ev = evaluateGrid(ctx, grid);
    expect(ev.wins.map((w) => `${w.symbol}x${w.length}x${w.ways}`).sort()).toEqual(['L1x3x2', 'L2x5x2']);
    expect(ev.lineWinCoins).toBe(2 * pay.L1[0] + 2 * pay.L2[2]);
  });
});
