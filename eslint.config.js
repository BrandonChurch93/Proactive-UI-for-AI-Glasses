import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'reference/**', '**/node_modules/**', 'apps/web/public/**', 'packages/evals/report/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/brain/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The brain is deterministic.' },
        { object: 'Date', property: 'now', message: 'The brain takes t from the snapshot.' },
      ],
      'no-restricted-globals': ['error', 'performance', 'fetch', 'window', 'document'],
    },
  },
);
