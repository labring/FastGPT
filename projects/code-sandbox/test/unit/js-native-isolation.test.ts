import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import {
  JS_SANDBOX_GID,
  JS_SANDBOX_UID,
  shouldEnableJsNativeIsolation
} from '../../src/isolated/js-isolation-config';

const nativeAddonPath = join(process.cwd(), 'dist', 'fastgpt_js_sandbox.node');
const shouldRunNativeIsolation =
  shouldEnableJsNativeIsolation() && process.getuid?.() === 0 && existsSync(nativeAddonPath);

/**
 * 绕过 worker 的 JavaScript API guard，直接在原生隔离初始化后尝试危险能力。
 *
 * 测试使用真实 Node 子进程、chroot、UID/GID 和 seccomp，不 mock 内核结果。模块在
 * 进入 seccomp 前预加载，确保失败来自内核边界而非 safeRequire 白名单。
 */
describe.skipIf(!shouldRunNativeIsolation)('JS native seccomp/chroot isolation', () => {
  it('降权并从内核层阻断 socket、子进程和 chroot 外文件', () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'fastgpt-js-native-sandbox-'));
    const probe = `
const fs = require('fs');
const net = require('net');
const childProcess = require('child_process');
const addon = require(${JSON.stringify(nativeAddonPath)});

addon.init({ uid: ${JS_SANDBOX_UID}, gid: ${JS_SANDBOX_GID}, cwd: '/' });

const result = {
  uid: process.getuid(),
  gid: process.getgid(),
  passwdVisible: fs.existsSync('/etc/passwd'),
  writeError: null,
  socketError: null,
  spawnError: null
};

try {
  fs.writeFileSync('/escape.txt', 'blocked');
} catch (err) {
  result.writeError = err.code || err.message;
}

try {
  const socket = new net.Socket();
  socket.on('error', (err) => {
    result.socketError = err.code || err.message;
    finish();
  });
  socket.connect(80, '1.1.1.1');
} catch (err) {
  result.socketError = err.code || err.message;
}

try {
  const spawned = childProcess.spawnSync('/bin/sh', ['-c', 'id']);
  result.spawnError = spawned.error?.code || spawned.error?.message ||
    (spawned.status === 0 ? null : 'blocked');
} catch (err) {
  result.spawnError = err.code || err.message;
}

setTimeout(finish, 50);
function finish() {
  if (result.done) return;
  result.done = true;
  console.log(JSON.stringify(result));
}
`;

    const result = spawnSync(process.execPath, ['-e', probe], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      timeout: 5000
    });
    rmSync(sandboxRoot, { recursive: true, force: true });

    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.uid).toBe(JS_SANDBOX_UID);
    expect(payload.gid).toBe(JS_SANDBOX_GID);
    expect(payload.passwdVisible).toBe(false);
    expect(payload.writeError).toMatch(/EPERM|EACCES/);
    expect(payload.socketError).toMatch(/EPERM|EACCES/);
    expect(payload.spawnError).toMatch(/EPERM|EACCES|ENOENT/);
    expect(result.stdout + result.stderr).not.toMatch(/uid=\d+/);
  });
});
