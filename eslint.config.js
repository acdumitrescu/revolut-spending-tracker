import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', '**/dist/**']),
  {
    // Browser code: the React app.
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Node code: API, scripts and tool configs must not rely on browser globals.
    files: ['backend/**/*.js', 'scripts/**/*.{js,mjs}', '*.config.js'],
    ignores: ['backend/node_modules/**'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    // Node globals (process, Buffer) are real globals here, not redeclarations.
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
]);
