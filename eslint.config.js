// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
    },
  },
  {
    // The maths module is pure: no DOM, no rendering, no audio, no tweening.
    files: ['src/math/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'pixi.js/*'], message: 'src/math must stay renderer-free.' },
            { group: ['gsap', 'gsap/*'], message: 'src/math must stay tween-free.' },
            { group: ['howler'], message: 'src/math must stay audio-free.' },
            { group: ['@/game/*', '@/ui/*', '@/audio/*', '@/state/*', '@/presentation/*', '@/assets/*'], message: 'src/math must not import app code.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
);
