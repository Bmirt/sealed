import { GAME_CONFIG } from '@config/game.config';
import type { WayWin } from '@math/types';
import type { PresenterDeps } from '@/game/AnimatedPresenter';
import type { SpinnableReel } from '@/game/anim/reelSpin';
import type { TierSurface, WinShowSurface } from '@/game/anim/winShow';

export class FakeDepsReel implements SpinnableReel {
  readonly stripLength: number;
  pos = 0;
  blur = false;
  constructor(len: number) {
    this.stripLength = len;
  }
  getPos(): number {
    return this.pos;
  }
  setPos(pos: number, blur: boolean): void {
    this.pos = pos;
    this.blur = blur;
  }
}

/** Pixi-free presenter deps that record everything — shared by the flow/feature tests. */
export class FakeDeps implements PresenterDeps {
  readonly reelViews = GAME_CONFIG.strips.base.map((s) => new FakeDepsReel(s.length));
  counterValue = -1;
  counterVisible = false;
  dim = false;
  flares = false;
  tierVisible = false;
  tierCounterValue = -1;
  log: string[] = [];
  cycleShown: WayWin[] = [];

  reels(): SpinnableReel[] {
    return this.reelViews;
  }
  setStripSet(set: 'base' | 'free'): void {
    this.log.push(`strips:${set}`);
  }
  setBackground(v: 'base' | 'free'): void {
    this.log.push(`bg:${v}`);
  }
  showStops(): void {
    this.log.push('showStops');
  }
  celebrations: number[] = [];
  readonly winSurface: WinShowSurface & { prepare(wins: readonly WayWin[]): void } = {
    prepare: () => this.log.push('prepare'),
    setDim: (on) => {
      this.dim = on;
    },
    setFlares: (on) => {
      this.flares = on;
    },
    celebrate: (cents) => {
      this.celebrations.push(cents);
    },
    winningCells: [{ setPulse: () => undefined, setPop: () => undefined }],
    counter: {
      set: (c) => {
        this.counterValue = c;
      },
      show: () => {
        this.counterVisible = true;
      },
      hide: () => {
        this.counterVisible = false;
      },
    },
  };
  readonly tierSurface: TierSurface = {
    show: () => {
      this.tierVisible = true;
    },
    hide: () => {
      this.tierVisible = false;
    },
    counter: {
      set: (c) => {
        this.tierCounterValue = c;
      },
      show: () => undefined,
      hide: () => undefined,
    },
    shake: () => undefined,
    burst: () => undefined,
    setRollProgress: () => undefined,
  };
  antStarts = 0;
  readonly anticipation = {
    start: (): void => {
      this.antStarts++;
      this.log.push('ant:start');
    },
    end: (): void => {
      this.log.push('ant:end');
    },
    reset: (): void => undefined,
  };
  readonly cycle = {
    show: (w: WayWin): void => {
      this.cycleShown.push(w);
    },
    clear: (): void => undefined,
  };
  hudOn = false;
  meterCalls: [number, number, number][] = [];
  spinsLeftCalls: number[] = [];
  totalCalls: number[] = [];
  banners: [string, string][] = [];
  bannerVisible = false;
  readonly feature = {
    showHud: (on: boolean): void => {
      this.hudOn = on;
    },
    setMeter: (m: number, t: number, per: number): void => {
      this.meterCalls.push([m, t, per]);
    },
    pulseMeter: (): void => undefined,
    setSpinsLeft: (n: number): void => {
      this.spinsLeftCalls.push(n);
    },
    setTotal: (c: number): void => {
      this.totalCalls.push(c);
    },
    showBanner: (title: string, sub: string): void => {
      this.banners.push([title, sub]);
      this.bannerVisible = true;
    },
    hideBanner: (): void => {
      this.bannerVisible = false;
    },
  };
  cinematicEvents: string[] = [];
  readonly cinematic = {
    begin: (tier: 'free' | 'super'): void => {
      this.cinematicEvents.push(`begin:${tier}`);
    },
    update: (): void => undefined,
    end: (): void => {
      this.cinematicEvents.push('end');
    },
  };
  landPuff(): void {
    /* noop */
  }
  resetOverlay(): void {
    this.log.push('resetOverlay');
  }
}
