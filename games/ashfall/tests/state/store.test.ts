import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { GameStore, MemoryPersistence, STARTING_BALANCE_CENTS } from '@/state/GameStore';

describe('GameStore', () => {
  it('starts with defaults and persists them', () => {
    const p = new MemoryPersistence();
    const s = new GameStore(GAME_CONFIG, p);
    expect(s.get().balanceCents).toBe(STARTING_BALANCE_CENTS);
    expect(s.get().betIndex).toBe(GAME_CONFIG.defaultBetIndex);
    expect(s.get().turboMode).toBe('normal');
    expect(s.get().soundOn).toBe(true);
    expect(s.get().seed.length).toBeGreaterThan(0);
    expect(p.load()?.balanceCents).toBe(STARTING_BALANCE_CENTS);
  });

  it('restores balance, bet, turbo, sound and RNG position across reloads', () => {
    const p = new MemoryPersistence();
    const a = new GameStore(GAME_CONFIG, p);
    a.betUp();
    a.betUp();
    a.cycleTurbo();
    a.cycleTurbo();
    a.toggleSound();
    a.debit(12_345);
    a.nextNonce();
    a.nextNonce();
    const b = new GameStore(GAME_CONFIG, p);
    expect(b.get().betIndex).toBe(GAME_CONFIG.defaultBetIndex + 2);
    expect(b.get().turboMode).toBe('quick');
    expect(b.get().soundOn).toBe(false);
    expect(b.get().balanceCents).toBe(STARTING_BALANCE_CENTS - 12_345);
    expect(b.get().seed).toBe(a.get().seed);
    expect(b.get().nonce).toBe(2);
    // Session-only state is not persisted.
    expect(b.get().phase).toBe('booting');
    expect(b.get().lastWinCents).toBe(0);
  });

  it('ignores corrupt persisted values', () => {
    const p = new MemoryPersistence();
    p.save({ balanceCents: -5, betIndex: 99, turboMode: 'warp' as never, soundOn: true, seed: '', nonce: 1.5 });
    const s = new GameStore(GAME_CONFIG, p);
    expect(s.get().balanceCents).toBe(STARTING_BALANCE_CENTS);
    expect(s.get().betIndex).toBe(GAME_CONFIG.defaultBetIndex);
    expect(s.get().turboMode).toBe('normal');
    expect(s.get().seed.length).toBeGreaterThan(0);
    expect(s.get().nonce).toBe(0);
  });

  it('clamps bet changes and cycles turbo normal → turbo → quick → normal', () => {
    const s = new GameStore(GAME_CONFIG, new MemoryPersistence());
    for (let i = 0; i < 20; i++) s.betDown();
    expect(s.get().betIndex).toBe(0);
    for (let i = 0; i < 20; i++) s.betUp();
    expect(s.get().betIndex).toBe(GAME_CONFIG.betLevels.length - 1);
    expect(s.cycleTurbo()).toBe('turbo');
    expect(s.cycleTurbo()).toBe('quick');
    expect(s.cycleTurbo()).toBe('normal');
  });

  it('debit refuses to overdraw; credit ignores non-positive amounts', () => {
    const s = new GameStore(GAME_CONFIG, new MemoryPersistence());
    expect(s.debit(STARTING_BALANCE_CENTS + 1)).toBe(false);
    expect(s.get().balanceCents).toBe(STARTING_BALANCE_CENTS);
    expect(s.debit(STARTING_BALANCE_CENTS)).toBe(true);
    expect(s.get().balanceCents).toBe(0);
    s.credit(0);
    s.credit(-10);
    expect(s.get().balanceCents).toBe(0);
    s.credit(250);
    expect(s.get().balanceCents).toBe(250);
  });

  it('hands out nonces exactly once each and notifies subscribers', () => {
    const s = new GameStore(GAME_CONFIG, new MemoryPersistence());
    const seen: number[] = [];
    const off = s.subscribe((st, prev) => {
      if (st.nonce !== prev.nonce) seen.push(st.nonce);
    });
    expect(s.nextNonce().nonce).toBe(0);
    expect(s.nextNonce().nonce).toBe(1);
    expect(s.nextNonce().nonce).toBe(2);
    expect(seen).toEqual([1, 2, 3]);
    off();
    s.nextNonce();
    expect(seen).toEqual([1, 2, 3]);
  });
});
