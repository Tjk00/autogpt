import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const libraryRoot = join(tmpdir(), 'omni-browser-libs');
if (
  process.platform === 'linux' &&
  !existsSync(join(libraryRoot, 'lib/libnspr4.so'))
) {
  mkdirSync(libraryRoot, { recursive: true });
  const archive = join(libraryRoot, 'libraries.tar');
  writeFileSync(
    archive,
    brotliDecompressSync(
      readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'),
    ),
  );
  execFileSync('tar', ['xf', archive, '-C', libraryRoot]);
}
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: process.env.OMNI_TEST_URL || 'http://localhost:8787',
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    launchOptions:
      process.platform === 'linux'
        ? {
            executablePath: await chromium.executablePath(),
            args: [
              '--no-sandbox',
              '--disable-dev-shm-usage',
              '--use-gl=angle',
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
            ],
            env: {
              ...process.env,
              LD_LIBRARY_PATH:
                process.env.OMNI_BROWSER_LIBS || join(libraryRoot, 'lib'),
            },
          }
        : undefined,
  },
});
