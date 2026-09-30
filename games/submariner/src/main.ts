import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const game = new Game(canvas);
const splash = document.getElementById('splash');

// Compile every shader and upload every buffer/texture once behind the splash, so neither the
// first frame nor the first implosion / cash out / creature sighting stalls on the GPU.
void game.warmup().finally(() => {
  game.start();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    splash?.classList.add('gone');
    window.setTimeout(() => {
      splash?.remove();
      game.markReady();
    }, 600);
  }));
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
