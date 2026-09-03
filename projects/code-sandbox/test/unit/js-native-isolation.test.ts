import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  JS_SANDBOX_GID,
  JS_SANDBOX_UID,
  shouldEnableJsNativeIsolation
} from '../../src/isolated/js-isolation-config';

vi.unmock('../../src/isolated/js-isolation-config');

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
  it('降权并从内核层阻断 socket 和 chroot 外文件', () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'fastgpt-js-native-sandbox-'));
    const probe = `
const fs = require('fs');
const addon = require(${JSON.stringify(nativeAddonPath)});
const { UDP } = process.binding('udp_wrap');
const socket = new UDP();

addon.init({
  uid: ${JS_SANDBOX_UID},
  gid: ${JS_SANDBOX_GID},
  cwd: '/',
  enableSeccomp: true
});

const result = {
  uid: process.getuid(),
  gid: process.getgid(),
  passwdVisible: fs.existsSync('/etc/passwd'),
  writeError: null,
  socketResult: socket.bind('127.0.0.1', 0, 0)
};

try {
  fs.writeFileSync('/escape.txt', 'blocked');
} catch (err) {
  result.writeError = err.code || err.message;
}

fs.writeSync(1, JSON.stringify(result) + '\\n');
socket.close();
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
    expect(payload.socketResult).toBeLessThan(0);
  });

  it('显式禁用 seccomp 后仍保留 chroot 和降权', () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'fastgpt-js-native-no-seccomp-'));
    const probe = `
const fs = require('fs');
const addon = require(${JSON.stringify(nativeAddonPath)});
const { UDP } = process.binding('udp_wrap');
const socket = new UDP();

addon.init({
  uid: ${JS_SANDBOX_UID},
  gid: ${JS_SANDBOX_GID},
  cwd: '/',
  enableSeccomp: false
});

let writeError = null;
try {
  fs.writeFileSync('/escape.txt', 'blocked');
} catch (err) {
  writeError = err.code || err.message;
}
const socketResult = socket.bind('127.0.0.1', 0, 0);
fs.writeSync(1, JSON.stringify({
  uid: process.getuid(),
  gid: process.getgid(),
  passwdVisible: fs.existsSync('/etc/passwd'),
  writeError,
  socketResult
}) + '\\n');
socket.close();
`;

    const result = spawnSync(process.execPath, ['-e', probe], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      timeout: 5000
    });
    rmSync(sandboxRoot, { recursive: true, force: true });

    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload).toMatchObject({
      uid: JS_SANDBOX_UID,
      gid: JS_SANDBOX_GID,
      passwdVisible: false,
      socketResult: 0
    });
    expect(payload.writeError).toMatch(/EPERM|EACCES/);
  });
});
