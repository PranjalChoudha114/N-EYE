import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Enforce explicit return types on exported functions
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      // No unused vars (error)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // No any
      '@typescript-eslint/no-explicit-any': 'error',
      // Prefer const
      'prefer-const': 'error',
      // No console in production code (warn to allow during dev)
      'no-console': 'warn',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '*.config.*', 'apps/test-portal/**'],
  },
);
