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
  for (const value of [mobile.android?.minSdk, mobile.android?.targetSdk]) if (value !== undefined && (!Number.isInteger(value) || value < 26 || value > 35)) throw new Error('Android SDK must be an integer between 26 and 35');
  if (mobile.ios?.deploymentTarget && !/^\d+\.\d+$/.test(mobile.ios.deploymentTarget)) throw new Error('Invalid iOS deployment target');
  if (mobile.deepLinks?.some(scheme => !/^[a-z][a-z0-9+.-]*$/.test(scheme))) throw new Error('deepLinks accepts URL schemes, for example onestack');
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
    let androidManifest = readFileSync(path, 'utf8').replace('android:label="OneStack"', `android:label="${xml(manifest.name)}"`);
    if (mobile.orientation && mobile.orientation !== 'any') androidManifest = androidManifest.replace('android:exported="true"', `android:exported="true" android:screenOrientation="${mobile.orientation}"`);
    const links = (mobile.deepLinks ?? []).map(scheme => `<intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="${scheme}"/></intent-filter>`).join('');
    androidManifest = androidManifest.replace('</activity>', links + '</activity>');
    writeFileSync(path, androidManifest);
  } else {
    const path = resolve(output, 'project.yml');
    const orientations = mobile.orientation === 'landscape' ? ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'] : mobile.orientation === 'portrait' ? ['UIInterfaceOrientationPortrait'] : ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
    const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleDisplayName</key><string>${xml(manifest.name)}</string><key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string><key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>${xml(manifest.version)}</string><key>UILaunchScreen</key><dict/><key>UISupportedInterfaceOrientations</key><array>${orientations.map(o => `<string>${o}</string>`).join('')}</array><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array>${(mobile.deepLinks ?? []).map(s => `<string>${s}</string>`).join('')}</array></dict></array></dict></plist>`;
    writeFileSync(resolve(output, 'Info.plist'), plist);
    writeFileSync(path, readFileSync(path, 'utf8').replace('dev.onestack.example', identifier).replace("iOS: '15.0'", `iOS: '${mobile.ios?.deploymentTarget ?? '15.0'}'`).replace('GENERATE_INFOPLIST_FILE: YES', 'INFOPLIST_FILE: Info.plist'));
  }
  return { output, manifest };
}
export async function runMobile(root: string, target: 'android' | 'ios', command: string, flags: Record<string, string | boolean>) {
  if (command === 'release' && flags.unsigned !== true) {
    const required = target === 'android' ? ['ONESTACK_ANDROID_KEYSTORE', 'ONESTACK_ANDROID_STORE_PASSWORD', 'ONESTACK_ANDROID_KEY_ALIAS', 'ONESTACK_ANDROID_KEY_PASSWORD'] : ['ONESTACK_IOS_TEAM'];
    if (required.some(name => !process.env[name])) throw new Error(`Release signing requires ${required.join(', ')}. Use --unsigned only for an unsigned artifact.`);
  }
  const { output, manifest } = await generateMobile(root, target);
  if (flags['generate-only'] === true) { console.log(output); return; }
  if (target === 'android') {
    execute('gradle', [command === 'release' ? ':app:bundleRelease' : ':app:assembleDebug', '--no-daemon'], output);
    if (command === 'dev' || command === 'run') {
      execute('adb', ['install', '-r', resolve(output, 'app/build/outputs/apk/debug/app-debug.apk')], root);
      execute('adb', ['shell', 'am', 'start', '-n', `${manifest.identifier}/dev.onestack.runtime.MainActivity`], root);
    }
    if (command === 'release') console.log(flags.unsigned === true ? 'Unsigned AAB generated; sign before store submission.' : 'Signed Android AAB generated.');
  } else {
    if (process.platform !== 'darwin') throw new Error('iOS compilation requires macOS with full Xcode');
    execute('xcodegen', ['generate'], output);
    if (command === 'release') execute('xcodebuild', ['-project', 'OneStack.xcodeproj', '-scheme', 'OneStack', '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-configuration', 'Release', '-archivePath', 'OneStack.xcarchive', ...(flags.unsigned === true ? ['CODE_SIGNING_ALLOWED=NO'] : [`DEVELOPMENT_TEAM=${process.env.ONESTACK_IOS_TEAM}`, 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_STYLE=Automatic']), 'archive'], output);
    else execute('xcodebuild', ['-project', 'OneStack.xcodeproj', '-scheme', 'OneStack', '-sdk', 'iphonesimulator', '-configuration', 'Debug', '-derivedDataPath', 'build', 'CODE_SIGNING_ALLOWED=NO', 'build'], output);
    if (command === 'dev' || command === 'run') {
      execute('xcrun', ['simctl', 'install', 'booted', resolve(output, 'build/Build/Products/Debug-iphonesimulator/OneStack.app')], root);
      execute('xcrun', ['simctl', 'launch', 'booted', manifest.identifier], root);
    }
    if (command === 'release') console.log('iOS device archive generated at OneStack.xcarchive. Export it through Xcode with your provisioning profile.');
  }
}
