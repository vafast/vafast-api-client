import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: true,
    sourcemap: true,
    outExtension: () => ({ js: '.mjs' }),
  },
  {
    entry: ['src/index.ts'],
    outDir: 'dist/cjs',
    format: ['cjs'],
    target: 'node18',
    dts: false,
    clean: false,
  },
])

