import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { loadOneStackConfig } from './config.js';
import { clientBoundary } from './security.js';

export function execute(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw new Error(`${command} is required: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
function xml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
export async function generateMobile(root: string, platform: 'android' | 'ios') {
  const config = loadOneStackConfig(root) ?? {}, mobile = config.mobile ?? {};
  const identifier = (platform === 'android' ? mobile.android?.packageName : mobile.ios?.bundleIdentifier) ?? config.app?.identifier ?? 'dev.onestack.example';
  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(identifier)) throw new Error('Invalid mobile application identifier');
  const entry = resolve(root, 'src/mobile.tsx'); if (!existsSync(entry)) throw new Error('Mobile entry src/mobile.tsx is required');
  const output = resolve(root, '.onestack/mobile', platform);
  const templates = resolve(dirname(fileURLToPath(import.meta.url)), '../../mobile/native', platform);
  mkdirSync(output, { recursive: true }); cpSync(templates, output, { recursive: true });
  const assets = platform === 'android' ? resolve(output, 'app/src/main/assets') : output;
  mkdirSync(assets, { recursive: true });
  const manifest = { identifier, name: config.app?.name ?? 'OneStack', version: config.app?.version ?? '0.4.0', permissions: mobile.permissions ?? {}, allowWebViewFallback: mobile.allowWebViewFallback ?? false };
  writeFileSync(resolve(assets, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await build({ entryPoints: [entry], outfile: resolve(assets, 'app.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic', jsxImportSource: '@onestack/core', plugins: [clientBoundary()] });
  if (platform === 'android') {
    const gradle = resolve(output, 'app/build.gradle.kts');
    writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('dev.onestack.example', identifier).replace('minSdk = 26', `minSdk = ${mobile.android?.minSdk ?? 26}`).replace('targetSdk = 35', `targetSdk = ${mobile.android?.targetSdk ?? 35}`).replace('versionName = "0.4.0"', `versionName = ${JSON.stringify(manifest.version)}`));
    const path = resolve(output, 'app/src/main/AndroidManifest.xml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('android:label="OneStack"', `android:label="${xml(manifest.name)}"`));
  } else {
    const path = resolve(output, 'project.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('dev.onestack.example', identifier));
  }
  return { output, manifest };
}
export async function runMobile(root: string, target: 'android' | 'ios', command: string, flags: Record<string, string | boolean>) {
  const { output, manifest } = await generateMobile(root, target);
  if (flags['generate-only'] === true) { console.log(output); return; }
  if (target === 'android') {
    execute('gradle', [command === 'release' ? ':app:bundleRelease' : ':app:assembleDebug', '--no-daemon'], output);
    if (command === 'dev' || command === 'run') {
      execute('adb', ['install', '-r', resolve(output, 'app/build/outputs/apk/debug/app-debug.apk')], root);
      execute('adb', ['shell', 'am', 'start', '-n', `${manifest.identifier}/dev.onestack.runtime.MainActivity`], root);
    }
    if (command === 'release') console.log('Unsigned AAB generated. Configure signing before store submission.');
  } else {
    if (process.platform !== 'darwin') throw new Error('iOS compilation requires macOS with full Xcode');
    execute('xcodegen', ['generate'], output);
    execute('xcodebuild', ['-project', 'OneStack.xcodeproj', '-scheme', 'OneStack', '-sdk', 'iphonesimulator', '-configuration', command === 'release' ? 'Release' : 'Debug', '-derivedDataPath', 'build', 'CODE_SIGNING_ALLOWED=NO', 'build'], output);
    if (command === 'dev' || command === 'run') {
      execute('xcrun', ['simctl', 'install', 'booted', resolve(output, 'build/Build/Products/Debug-iphonesimulator/OneStack.app')], root);
      execute('xcrun', ['simctl', 'launch', 'booted', manifest.identifier], root);
    }
    if (command === 'release') console.log('Unsigned simulator Release build generated; device archive/signing requires an Apple team.');
  }
}
