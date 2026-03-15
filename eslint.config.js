import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      // Warn on console.log so diagnostic logs are visible in lint output
      // (they are intentional in this worker but should be reviewed)
      'no-console': 'warn',
      // Disallow any — enforce explicit types
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused vars are bugs in a Worker context
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Test files can use any/console freely
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'worker-configuration.d.ts'],
  }
)
