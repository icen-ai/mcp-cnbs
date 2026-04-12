import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
  minify: true,
  shims: true,
  banner: {
    js: `import { createRequire as _cr } from 'module'; const require = _cr(import.meta.url);`,
  },
});
