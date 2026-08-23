/**
 * src/math must stay pure: no rendering, tweening, audio, DOM or app imports.
 * (ESLint enforces this too; this test keeps the guarantee even when lint is skipped.)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MATH_DIR = join(process.cwd(), 'src', 'math');
const FORBIDDEN = [
  /from\s+['"]pixi\.js/,
  /from\s+['"]gsap/,
  /from\s+['"]howler/,
  /from\s+['"]@\/(game|ui|audio|state|presentation|assets)/,
  /\bwindow\s*[.[]/,
  /\bdocument\s*[.[]/,
  /\bnavigator\s*[.[]/,
  /\blocalStorage\b/,
  /Math\.random\(/,
  /Date\.now\(/,
  /performance\.now\(/,
];

describe('math module purity', () => {
  const files = readdirSync(MATH_DIR).filter((f) => f.endsWith('.ts'));
  it('has source files', () => expect(files.length).toBeGreaterThan(5));
  it.each(files)('%s has no forbidden imports or globals', (f) => {
    const src = readFileSync(join(MATH_DIR, f), 'utf8');
    for (const re of FORBIDDEN) expect(src).not.toMatch(re);
  });
});
