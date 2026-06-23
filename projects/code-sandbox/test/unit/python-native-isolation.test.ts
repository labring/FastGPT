import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import {
  PYTHON_SANDBOX_GID,
  PYTHON_SANDBOX_UID,
  shouldEnablePythonNativeIsolation
} from '../../src/isolated/python-isolation-config';

const nativeLibraryPath = join(process.cwd(), 'dist', 'fastgpt_python_sandbox.so');
const shouldRunNativeIsolation =
  shouldEnablePythonNativeIsolation() && existsSync(nativeLibraryPath);

/**
 * 直接验证 Go native 隔离库，而不是通过 PythonIsolatedRunner。
 *
 * Runner 的语言层会先拦截 os/subprocess/socket，这里用专用脚本在调用
 * FastGPTInitPythonSandbox 后直接尝试危险能力，确保 seccomp/chroot/setuid
 * 本身也能形成边界。
 */
describe.skipIf(!shouldRunNativeIsolation)('Python native seccomp/chroot isolation', () => {
  it('降权到 sandbox uid/gid，并阻断 os.system 的 execve 落地', () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'fastgpt-native-sandbox-'));
    const probeScript = join(tmpdir(), `fastgpt-native-probe-${Date.now()}.py`);

    writeFileSync(
      probeScript,
      `
import ctypes
import json
import os
import sys

lib = ctypes.CDLL(${JSON.stringify(nativeLibraryPath)})
lib.FastGPTInitPythonSandbox.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
lib.FastGPTInitPythonSandbox.restype = ctypes.c_int
ret = lib.FastGPTInitPythonSandbox(${PYTHON_SANDBOX_UID}, ${PYTHON_SANDBOX_GID}, 0)
if ret != 0:
    print(json.dumps({"init": ret}))
    sys.exit(1)

print(json.dumps({"uid": os.getuid(), "gid": os.getgid()}), flush=True)
rc = os.system("id")
print(json.dumps({"system_rc": rc}), flush=True)
`,
      'utf8'
    );

    const result = spawnSync('python3', ['-u', probeScript], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      timeout: 5000
    });

    expect(result.stdout).toContain(`"uid": ${PYTHON_SANDBOX_UID}`);
    expect(result.stdout).toContain(`"gid": ${PYTHON_SANDBOX_GID}`);
    expect(result.stdout).not.toContain('"system_rc": 0');
    expect(result.stdout + result.stderr).not.toMatch(/uid=\d+/);
  });
});
