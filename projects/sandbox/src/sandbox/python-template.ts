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
import { BLOCKED_IP_RANGES, REQUEST_LIMITS } from './network-config';

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
import urllib.request as _urllib_request
import socket as _socket
import ipaddress as _ipaddress
import time as _time
import math as _math
import inspect as _inspect_mod  # 在拦截 __import__ 之前导入

_SANDBOX_TMPDIR = ${JSON.stringify(tempDir)}

# ===== 网络安全 =====
_BLOCKED_CIDRS = [
${BLOCKED_IP_RANGES.map((c) => `    _ipaddress.ip_network('${c}')`).join(',\n')}
]
_REQUEST_LIMITS = {
    'max_requests': ${REQUEST_LIMITS.maxRequests},
    'timeout': ${REQUEST_LIMITS.timeoutMs / 1000},
    'max_response_size': ${REQUEST_LIMITS.maxResponseSize},
    'allowed_protocols': ${JSON.stringify(REQUEST_LIMITS.allowedProtocols)}
}
_request_count = 0

def _is_blocked_ip(ip_str):
    try:
        addr = _ipaddress.ip_address(ip_str)
        for net in _BLOCKED_CIDRS:
            if addr in net:
                return True
    except ValueError:
        return True
    return False

class _SandboxFs:
    def __init__(self, tmpdir, disk_limit):
        self._tmpdir = tmpdir
        self._disk_limit = disk_limit
        self._disk_used = 0
        self._file_sizes = {}

    def _safe_path(self, path):
        resolved = _os.path.realpath(_os.path.join(self._tmpdir, path))
        if not resolved.startswith(self._tmpdir):
            raise PermissionError("Path traversal not allowed")
        return resolved

    def write_file(self, path, content):
        safe = self._safe_path(path)
        data = content.encode('utf-8') if isinstance(content, str) else content
        old_size = self._file_sizes.get(safe, 0)
        if self._disk_used - old_size + len(data) > self._disk_limit:
            raise IOError("Disk quota exceeded: ${limits.diskMB}MB limit")
        parent = _os.path.dirname(safe)
        if not _os.path.exists(parent):
            _os.makedirs(parent, exist_ok=True)
        mode = 'wb' if isinstance(content, bytes) else 'w'
        with open(safe, mode) as f:
            f.write(content)
        self._disk_used = self._disk_used - old_size + len(data)
        self._file_sizes[safe] = len(data)

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

    def http_request(self, url, method='GET', headers=None, body=None, timeout=None):
        """安全的 HTTP 请求
        Args:
            url: 请求地址
            method: HTTP 方法 (GET/POST/PUT/DELETE/PATCH)
            headers: 请求头字典
            body: 请求体 (str 或 dict，dict 会自动 JSON 序列化)
            timeout: 超时秒数
        Returns:
            dict: {status, headers, data}
        """
        global _request_count
        _request_count += 1
        if _request_count > _REQUEST_LIMITS['max_requests']:
            raise RuntimeError(f"Request limit exceeded: max {_REQUEST_LIMITS['max_requests']} requests per execution")

        parsed = _urllib_parse.urlparse(url)
        if parsed.scheme + ':' not in _REQUEST_LIMITS['allowed_protocols']:
            raise RuntimeError(f"Protocol {parsed.scheme}: is not allowed. Use http: or https:")

        # DNS 解析后校验 IP，并用 resolved IP 发起连接防止 DNS rebinding
        hostname = parsed.hostname
        resolved_ip = None
        try:
            infos = _socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
            for info in infos:
                ip = info[4][0]
                if _is_blocked_ip(ip):
                    raise RuntimeError("Request to private/internal network is not allowed")
            if infos:
                resolved_ip = infos[0][4][0]
        except _socket.gaierror as e:
            raise RuntimeError(f"DNS resolution failed: {e}")

        if timeout is None:
            timeout = _REQUEST_LIMITS['timeout']
        else:
            timeout = min(timeout, _REQUEST_LIMITS['timeout'])

        if headers is None:
            headers = {}

        data = None
        if body is not None:
            if isinstance(body, dict):
                data = json.dumps(body).encode('utf-8')
                if 'Content-Type' not in headers and 'content-type' not in headers:
                    headers['Content-Type'] = 'application/json'
            elif isinstance(body, str):
                data = body.encode('utf-8')
            else:
                data = body

        # 对 HTTP 使用 resolved IP 防止 DNS rebinding；HTTPS 保留原始 URL（证书校验需要 hostname）
        if resolved_ip and parsed.scheme == 'http':
            _port = parsed.port
            if _port:
                resolved_url = f"http://{resolved_ip}:{_port}{parsed.path}"
            else:
                resolved_url = f"http://{resolved_ip}{parsed.path}"
            if parsed.query:
                resolved_url += f"?{parsed.query}"
            if 'Host' not in headers and 'host' not in headers:
                headers['Host'] = hostname + (f":{_port}" if _port else "")
        else:
            resolved_url = url

        req = _urllib_request.Request(resolved_url, data=data, headers=headers, method=method.upper())
        try:
            resp = _urllib_request.urlopen(req, timeout=timeout)
            resp_data = resp.read(_REQUEST_LIMITS['max_response_size'] + 1)
            if len(resp_data) > _REQUEST_LIMITS['max_response_size']:
                raise RuntimeError(f"Response too large: max {_REQUEST_LIMITS['max_response_size'] // 1024 // 1024}MB")
            resp_headers = dict(resp.headers)
            return {
                'status': resp.status,
                'headers': resp_headers,
                'data': resp_data.decode('utf-8', errors='replace')
            }
        except _urllib_request.URLError as e:
            raise RuntimeError(f"HTTP request failed: {e}")


system_helper = _SystemHelper()
SystemHelper = system_helper

# 向后兼容全局函数
count_token = system_helper.count_token
str_to_base64 = system_helper.str_to_base64
create_hmac = system_helper.create_hmac
delay = system_helper.delay
http_request = system_helper.http_request

# ===== builtins.open 拦截 =====
import builtins as _builtins
_original_open = _builtins.open
def _make_safe_open(_orig, _tmpdir):
    def _safe_open(file, mode='r', *args, **kwargs):
        if isinstance(file, str):
            _abs = _os.path.realpath(_os.path.join(_tmpdir, file) if not _os.path.isabs(file) else file)
            if not _abs.startswith(_tmpdir):
                raise PermissionError(f'File access restricted to sandbox: {file}')
        return _orig(file, mode, *args, **kwargs)
    return _safe_open
_builtins.open = _make_safe_open(_original_open, _SANDBOX_TMPDIR)
del _original_open
del _make_safe_open

# ===== 模块安全：__import__ 拦截 =====
_original_import = _builtins.__import__
_BLOCKED_MODULES = set(${JSON.stringify(dangerousModules)})

def _make_safe_import(_orig, _blocked, _script_path):
    """通过闭包封装原始 import，防止用户代码访问 _original_import
    白名单模式：只有来自标准库路径的间接导入才放行，其他一律拦截"""
    import traceback as _tb
    import sysconfig as _sysconfig
    _stdlib_paths = []
    for _key in ('stdlib', 'platstdlib', 'purelib', 'platlib'):
        _p = _sysconfig.get_path(_key)
        if _p:
            _stdlib_paths.append(_p)
    # 也包含 frozen modules 和 C 扩展
    _stdlib_paths.append('<frozen')

    def _is_stdlib_frame(filename):
        """判断调用帧是否来自标准库/C扩展"""
        if not filename:
            return False
        # frozen modules (如 <frozen importlib._bootstrap>)
        if filename.startswith('<frozen'):
            return True
        # 标准库路径
        for sp in _stdlib_paths:
            if filename.startswith(sp):
                return True
        return False

    def _safe_import(name, *args, **kwargs):
        top_level = name.split('.')[0]
        if top_level in _blocked:
            stack = _tb.extract_stack()
            # stack[-1] = _safe_import, stack[-2] = 发起 import 的代码
            # 只有当调用者来自标准库时才放行（间接导入）
            # 用户脚本、exec("<string>")、eval("<string>") 等一律拦截
            caller_is_stdlib = False
            if len(stack) >= 2:
                caller_file = stack[-2].filename
                caller_is_stdlib = _is_stdlib_frame(caller_file)
            if not caller_is_stdlib:
                raise ImportError(f"Importing {name} is not allowed.")
        return _orig(name, *args, **kwargs)
    return _safe_import

_builtins.__import__ = _make_safe_import(_original_import, _BLOCKED_MODULES, __file__)

# 清理内部引用，防止用户代码恢复原始 import
del _original_import
del _make_safe_import
del _BLOCKED_MODULES

# ===== 日志收集 =====
_logs = []
_orig_print = print
def print(*args, **kwargs):
    _logs.append(' '.join(str(a) for a in args))

# ===== 读取输入 =====
_input = json.loads(sys.stdin.read())
variables = _input['variables']

# 向后兼容：将变量展开为全局变量（旧版行为）
for _k, _v in variables.items():
    globals()[_k] = _v
try:
    del _k, _v
except NameError:
    pass

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

    sys.stdout.write('__SANDBOX_RESULT__:' + json.dumps(_result, ensure_ascii=False, default=str))
    sys.stderr.write('\\n'.join(_logs))
except Exception as _e:
    sys.stdout.write('__SANDBOX_RESULT__:' + json.dumps({"error": str(_e)}, ensure_ascii=False))
finally:
    # 清理 __import__ hook，确保不泄露到后续代码
    try:
        _builtins.__import__ = __builtins__.__import__ if hasattr(__builtins__, '__import__') else _builtins.__import__
    except Exception:
        pass
`;
}
