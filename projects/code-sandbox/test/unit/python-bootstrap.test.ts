import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const bootstrapPath = join(process.cwd(), 'src/isolated/python-bootstrap.py');

describe('python bootstrap native isolation fallback', () => {
  it('seccomp load failure falls back to chroot and uid/gid drop', () => {
    const script = `
import importlib.util
import json

spec = importlib.util.spec_from_file_location('fastgpt_bootstrap', ${JSON.stringify(bootstrapPath)})
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

calls = []

class FakeStderr:
    def __init__(self):
        self.lines = []

    def write(self, text):
        self.lines.append(text)

    def flush(self):
        return None


class FakeLib:
    def __init__(self):
        self.err = bootstrap._ctypes.create_string_buffer(b'load seccomp filter: operation canceled')

        def FastGPTInitPythonSandbox(uid, gid, enable_network):
            calls.append(['init', uid, gid, enable_network])
            return 2

        def FastGPTLastError():
            calls.append(['last_error'])
            return bootstrap._ctypes.cast(self.err, bootstrap._ctypes.c_void_p)

        def FastGPTFreeCString(ptr):
            calls.append(['free'])

        self.FastGPTInitPythonSandbox = FastGPTInitPythonSandbox
        self.FastGPTLastError = FastGPTLastError
        self.FastGPTFreeCString = FastGPTFreeCString


stderr = FakeStderr()
bootstrap.sys.stderr = stderr
bootstrap._ctypes.CDLL = lambda path: FakeLib()
bootstrap._os.chdir = lambda path: calls.append(['chdir', path])
bootstrap._os.setgroups = lambda groups: calls.append(['setgroups', list(groups)])
bootstrap._os.setgid = lambda gid: calls.append(['setgid', gid])
bootstrap._os.setuid = lambda uid: calls.append(['setuid', uid])

bootstrap._init_native_isolation({
    'enableSeccomp': True,
    'libraryPath': '/fake.so',
    'uid': 65537,
    'gid': 65537,
    'enableNetwork': False
})

print(json.dumps({
    'ready': bootstrap._native_isolation_ready,
    'calls': calls,
    'stderr': ''.join(stderr.lines)
}, ensure_ascii=False))
`;

    const result = spawnSync('python3', ['-u', '-c', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 5000
    });

    expect(result.status).toBe(0);
    const stdoutLines = result.stdout.trim().split(/\r?\n/);
    const payload = JSON.parse(stdoutLines[stdoutLines.length - 1]);
    expect(payload.ready).toBe(true);
    expect(stdoutLines.some((line) => line.includes('"type": "warn"'))).toBe(true);
    expect(payload.stderr).toContain('continuing without seccomp');
    expect(payload.calls).toContainEqual(['chdir', '/']);
    expect(payload.calls).toContainEqual(['init', 65537, 65537, 0]);
    expect(payload.calls).toContainEqual(['last_error']);
    expect(payload.calls).toContainEqual(['free']);
    expect(payload.calls).toContainEqual(['setgroups', []]);
    expect(payload.calls).toContainEqual(['setgid', 65537]);
    expect(payload.calls).toContainEqual(['setuid', 65537]);
  });
});
