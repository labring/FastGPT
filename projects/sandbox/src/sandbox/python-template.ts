/**
 * Python 执行脚本模板生成器
 *
 * 生成一个完整的 Python 脚本，包含：
 * - resource 资源限制（CPU/内存/磁盘）
 * - SystemHelper 内置函数
 * - 临时文件系统（路径遍历防护 + 磁盘配额）
 * - __import__ 拦截（模块黑名单）
 * - 日志收集
 * - 用户代码执行
 */
export function generatePythonScript(
  userCode: string,
  dangerousModules: string[],
  limits: { timeoutMs: number; memoryMB: number; diskMB: number },
  tempDir: string
): string {
  const cpuSeconds = Math.max(1, Math.ceil(limits.timeoutMs / 1000));

  return `# -*- coding: utf-8 -*-
import json
import sys

# ===== 资源限制 =====
try:
    import resource as _resource
    # 内存限制
    _memory_limit = ${limits.memoryMB} * 1024 * 1024
    try:
        _resource.setrlimit(_resource.RLIMIT_AS, (_memory_limit, _memory_limit))
    except (ValueError, _resource.error):
        pass
    # CPU 时间限制
    try:
        _resource.setrlimit(_resource.RLIMIT_CPU, (${cpuSeconds}, ${cpuSeconds}))
    except (ValueError, _resource.error):
        pass
    # 文件大小限制
    _disk_limit = ${limits.diskMB} * 1024 * 1024
    try:
        _resource.setrlimit(_resource.RLIMIT_FSIZE, (_disk_limit, _disk_limit))
    except (ValueError, _resource.error):
        pass
except ImportError:
    pass  # 非 Linux 平台跳过

# ===== SystemHelper =====
import os as _os
import hashlib as _hashlib
import hmac as _hmac
import base64 as _base64
import urllib.parse as _urllib_parse
import time as _time
import math as _math
import inspect as _inspect_mod  # 在拦截 __import__ 之前导入

_SANDBOX_TMPDIR = ${JSON.stringify(tempDir)}

class _SandboxFs:
    def __init__(self, tmpdir, disk_limit):
        self._tmpdir = tmpdir
        self._disk_limit = disk_limit
        self._disk_used = 0

    def _safe_path(self, path):
        resolved = _os.path.normpath(_os.path.join(self._tmpdir, path))
        if not resolved.startswith(self._tmpdir):
            raise PermissionError("Path traversal not allowed")
        return resolved

    def write_file(self, path, content):
        safe = self._safe_path(path)
        data = content.encode('utf-8') if isinstance(content, str) else content
        if self._disk_used + len(data) > self._disk_limit:
            raise IOError("Disk quota exceeded: ${limits.diskMB}MB limit")
        parent = _os.path.dirname(safe)
        if not _os.path.exists(parent):
            _os.makedirs(parent, exist_ok=True)
        mode = 'wb' if isinstance(content, bytes) else 'w'
        with open(safe, mode) as f:
            f.write(content)
        self._disk_used += len(data)

    def read_file(self, path):
        with open(self._safe_path(path), 'r') as f:
            return f.read()

    def readdir(self, path='.'):
        return _os.listdir(self._safe_path(path))

    def mkdir(self, path):
        _os.makedirs(self._safe_path(path), exist_ok=True)

    def exists(self, path):
        return _os.path.exists(self._safe_path(path))

    @property
    def tmp_dir(self):
        return self._tmpdir


class _SystemHelper:
    def __init__(self):
        self.fs = _SandboxFs(_SANDBOX_TMPDIR, ${limits.diskMB} * 1024 * 1024)

    def count_token(self, text):
        if not isinstance(text, str):
            text = str(text)
        return _math.ceil(len(text) / 4)

    def str_to_base64(self, text, prefix=''):
        b64 = _base64.b64encode(text.encode('utf-8')).decode('utf-8')
        return prefix + b64

    def create_hmac(self, algorithm, secret):
        timestamp = str(int(_time.time() * 1000))
        string_to_sign = timestamp + '\\n' + secret
        h = _hmac.new(
            secret.encode('utf-8'),
            string_to_sign.encode('utf-8'),
            algorithm
        )
        sign = _urllib_parse.quote(_base64.b64encode(h.digest()).decode('utf-8'))
        return {"timestamp": timestamp, "sign": sign}

    def delay(self, ms):
        if ms > 10000:
            raise ValueError("Delay must be <= 10000ms")
        _time.sleep(ms / 1000)


system_helper = _SystemHelper()
SystemHelper = system_helper

# 向后兼容全局函数
count_token = system_helper.count_token
str_to_base64 = system_helper.str_to_base64
create_hmac = system_helper.create_hmac
delay = system_helper.delay

# ===== 模块安全：__import__ 拦截 =====
import builtins as _builtins
_original_import = _builtins.__import__
_BLOCKED_MODULES = set(${JSON.stringify(dangerousModules)})

def _safe_import(name, *args, **kwargs):
    top_level = name.split('.')[0]
    if top_level in _BLOCKED_MODULES:
        raise ImportError(f"Importing {name} is not allowed.")
    return _original_import(name, *args, **kwargs)

_builtins.__import__ = _safe_import

# ===== 日志收集 =====
_logs = []
_orig_print = print
def print(*args, **kwargs):
    _logs.append(' '.join(str(a) for a in args))

# ===== 读取输入 =====
_input = json.loads(sys.stdin.read())
variables = _input['variables']

# ===== 用户代码 =====
${userCode}

# ===== 执行 =====
try:
    _sig = _inspect_mod.signature(main)
    _params = list(_sig.parameters.keys())

    if len(_params) == 0:
        _result = main()
    elif len(_params) == 1:
        _result = main(variables)
    else:
        _args = []
        for _p in _params:
            if _p in variables:
                _args.append(variables[_p])
            elif _sig.parameters[_p].default is not _inspect_mod.Parameter.empty:
                break
            else:
                raise TypeError(f"Missing required argument: '{_p}'")
        _result = main(*_args)

    json.dump(_result, sys.stdout, ensure_ascii=False, default=str)
    sys.stderr.write('\\n'.join(_logs))
except Exception as _e:
    json.dump({"error": str(_e)}, sys.stdout, ensure_ascii=False)
`;
}
