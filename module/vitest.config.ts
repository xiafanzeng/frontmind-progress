import {defineConfig} from 'vitest/config';
export default defineConfig({esbuild:{jsx:'automatic'},test:{environment:'jsdom',include:['client/**/*.test.ts','client/**/*.test.tsx'],setupFiles:['./tests/ui-setup.ts']}});
