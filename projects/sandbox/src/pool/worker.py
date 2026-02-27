#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Python Worker 长驻进程 - 循环接收任务执行

协议：
  第 1 行 stdin: {"type":"init","allowedModules":["math","json",...]}
  后续每行 stdin: {"code":"...","variables":{},"timeoutMs":10000}
  每行 stdout:    {"success":true,"data":{...}} 或 {"success":false,"message":"..."}
"""
import json
import sys
import copy as _copy
import hashlib as _hashlib
import hmac as _hmac
import base64 as _base64
import urllib.parse as _urllib_parse
import urllib.request as _urllib_request
import socket as _socket
import ipaddress as _ipaddress
import time as _time
import math as _math
import inspect as _inspect_mod
import signal
import traceback as _tb
import sysconfig as _sysconfig
import builtins as _builtins
import types as _types
import encodings.idna as _encodings_idna  # 预加载，避免 codec lazy load 被沙盒拦截

# stdlib 模块名集合，用于 _safe_import 快速放行
_STDLIB_MODULES = sys.stdlib_module_names if hasattr(sys, 'stdlib_module_names') else frozenset()

# 危险的 stdlib 模块，即使是 stdlib 也不允许用户代码直接 import
_DANGEROUS_STDLIB = frozenset({
    'os', 'subprocess', 'shutil', 'pathlib', 'glob', 'tempfile',
    'multiprocessing', 'threading', 'concurrent',
    'ctypes', 'importlib', 'runpy', 'code', 'codeop', 'compileall',
    'socket', 'http', 'urllib', 'ftplib', 'smtplib', 'poplib', 'imaplib',
    'xmlrpc', 'socketserver', 'ssl', 'asyncio', 'selectors', 'select',
    'signal', 'resource', 'pty', 'termios', 'tty', 'fcntl',
    'mmap', 'dbm', 'sqlite3', 'shelve',
    'webbrowser', 'turtle', 'tkinter', 'idlelib',
    'venv', 'ensurepip', 'pip', 'site',
    'gc', 'sys', 'builtins', 'marshal', 'pickle',
})

# ===== 网络安全 =====
_BLOCKED_CIDRS = [
    _ipaddress.ip_network('10.0.0.0/8'),
    _ipaddress.ip_network('172.16.0.0/12'),
    _ipaddress.ip_network('192.168.0.0/16'),
    _ipaddress.ip_network('169.254.0.0/16'),
    _ipaddress.ip_network('127.0.0.0/8'),
    _ipaddress.ip_network('0.0.0.0/8'),
    _ipaddress.ip_network('::1/128'),
    _ipaddress.ip_network('fc00::/7'),
    _ipaddress.ip_network('fe80::/10'),
]

_REQUEST_LIMITS = {
    'max_requests': 30,
    'timeout': 60,
    'max_response_size': 10 * 1024 * 1024,
    'max_request_body_size': 5 * 1024 * 1024,
    'allowed_protocols': ['http:', 'https:']
}


def _init_request_limits(limits):
    """从 init 消息更新请求限制"""
    if not limits:
        return
    if 'maxRequests' in limits:
        _REQUEST_LIMITS['max_requests'] = limits['maxRequests']
    if 'timeoutMs' in limits:
        _REQUEST_LIMITS['timeout'] = max(1, limits['timeoutMs'] // 1000)
    if 'maxResponseSize' in limits:
        _REQUEST_LIMITS['max_response_size'] = limits['maxResponseSize']
    if 'maxRequestBodySize' in limits:
        _REQUEST_LIMITS['max_request_body_size'] = limits['maxRequestBodySize']


def _is_blocked_ip(ip_str):
    try:
        addr = _ipaddress.ip_address(ip_str)
        for net in _BLOCKED_CIDRS:
            if addr in net:
                return True
    except ValueError:
        return True
    return False


# ===== DNS-pinned HTTP opener（防止 DNS rebinding）=====
import http.client as _http_client

class _PinnedHTTPConnection(_http_client.HTTPConnection):
    """强制连接到预解析的 IP，防止 DNS rebinding TOCTOU"""
    def __init__(self, *args, pinned_ip=None, pinned_port=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._pinned_ip = pinned_ip
        self._pinned_port = pinned_port

    def connect(self):
        self.sock = _socket.create_connection(
            (self._pinned_ip or self.host, self._pinned_port or self.port),
            self.timeout
        )

class _PinnedHTTPSConnection(_http_client.HTTPSConnection):
    def __init__(self, *args, pinned_ip=None, pinned_port=None, original_hostname=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._pinned_ip = pinned_ip
        self._pinned_port = pinned_port
        self._original_hostname = original_hostname or self.host

    def connect(self):
        import ssl as _ssl
        self.sock = _socket.create_connection(
            (self._pinned_ip or self.host, self._pinned_port or self.port),
            self.timeout
        )
        ctx = _ssl.create_default_context()
        self.sock = ctx.wrap_socket(self.sock, server_hostname=self._original_hostname)

class _PinnedHTTPHandler(_urllib_request.HTTPHandler):
    def __init__(self, pinned_ip, pinned_port):
        super().__init__()
        self._pinned_ip = pinned_ip
        self._pinned_port = pinned_port

    def http_open(self, req):
        return self.do_open(
            lambda host, **kwargs: _PinnedHTTPConnection(
                host, pinned_ip=self._pinned_ip, pinned_port=self._pinned_port, **kwargs
            ),
            req
        )

class _PinnedHTTPSHandler(_urllib_request.HTTPSHandler):
    def __init__(self, pinned_ip, pinned_port, original_hostname):
        super().__init__()
        self._pinned_ip = pinned_ip
        self._pinned_port = pinned_port
        self._original_hostname = original_hostname

    def https_open(self, req):
        return self.do_open(
            lambda host, **kwargs: _PinnedHTTPSConnection(
                host, pinned_ip=self._pinned_ip, pinned_port=self._pinned_port,
                original_hostname=self._original_hostname, **kwargs
            ),
            req
        )

def _build_pinned_opener(resolved_ip, port, hostname):
    return _urllib_request.build_opener(
        _PinnedHTTPHandler(resolved_ip, port),
        _PinnedHTTPSHandler(resolved_ip, port, hostname)
    )


class _SystemHelper:
    """安全的系统辅助类 — 所有模块引用通过闭包捕获，外部无法访问"""
    __slots__ = ()

    @staticmethod
    def count_token(text):
        if not isinstance(text, str):
            text = str(text)
        return _math.ceil(len(text) / 4)

    @staticmethod
    def str_to_base64(text, prefix=''):
        b64 = _base64.b64encode(text.encode('utf-8')).decode('utf-8')
        return prefix + b64

    @staticmethod
    def create_hmac(algorithm, secret):
        timestamp = str(int(_time.time() * 1000))
        string_to_sign = timestamp + '\n' + secret
        h = _hmac.new(secret.encode('utf-8'), string_to_sign.encode('utf-8'), algorithm)
        sign = _urllib_parse.quote(_base64.b64encode(h.digest()).decode('utf-8'))
        return {"timestamp": timestamp, "sign": sign}

    @staticmethod
    def delay(ms):
        if ms > 10000:
            raise ValueError("Delay must be <= 10000ms")
        _time.sleep(ms / 1000)

    @staticmethod
    def http_request(url, method='GET', headers=None, body=None, timeout=None):
        global _request_count
        _request_count += 1
        if _request_count > _REQUEST_LIMITS['max_requests']:
            raise RuntimeError(f"Request limit exceeded: max {_REQUEST_LIMITS['max_requests']}")

        parsed = _urllib_parse.urlparse(url)
        if parsed.scheme + ':' not in _REQUEST_LIMITS['allowed_protocols']:
            raise RuntimeError(f"Protocol {parsed.scheme}: not allowed")

        hostname = parsed.hostname
        try:
            infos = _socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
            for info in infos:
                ip = info[4][0]
                if _is_blocked_ip(ip):
                    raise RuntimeError("Request to private/internal network not allowed")
            resolved_ip = infos[0][4][0] if infos else None
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

        if data is not None and len(data) > _REQUEST_LIMITS['max_request_body_size']:
            raise RuntimeError("Request body too large")

        # 使用自定义 handler 强制连接到预解析的 IP，防止 DNS rebinding
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        opener = _build_pinned_opener(resolved_ip, port, hostname)
        req = _urllib_request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            resp = opener.open(req, timeout=timeout)
            resp_data = resp.read(_REQUEST_LIMITS['max_response_size'] + 1)
            if len(resp_data) > _REQUEST_LIMITS['max_response_size']:
                raise RuntimeError("Response too large")
            return {
                'status': resp.status,
                'headers': dict(resp.headers),
                'data': resp_data.decode('utf-8', errors='replace')
            }
        except _urllib_request.URLError as e:
            raise RuntimeError(f"HTTP request failed: {e}")

    # 驼峰别名，与 JS 端 SystemHelper API 保持一致
    countToken = count_token
    strToBase64 = str_to_base64
    createHmac = create_hmac
    httpRequest = http_request


system_helper = _SystemHelper()
SystemHelper = system_helper
count_token = system_helper.count_token
str_to_base64 = system_helper.str_to_base64
create_hmac = system_helper.create_hmac
delay = system_helper.delay
http_request = system_helper.http_request

_request_count = 0

# ===== __import__ 拦截（init 后设置）=====
_original_import = _builtins.__import__
_allowed_modules = set()

_stdlib_paths = []
_site_packages_paths = []
for _key in ('stdlib', 'platstdlib'):
    _p = _sysconfig.get_path(_key)
    if _p:
        _stdlib_paths.append(_p)
for _key in ('purelib', 'platlib'):
    _p = _sysconfig.get_path(_key)
    if _p:
        _stdlib_paths.append(_p)
        _site_packages_paths.append(_p)
_stdlib_paths.append('<frozen')


def _is_stdlib_frame(filename):
    if not filename:
        return False
    if filename.startswith('<frozen'):
        return True
    for sp in _stdlib_paths:
        if filename.startswith(sp):
            return True
    return False


def _is_site_packages_frame(filename):
    """Check if a frame is from an installed third-party package (site-packages)."""
    if not filename:
        return False
    for sp in _site_packages_paths:
        if filename.startswith(sp):
            return True
    return False


# ===== builtins 代理（防止用户覆盖 __import__）=====
class _BuiltinsProxy:
    """builtins 模块的代理，__import__ 属性只读"""
    def __init__(self, real_builtins):
        object.__setattr__(self, '_real', real_builtins)

    def __getattr__(self, name):
        if name == '__import__':
            return _safe_import
        if name == '_original_import':
            raise AttributeError("_original_import")
        return getattr(object.__getattribute__(self, '_real'), name)

    def __setattr__(self, name, value):
        if name == '__import__':
            return  # 静默忽略覆盖
        if name == '_original_import':
            return
        setattr(object.__getattribute__(self, '_real'), name, value)

    def __dir__(self):
        return [n for n in dir(object.__getattribute__(self, '_real'))
                if n != '_original_import']

_builtins_proxy = None  # init 后创建


_import_guard = False

def _safe_import(name, *args, **kwargs):
    global _import_guard
    # 重入保护：避免 extract_stack / _original_import 内部触发 import 时无限递归
    if _import_guard:
        return _original_import(name, *args, **kwargs)
    top_level = name.split('.')[0]
    # 拦截 builtins 模块，返回代理
    if top_level == 'builtins' and _builtins_proxy is not None:
        return _builtins_proxy
    # 安全的 stdlib 模块直接放行（不含危险模块）
    if top_level in _STDLIB_MODULES and top_level not in _DANGEROUS_STDLIB:
        return _original_import(name, *args, **kwargs)
    # 在白名单中的模块直接放行
    if top_level in _allowed_modules:
        return _original_import(name, *args, **kwargs)
    # 不在白名单中的模块（含危险 stdlib）：检查是否由用户代码直接触发
    _import_guard = True
    try:
        stack = _tb.extract_stack()
    finally:
        _import_guard = False
    # 只拦截直接调用者是用户代码的情况（<string>/<test>/<module>）
    # stdlib 内部的间接 import（如 locale -> os）放行
    if len(stack) >= 2:
        caller_fn = stack[-2].filename or ''
        if caller_fn in ('<string>', '<test>', '<module>'):
            raise ImportError(f"Module '{name}' is not in the allowlist.")
    return _original_import(name, *args, **kwargs)


# ===== 文件系统限制 =====
_original_open = open

_open_guard = False

def _restricted_open(*args, **kwargs):
    """限制 open() — 只允许第三方库内部调用，禁止用户代码直接读写文件"""
    global _open_guard
    if _open_guard:
        return _original_open(*args, **kwargs)
    _open_guard = True
    try:
        stack = _tb.extract_stack()
    finally:
        _open_guard = False
    if len(stack) >= 2:
        caller_fn = stack[-2].filename or ''
        # 用户代码（<string>）不允许直接 open
        if caller_fn in ('<string>', '<test>', '<module>'):
            raise PermissionError("File system access is not allowed in sandbox")
        # 非 stdlib、非 site-packages、非 worker 自身的帧也不允许
        if not _is_stdlib_frame(caller_fn) and not _is_site_packages_frame(caller_fn) and caller_fn != __file__:
            raise PermissionError("File system access is not allowed in sandbox")
    return _original_open(*args, **kwargs)


# ===== 日志收集 =====
_logs = []
_log_size = 0
_MAX_LOG_SIZE = 1024 * 1024  # 1MB
_orig_print = print


def _safe_print(*args, **kwargs):
    global _log_size
    line = ' '.join(str(a) for a in args)
    if _log_size + len(line) <= _MAX_LOG_SIZE:
        _logs.append(line)
        _log_size += len(line)


# ===== 输出 =====
def write_line(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, default=str) + '\n')
    sys.stdout.flush()


# ===== 超时信号处理 =====
_timeout_stage = 0  # 0=未触发, 1=第一次(可恢复), 2=第二次(强制退出)

def _timeout_handler(signum, frame):
    global _timeout_stage
    _timeout_stage += 1
    if _timeout_stage >= 2:
        # 第二次 alarm：用户代码 catch 了第一次 TimeoutError，强制写错误并退出当前执行
        # 通过 SystemExit 强制终止（不可被 except Exception 捕获）
        raise SystemExit("Script execution timed out (forced)")
    # 第一次 alarm：设置 1s 后的兜底 alarm
    signal.alarm(1)
    raise TimeoutError("Script execution timed out")


# ===== 模块状态保护 =====
# 用户代码可能污染共享模块（如 json.dumps = lambda x: "hacked"），
# 需要在每次执行前快照、执行后恢复。
_PROTECTED_MODULES = [json, _math, _time, _base64, _hashlib, _hmac, _copy]


def _snapshot_modules():
    """保存受保护模块的属性快照"""
    snapshots = []
    for mod in _PROTECTED_MODULES:
        attrs = {}
        for name in dir(mod):
            if not name.startswith('__'):
                try:
                    attrs[name] = getattr(mod, name)
                except Exception:
                    pass
        snapshots.append((mod, attrs))
    return snapshots


def _restore_modules(snapshots):
    """恢复受保护模块的属性"""
    for mod, attrs in snapshots:
        # 删除用户可能添加的新属性
        current_names = set(n for n in dir(mod) if not n.startswith('__'))
        original_names = set(attrs.keys())
        for name in current_names - original_names:
            try:
                delattr(mod, name)
            except Exception:
                pass
        # 恢复原始属性
        for name, val in attrs.items():
            try:
                setattr(mod, name, val)
            except Exception:
                pass


# ===== 主循环 =====
def main_loop():
    global _allowed_modules, _request_count, _logs

    initialized = False

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            write_line({"success": False, "message": "Invalid JSON input"})
            continue

        # 初始化
        if not initialized:
            if msg.get('type') == 'init':
                _allowed_modules = set(msg.get('allowedModules', []))
                _init_request_limits(msg.get('requestLimits'))
                _builtins.__import__ = _safe_import
                global _builtins_proxy
                _builtins_proxy = _BuiltinsProxy(_builtins)
                write_line({"type": "ready"})
                initialized = True
            else:
                write_line({"success": False, "message": "Expected init message"})
            continue

        # ping 健康检查：立即回复 pong
        if msg.get('type') == 'ping':
            write_line({"type": "pong"})
            continue

        # 执行任务
        code = msg.get('code', '')
        variables = msg.get('variables', {})
        timeout_ms = msg.get('timeoutMs', 10000)
        # 修复精度：向上取整而非截断，最小 1 秒
        timeout_s = max(1, -(-timeout_ms // 1000))  # ceil division

        _request_count = 0
        _logs = []
        _log_size = 0
        _timeout_stage = 0

        # 替换 print
        _builtins.print = _safe_print

        # 每次执行前强制恢复 __import__，防止上次用户代码篡改
        _builtins.__import__ = _safe_import

        # 保存模块状态快照
        _mod_snapshots = _snapshot_modules()

        try:
            # 设置超时（双重 alarm：第一次抛 TimeoutError，第二次兜底防止用户 catch）
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout_s)

            # 构建受限的 __builtins__ 字典，移除 _original_import 等内部引用
            _safe_builtins = {}
            for _name in dir(_builtins):
                if _name.startswith('_') and _name not in (
                    '__name__', '__doc__', '__import__', '__build_class__',
                ):
                    continue
                _safe_builtins[_name] = getattr(_builtins, _name)
            # 确保 __import__ 指向安全版本
            _safe_builtins['__import__'] = _safe_import
            _safe_builtins['__build_class__'] = _builtins.__build_class__
            # 限制 open() — 禁止用户代码直接读写文件系统
            _safe_builtins['open'] = _restricted_open

            # H3: 屏蔽 object.__subclasses__，防止通过子类树找到已加载的危险模块
            class _SafeObject(object):
                __subclasses__ = None
            _safe_builtins['object'] = _SafeObject

            # 构建执行环境
            exec_globals = {
                '__builtins__': _safe_builtins,
                'variables': variables,
                'SystemHelper': system_helper,
                'system_helper': system_helper,
                'count_token': count_token,
                'str_to_base64': str_to_base64,
                'create_hmac': create_hmac,
                'delay': delay,
                'http_request': http_request,
                'print': _safe_print,
                'json': json,
                'math': _math,
                'time': _time,
            }
            # 展开 variables 到全局（过滤保留关键字，防止覆盖沙箱安全全局变量）
            _reserved_keys = frozenset(exec_globals.keys())
            for k, v in variables.items():
                if k not in _reserved_keys:
                    exec_globals[k] = v

            # 执行用户代码
            exec(code, exec_globals)

            # 取出 main 函数
            user_main = exec_globals.get('main')
            if user_main is None:
                raise RuntimeError("No 'main' function defined")

            # 调用 main
            sig = _inspect_mod.signature(user_main)
            params = list(sig.parameters.keys())

            if len(params) == 0:
                result = user_main()
            elif len(params) == 1:
                result = user_main(variables)
            else:
                call_args = []
                for p in params:
                    if p in variables:
                        call_args.append(variables[p])
                    elif sig.parameters[p].default is not _inspect_mod.Parameter.empty:
                        break
                    else:
                        raise TypeError(f"Missing required argument: '{p}'")
                result = user_main(*call_args)

            signal.alarm(0)
            write_line({
                "success": True,
                "data": {"codeReturn": result, "log": '\n'.join(_logs)}
            })

        except (Exception, SystemExit) as e:
            signal.alarm(0)
            write_line({"success": False, "message": str(e)})

        finally:
            signal.alarm(0)
            _builtins.print = _orig_print
            # 恢复模块状态，防止用户代码污染影响后续请求
            _restore_modules(_mod_snapshots)


if __name__ == '__main__':
    main_loop()
