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
    'max_response_size': 2 * 1024 * 1024,
    'allowed_protocols': ['http:', 'https:']
}


def _is_blocked_ip(ip_str):
    try:
        addr = _ipaddress.ip_address(ip_str)
        for net in _BLOCKED_CIDRS:
            if addr in net:
                return True
    except ValueError:
        return True
    return False


class _SystemHelper:
    def __init__(self):
        self._base64 = _base64
        self._hmac = _hmac
        self._time = _time
        self._math = _math
        self._urllib_parse = _urllib_parse
        self._urllib_request = _urllib_request
        self._socket = _socket

    def count_token(self, text):
        if not isinstance(text, str):
            text = str(text)
        return self._math.ceil(len(text) / 4)

    def str_to_base64(self, text, prefix=''):
        b64 = self._base64.b64encode(text.encode('utf-8')).decode('utf-8')
        return prefix + b64

    def create_hmac(self, algorithm, secret):
        timestamp = str(int(self._time.time() * 1000))
        string_to_sign = timestamp + '\n' + secret
        h = self._hmac.new(secret.encode('utf-8'), string_to_sign.encode('utf-8'), algorithm)
        sign = self._urllib_parse.quote(self._base64.b64encode(h.digest()).decode('utf-8'))
        return {"timestamp": timestamp, "sign": sign}

    def delay(self, ms):
        if ms > 10000:
            raise ValueError("Delay must be <= 10000ms")
        self._time.sleep(ms / 1000)

    def http_request(self, url, method='GET', headers=None, body=None, timeout=None):
        global _request_count
        _request_count += 1
        if _request_count > _REQUEST_LIMITS['max_requests']:
            raise RuntimeError(f"Request limit exceeded: max {_REQUEST_LIMITS['max_requests']}")

        parsed = self._urllib_parse.urlparse(url)
        if parsed.scheme + ':' not in _REQUEST_LIMITS['allowed_protocols']:
            raise RuntimeError(f"Protocol {parsed.scheme}: not allowed")

        hostname = parsed.hostname
        try:
            infos = self._socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
            for info in infos:
                ip = info[4][0]
                if _is_blocked_ip(ip):
                    raise RuntimeError("Request to private/internal network not allowed")
            resolved_ip = infos[0][4][0] if infos else None
        except self._socket.gaierror as e:
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

        # DNS 已验证安全，直接用原始 URL（不替换为 IP，避免 SSL SNI 问题）
        req = self._urllib_request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            resp = self._urllib_request.urlopen(req, timeout=timeout)
            resp_data = resp.read(_REQUEST_LIMITS['max_response_size'] + 1)
            if len(resp_data) > _REQUEST_LIMITS['max_response_size']:
                raise RuntimeError("Response too large")
            return {
                'status': resp.status,
                'headers': dict(resp.headers),
                'data': resp_data.decode('utf-8', errors='replace')
            }
        except self._urllib_request.URLError as e:
            raise RuntimeError(f"HTTP request failed: {e}")


system_helper = _SystemHelper()
# 驼峰别名，与 JS 端 SystemHelper API 保持一致
system_helper.countToken = system_helper.count_token
system_helper.strToBase64 = system_helper.str_to_base64
system_helper.createHmac = system_helper.create_hmac
system_helper.httpRequest = system_helper.http_request
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


def _safe_import(name, *args, **kwargs):
    top_level = name.split('.')[0]
    # 拦截 builtins 模块，返回代理
    if top_level == 'builtins' and _builtins_proxy is not None:
        return _builtins_proxy
    if top_level not in _allowed_modules:
        # 只检查直接调用者帧（触发 import 的那一帧）
        # 如果直接调用者是 site-packages 中的第三方库或 stdlib，放行（库内部依赖）
        # 只有当直接调用者是用户代码时才拦截
        stack = _tb.extract_stack()
        # stack[-1] 是 _safe_import 自身，stack[-2] 是直接调用者
        if len(stack) >= 2:
            caller_fn = stack[-2].filename or ''
            if caller_fn in ('<string>', '<test>', '<module>'):
                raise ImportError(f"Module '{name}' is not in the allowlist.")
            if not _is_stdlib_frame(caller_fn) and not _is_site_packages_frame(caller_fn) and caller_fn != __file__:
                raise ImportError(f"Module '{name}' is not in the allowlist.")
    return _original_import(name, *args, **kwargs)


# ===== 文件系统限制 =====
_original_open = open

def _restricted_open(*args, **kwargs):
    """限制 open() — 只允许第三方库内部调用，禁止用户代码直接读写文件"""
    stack = _tb.extract_stack()
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
_orig_print = print


def _safe_print(*args, **kwargs):
    _logs.append(' '.join(str(a) for a in args))


# ===== 输出 =====
def write_line(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, default=str) + '\n')
    sys.stdout.flush()


# ===== 超时信号处理 =====
def _timeout_handler(signum, frame):
    raise TimeoutError("Script execution timed out")


# ===== 模块状态保护 =====
# 用户代码可能污染共享模块（如 json.dumps = lambda x: "hacked"），
# 需要在每次执行前快照、执行后恢复。
_PROTECTED_MODULES = [json, _math, _time]


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

        # 替换 print
        _builtins.print = _safe_print

        # 每次执行前强制恢复 __import__，防止上次用户代码篡改
        _builtins.__import__ = _safe_import

        # 保存模块状态快照
        _mod_snapshots = _snapshot_modules()

        try:
            # 设置超时
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
            # 展开 variables 到全局
            for k, v in variables.items():
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

        except Exception as e:
            signal.alarm(0)
            write_line({"success": False, "message": str(e)})

        finally:
            signal.alarm(0)
            _builtins.print = _orig_print
            # 恢复模块状态，防止用户代码污染影响后续请求
            _restore_modules(_mod_snapshots)


if __name__ == '__main__':
    main_loop()
