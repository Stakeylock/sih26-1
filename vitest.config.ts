import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts','tests/**/*.test.tsx','src/__tests__/**/*.test.tsx'],testTimeout:15000,environment:'node'}});
