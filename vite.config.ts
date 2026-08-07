import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 120,
    sortPackageJson: false,
    ignorePatterns: ['**/*.md', 'lifi/data/**', '**/dist/**', '**/node_modules/**', '.pnpm-store/**'],
  },
});
