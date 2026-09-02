import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const bootstrapPath = join(process.cwd(), 'src/isolated/python-bootstrap.py');

function runNativeIsolationProbe(options: { enableSeccomp: boolean; returnCode: number }) {
  const script = `
import importlib.util
import json

spec = importlib.util.spec_from_file_location('fastgpt_bootstrap', ${JSON.stringify(bootstrapPath)})
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

calls = []

class FakeLib:
    def __init__(self):
        self.err = bootstrap._ctypes.create_string_buffer(b'load seccomp filter: operation canceled')

        def FastGPTInitPythonSandbox(uid, gid, enable_network, enable_seccomp):
            calls.append(['init', uid, gid, enable_network, enable_seccomp])
            return ${options.returnCode}

        def FastGPTLastError():
            calls.append(['last_error'])
            return bootstrap._ctypes.cast(self.err, bootstrap._ctypes.c_void_p)

        def FastGPTFreeCString(ptr):
            calls.append(['free'])

        self.FastGPTInitPythonSandbox = FastGPTInitPythonSandbox
        self.FastGPTLastError = FastGPTLastError
        self.FastGPTFreeCString = FastGPTFreeCString


bootstrap._ctypes.CDLL = lambda path: FakeLib()
error = None
try:
    bootstrap._init_native_isolation({
        'enabled': True,
        'enableSeccomp': ${options.enableSeccomp ? 'True' : 'False'},
        'libraryPath': '/fake.so',
        'uid': 65537,
        'gid': 65537,
        'enableNetwork': False
    })
except Exception as exc:
    error = str(exc)

print(json.dumps({
    'ready': bootstrap._native_isolation_ready,
    'calls': calls,
    'error': error
}, ensure_ascii=False))
`;

  const result = spawnSync('python3', ['-u', '-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });

  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe('python bootstrap native isolation configuration', () => {
  it('显式禁用 seccomp 时仍调用 native 隔离初始化', () => {
    const payload = runNativeIsolationProbe({ enableSeccomp: false, returnCode: 0 });

    expect(payload.ready).toBe(true);
    expect(payload.error).toBeNull();
    expect(payload.calls).toEqual([['init', 65537, 65537, 0, 0]]);
  });

  it('seccomp 初始化失败时保持 fail-closed，不自动降级', () => {
    const payload = runNativeIsolationProbe({ enableSeccomp: true, returnCode: 1 });

    expect(payload.ready).toBe(false);
    expect(payload.error).toContain('load seccomp filter: operation canceled');
    expect(payload.calls).toEqual([['init', 65537, 65537, 0, 1], ['last_error'], ['free']]);
  });
});
