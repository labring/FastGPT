#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Single-shot Python bootstrap for FastGPT isolated runner."""

import ast as _ast
import base64 as _base64
import builtins as _builtins
import ctypes as _ctypes
import copy as _copy
import hashlib as _hashlib
import hmac as _hmac
import inspect as _inspect_mod
import ipaddress as _ipaddress
import json
import math as _math
import os as _os
import signal
import sys
import sysconfig as _sysconfig
import time as _time
import traceback as _tb
import types as _types
import urllib.parse as _urllib_parse
import encodings.idna as _encodings_idna  # noqa: F401

_STDLIB_MODULES = sys.stdlib_module_names if hasattr(sys, 'stdlib_module_names') else frozenset()
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

_REQUEST_LIMITS = {
    'max_requests': 30,
    'timeout': 60,
    'max_response_size': 10 * 1024 * 1024,
    'max_request_body_size': 5 * 1024 * 1024,
    'max_output_size': 10 * 1024 * 1024,
    'allowed_protocols': ['http:', 'https:']
}

_request_count = 0
_allowed_modules = set()
_original_import = _builtins.__import__
_original_json_dumps = json.dumps
_builtins_proxy = None
_import_guard = False
_original_open = open
_original_os_functions = {}
_open_guard = False
_path_guard = False
_logs = []
_log_size = 0
_MAX_LOG_SIZE = 1024 * 1024
_timeout_stage = 0
_audit_hook_installed = False
_native_isolation_ready = False
_task_tmpdir = None

_FORBIDDEN_ATTRS = frozenset({
    '__class__', '__base__', '__bases__', '__mro__', '__subclasses__',
    '__globals__', '__code__', '__closure__', '__func__', '__self__',
    '__dict__', '__getattribute__', '__getattr__', '__setattr__',
})

_FORBIDDEN_BUILTINS = frozenset({
    'eval', 'exec', 'compile', 'input', 'breakpoint',
    'globals', 'locals', 'vars', 'dir', 'super',
})

_PROTECTED_BUILTINS = _FORBIDDEN_BUILTINS | frozenset({
    '__import__', 'open', 'getattr', 'setattr', 'delattr',
})


def _write_result(payload):
    sys.stdout.write(_original_json_dumps({'type': 'result', **payload}, ensure_ascii=False, default=str) + '\n')
    sys.stdout.flush()


def _init_request_limits(limits):
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
    if 'maxOutputSize' in limits:
        _REQUEST_LIMITS['max_output_size'] = limits['maxOutputSize']


class _SystemHelper:
    __slots__ = ()

    @staticmethod
    def http_request(url, method='GET', headers=None, body=None, timeout=None, timeout_ms=None):
        if headers is None:
            headers = {}
        if body is not None:
            body_text = body if isinstance(body, str) else _original_json_dumps(body, ensure_ascii=False)
            if len(body_text.encode('utf-8')) > _REQUEST_LIMITS['max_request_body_size']:
                raise RuntimeError("Request body too large")
        else:
            body_text = None

        if body_text is not None and len(body_text.encode('utf-8')) > _REQUEST_LIMITS['max_request_body_size']:
            raise RuntimeError("Request body too large")

        return _call_parent_http_proxy({
            'url': url,
            'method': method,
            'headers': headers,
            'body': body if body_text is None or isinstance(body, str) else body,
            'timeout': timeout,
            'timeoutMs': timeout_ms
        })

    httpRequest = http_request


system_helper = _SystemHelper()
SystemHelper = system_helper


def count_token(text):
    if not isinstance(text, str):
        text = str(text)
    return _math.ceil(len(text) / 4)


def str_to_base64(text, prefix=''):
    b64 = _base64.b64encode(text.encode('utf-8')).decode('utf-8')
    return prefix + b64


def create_hmac(algorithm, secret):
    timestamp = str(int(_time.time() * 1000))
    string_to_sign = timestamp + '\n' + secret
    h = _hmac.new(secret.encode('utf-8'), string_to_sign.encode('utf-8'), algorithm)
    sign = _urllib_parse.quote(_base64.b64encode(h.digest()).decode('utf-8'))
    return {"timestamp": timestamp, "sign": sign}


def delay(ms):
    if ms > 10000:
        raise ValueError("Delay must be <= 10000ms")
    _time.sleep(ms / 1000)
    return None


_rpc_seq = 0


def _call_parent_http_proxy(payload):
    global _rpc_seq
    _rpc_seq += 1
    req_id = f'http-{_rpc_seq}'
    sys.stdout.write(_original_json_dumps({
        'type': 'http_request',
        'id': req_id,
        'payload': payload
    }, ensure_ascii=False, default=str) + '\n')
    sys.stdout.flush()

    while True:
        line = sys.stdin.readline()
        if not line:
            raise RuntimeError('HTTP proxy response channel closed')
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if msg.get('type') != 'http_response' or msg.get('id') != req_id:
            continue
        if msg.get('success'):
            return msg.get('payload')
        raise RuntimeError(msg.get('message') or 'HTTP request failed')


def _init_native_isolation(isolation):
    global _native_isolation_ready
    if _native_isolation_ready:
        return
    if not isolation or not isolation.get('enableSeccomp'):
        return

    lib_path = isolation.get('libraryPath') or './fastgpt_python_sandbox.so'
    try:
        lib = _ctypes.CDLL(lib_path)
    except Exception as e:
        raise RuntimeError(f"Failed to load native python sandbox library: {e}")

    lib.FastGPTInitPythonSandbox.argtypes = [_ctypes.c_int, _ctypes.c_int, _ctypes.c_int]
    lib.FastGPTInitPythonSandbox.restype = _ctypes.c_int
    lib.FastGPTLastError.argtypes = []
    lib.FastGPTLastError.restype = _ctypes.c_void_p
    lib.FastGPTFreeCString.argtypes = [_ctypes.c_void_p]
    lib.FastGPTFreeCString.restype = None

    ret = lib.FastGPTInitPythonSandbox(
        int(isolation.get('uid') or 65537),
        int(isolation.get('gid') or 65537),
        1 if isolation.get('enableNetwork') else 0
    )
    if ret == 0:
        _native_isolation_ready = True
        return

    err_ptr = lib.FastGPTLastError()
    try:
        err_text = _ctypes.cast(err_ptr, _ctypes.c_char_p).value.decode('utf-8') if err_ptr else ''
    finally:
        if err_ptr:
            lib.FastGPTFreeCString(err_ptr)
    raise RuntimeError(err_text or f"Native python sandbox init failed: {ret}")


def _is_stdlib_frame(filename: str):
    if not filename:
        return False
    try:
        stdlib = _sysconfig.get_paths().get('stdlib') or ''
        platstdlib = _sysconfig.get_paths().get('platstdlib') or ''
        return (stdlib and filename.startswith(stdlib)) or (platstdlib and filename.startswith(platstdlib))
    except Exception:
        return False


def _is_site_packages_frame(filename: str):
    return 'site-packages' in filename or 'dist-packages' in filename


class _BuiltinsProxy(_types.ModuleType):
    def __init__(self, original):
        super().__init__('builtins')
        object.__setattr__(self, '_original', original)

    def __getattr__(self, name):
        if name == 'open':
            return _restricted_open
        if name == 'getattr':
            return _safe_getattr
        if name == 'setattr':
            return _safe_setattr
        if name == 'delattr':
            return _safe_delattr
        if name in _FORBIDDEN_BUILTINS:
            raise AttributeError(f"builtins.{name} is not available in sandbox")
        return getattr(object.__getattribute__(self, '_original'), name)

    def __setattr__(self, name, value):
        if name in _PROTECTED_BUILTINS:
            raise AttributeError(f"builtins.{name} cannot be modified in sandbox")
        return setattr(object.__getattribute__(self, '_original'), name, value)

    def __delattr__(self, name):
        if name in _PROTECTED_BUILTINS:
            raise AttributeError(f"builtins.{name} cannot be deleted in sandbox")
        return delattr(object.__getattribute__(self, '_original'), name)


def _safe_getattr(obj, name, *args):
    if isinstance(name, str) and name in _FORBIDDEN_ATTRS:
        raise AttributeError(f"Access to {name} is not allowed in sandbox")
    return getattr(obj, name, *args)


def _safe_setattr(obj, name, value):
    raise AttributeError("Use of setattr is not allowed in sandbox")


def _safe_delattr(obj, name):
    raise AttributeError("Use of delattr is not allowed in sandbox")


def _is_direct_user_import_call():
    global _import_guard
    _import_guard = True
    try:
        stack = _tb.extract_stack()
    finally:
        _import_guard = False

    if len(stack) < 3:
        return False
    caller_fn = stack[-3].filename or ''
    return caller_fn in ('<string>', '<test>', '<module>')


def _safe_import(name, *args, **kwargs):
    if _import_guard:
        return _original_import(name, *args, **kwargs)
    top_level = name.split('.')[0]
    if top_level == 'builtins' and _builtins_proxy is not None:
        return _builtins_proxy
    if top_level in _STDLIB_MODULES and top_level not in _DANGEROUS_STDLIB:
        return _original_import(name, *args, **kwargs)
    if top_level in _allowed_modules:
        return _original_import(name, *args, **kwargs)
    if _is_direct_user_import_call():
        raise ImportError(f"Module '{name}' is not in the allowlist.")
    return _original_import(name, *args, **kwargs)


def _validate_user_code(code: str):
    try:
        tree = _ast.parse(code)
    except SyntaxError:
        return

    forbidden_builtin_calls = {
        'eval', 'exec', 'compile', 'globals', 'locals', 'vars', 'dir',
        'breakpoint', 'input', 'super'
    }

    for node in _ast.walk(tree):
        if isinstance(node, _ast.Attribute) and node.attr in _FORBIDDEN_ATTRS:
            raise RuntimeError(f"Access to {node.attr} is not allowed in sandbox")
        if isinstance(node, _ast.Call) and isinstance(node.func, _ast.Name):
            if node.func.id in forbidden_builtin_calls:
                raise RuntimeError(f"Use of {node.func.id} is not allowed in sandbox")
            if node.func.id in ('setattr', 'delattr'):
                raise RuntimeError(f"Use of {node.func.id} is not allowed in sandbox")
            if node.func.id == 'getattr':
                if len(node.args) < 2 or not isinstance(node.args[1], _ast.Constant):
                    raise RuntimeError("Dynamic getattr is not allowed in sandbox")
                if node.args[1].value in _FORBIDDEN_ATTRS:
                    raise RuntimeError(f"Access to {node.args[1].value} is not allowed in sandbox")


def _restricted_open(*args, **kwargs):
    global _open_guard
    path = args[0] if args else None
    mode = kwargs.get('mode', args[1] if len(args) > 1 else 'r')
    if _open_guard:
        return _original_open(*args, **kwargs)
    _open_guard = True
    try:
        stack = _tb.extract_stack()
    finally:
        _open_guard = False
    if len(stack) >= 2:
        caller_fn = stack[-2].filename or ''
        if _is_user_code_filename(caller_fn) and not _is_path_under_task_tmp(path):
            raise PermissionError("File system access is not allowed in sandbox")
        if (
            not _is_stdlib_frame(caller_fn)
            and not _is_site_packages_frame(caller_fn)
            and caller_fn != __file__
            and not _is_path_under_task_tmp(path)
        ):
            raise PermissionError("File system access is not allowed in sandbox")
    if _is_write_mode(mode) and not _is_path_under_task_tmp(path):
        raise PermissionError("File writes are only allowed in the task temporary directory")
    return _original_open(*args, **kwargs)


def _is_user_code_filename(filename):
    return filename in ('<string>', '<test>', '<module>')


def _is_write_mode(mode):
    mode_text = str(mode or 'r')
    return any(flag in mode_text for flag in ('w', 'a', 'x', '+'))


def _is_write_flags(flags):
    try:
        flags_int = int(flags)
    except Exception:
        return False
    return bool(
        flags_int
        & (
            _os.O_WRONLY
            | _os.O_RDWR
            | _os.O_CREAT
            | _os.O_APPEND
            | _os.O_TRUNC
        )
    )


def _is_path_under_task_tmp(path):
    global _path_guard
    if not _task_tmpdir:
        return False
    try:
        path_text = _os.fspath(path)
    except Exception:
        return False
    if not isinstance(path_text, str):
        return False
    try:
        _path_guard = True
        root = _os.path.realpath(_task_tmpdir)
        candidate = _os.path.realpath(path_text if _os.path.isabs(path_text) else _os.path.join(_os.getcwd(), path_text))
        return candidate == root or candidate.startswith(root.rstrip(_os.sep) + _os.sep)
    except Exception:
        return False
    finally:
        _path_guard = False


def _first_external_caller_filename():
    try:
        frame = sys._getframe(1)
        while frame:
            filename = frame.f_code.co_filename or ''
            if filename != __file__:
                return filename
            frame = frame.f_back
    except Exception:
        return ''
    return ''


def _is_direct_user_fs_access():
    return _is_user_code_filename(_first_external_caller_filename())


def _guard_fs_read_path(path):
    if _path_guard:
        return
    if _is_direct_user_fs_access() and not _is_path_under_task_tmp(path):
        raise PermissionError("File system access is only allowed in the task temporary directory")


def _guard_fs_write_path(path):
    if _path_guard:
        return
    if not _is_path_under_task_tmp(path):
        raise PermissionError("File system writes are only allowed in the task temporary directory")


def _install_os_guards():
    if _original_os_functions:
        return

    def wrap_read_path(name):
        original = getattr(_os, name, None)
        if original is None:
            return
        _original_os_functions[name] = original

        def guarded(path, *args, **kwargs):
            _guard_fs_read_path(path)
            return original(path, *args, **kwargs)

        setattr(_os, name, guarded)

    def wrap_write_path(name):
        original = getattr(_os, name, None)
        if original is None:
            return
        _original_os_functions[name] = original

        def guarded(path, *args, **kwargs):
            _guard_fs_write_path(path)
            return original(path, *args, **kwargs)

        setattr(_os, name, guarded)

    def wrap_write_pair(name):
        original = getattr(_os, name, None)
        if original is None:
            return
        _original_os_functions[name] = original

        def guarded(src, dst, *args, **kwargs):
            _guard_fs_write_path(src)
            _guard_fs_write_path(dst)
            return original(src, dst, *args, **kwargs)

        setattr(_os, name, guarded)

    original_open = _os.open
    _original_os_functions['open'] = original_open

    def guarded_open(path, flags, *args, **kwargs):
        if _is_write_flags(flags):
            _guard_fs_write_path(path)
        else:
            _guard_fs_read_path(path)
        return original_open(path, flags, *args, **kwargs)

    _os.open = guarded_open

    for name in ('listdir', 'scandir', 'stat', 'lstat', 'access', 'chdir'):
        wrap_read_path(name)
    for name in ('mkdir', 'makedirs', 'remove', 'unlink', 'rmdir', 'truncate', 'chmod', 'chown', 'utime'):
        wrap_write_path(name)
    for name in ('rename', 'replace', 'symlink', 'link'):
        wrap_write_pair(name)


def _init_task_tmpdir(path):
    global _task_tmpdir
    _task_tmpdir = path or _os.environ.get('FASTGPT_TASK_TMPDIR') or '/tmp'
    try:
        _os.makedirs(_task_tmpdir, mode=0o700, exist_ok=True)
        _os.environ['HOME'] = _task_tmpdir
        _os.environ['TMPDIR'] = _task_tmpdir
        mpl_config_dir = _os.path.join(_task_tmpdir, 'matplotlib')
        _os.makedirs(mpl_config_dir, mode=0o700, exist_ok=True)
        _os.environ['MPLCONFIGDIR'] = mpl_config_dir
    except Exception as e:
        raise RuntimeError(f"Failed to initialize task temporary directory: {e}")


def _safe_print(*args, **kwargs):
    global _log_size
    line = ' '.join(str(a) for a in args)
    if _log_size + len(line) <= _MAX_LOG_SIZE:
        _logs.append(line)
        _log_size += len(line)


def _timeout_handler(signum, frame):
    global _timeout_stage
    _timeout_stage += 1
    if _timeout_stage >= 2:
        raise SystemExit("Script execution timed out (forced)")
    signal.alarm(1)
    raise TimeoutError("Script execution timed out")


def _install_audit_hook():
    global _audit_hook_installed
    if _audit_hook_installed:
        return
    _audit_hook_installed = True

    def _audit(event, args):
        if event == 'open':
            path = args[0] if len(args) > 0 else None
            mode = args[1] if len(args) > 1 else 'r'
            flags = args[2] if len(args) > 2 else 0
            if not _is_path_under_task_tmp(path) and (_is_write_mode(mode) or _is_write_flags(flags)):
                raise RuntimeError("File writes are only allowed in the task temporary directory")
            if _is_direct_user_fs_access() and not _is_path_under_task_tmp(path):
                raise RuntimeError("File system access is only allowed in the task temporary directory")
            return
        if event in (
            'os.listdir',
            'os.scandir',
            'os.stat',
            'os.lstat',
            'os.access',
            'os.chdir',
        ):
            path = args[0] if len(args) > 0 else None
            if _is_direct_user_fs_access() and not _is_path_under_task_tmp(path):
                raise RuntimeError("File system access is only allowed in the task temporary directory")
            return
        if event in (
            'os.mkdir',
            'os.makedirs',
            'os.remove',
            'os.unlink',
            'os.rmdir',
            'os.rename',
            'os.replace',
            'os.symlink',
            'os.link',
            'os.truncate',
            'os.chmod',
            'os.chown',
            'os.utime',
            'shutil.rmtree'
        ):
            path = args[0] if len(args) > 0 else None
            target = args[1] if event in ('os.rename', 'os.replace', 'os.symlink', 'os.link') and len(args) > 1 else None
            if not _is_path_under_task_tmp(path) or (target is not None and not _is_path_under_task_tmp(target)):
                raise RuntimeError("File system writes are only allowed in the task temporary directory")
            return
        if (
            event == 'os.system'
            or event.startswith('os.exec')
            or event.startswith('os.spawn')
            or event.startswith('os.posix_spawn')
            or event.startswith('socket.')
            or event.startswith('ctypes.')
        ):
            raise RuntimeError(f"Operation {event} is not allowed in sandbox")
        if event.startswith('subprocess.'):
            if _is_allowed_matplotlib_font_probe(event, args):
                return
            raise RuntimeError(f"Operation {event} is not allowed in sandbox")

    sys.addaudithook(_audit)


def _is_allowed_matplotlib_font_probe(event, args):
    if event != 'subprocess.Popen':
        return False
    if not _is_called_from_matplotlib_font_manager():
        return False

    command = args[1] if len(args) > 1 else args[0] if args else None
    if isinstance(command, (list, tuple)):
        parts = [str(item) for item in command]
    elif isinstance(command, str):
        parts = command.split()
    else:
        return False

    if parts[:2] == ['fc-list', '--help']:
        return True
    if parts[:2] == ['fc-list', '--format=%{file}\\n']:
        return True
    if parts == ['system_profiler', '-xml', 'SPFontsDataType']:
        return True
    return False


def _is_called_from_matplotlib_font_manager():
    try:
        for frame in _inspect_mod.stack()[2:]:
            filename = frame.filename or ''
            normalized = filename.replace('\\', '/')
            if normalized.endswith('/matplotlib/font_manager.py'):
                return True
    except Exception:
        return False
    return False


_PROTECTED_MODULES = [json, _math, _time, _base64, _hashlib, _hmac, _copy]


def _snapshot_modules():
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
    for mod, attrs in snapshots:
        current_names = set(n for n in dir(mod) if not n.startswith('__'))
        original_names = set(attrs.keys())
        for name in current_names - original_names:
            try:
                delattr(mod, name)
            except Exception:
                pass
        for name, val in attrs.items():
            try:
                setattr(mod, name, val)
            except Exception:
                pass


def _call_main(user_main, variables):
    sig = _inspect_mod.signature(user_main)
    params = list(sig.parameters.keys())

    if len(params) == 0:
        return user_main()
    if len(params) == 1:
        p = params[0]
        if p in variables:
            return user_main(variables[p])
        return user_main(variables)

    for p in params:
        if p not in variables and sig.parameters[p].default is _inspect_mod.Parameter.empty:
            raise TypeError(f"Missing required argument: '{p}'")
    call_kwargs = {p: variables[p] for p in params if p in variables}
    return user_main(**call_kwargs)


def _run_task(msg):
    global _allowed_modules, _builtins_proxy, _request_count, _logs, _log_size, _timeout_stage
    _allowed_modules = set(msg.get('allowedModules', []))
    _init_request_limits(msg.get('requestLimits'))
    _request_count = 0
    _logs = []
    _log_size = 0
    _timeout_stage = 0

    code = msg.get('code', '')
    variables = msg.get('variables', {})
    timeout_ms = msg.get('timeoutMs', 10000)
    timeout_s = max(1, -(-timeout_ms // 1000))

    _builtins.__import__ = _safe_import
    _builtins.print = _safe_print
    _builtins_proxy = _BuiltinsProxy(_builtins)

    snapshots = _snapshot_modules()

    try:
        _init_native_isolation(msg.get('isolation') or {})
        _init_task_tmpdir(msg.get('taskTmpDir'))
        _install_os_guards()

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(timeout_s)

        safe_builtins = {}
        for name in dir(_builtins):
            if name.startswith('_') and name not in (
                '__name__', '__doc__', '__import__', '__build_class__',
            ):
                continue
            if name in _FORBIDDEN_BUILTINS:
                continue
            safe_builtins[name] = getattr(_builtins, name)
        safe_builtins['__import__'] = _safe_import
        safe_builtins['__build_class__'] = _builtins.__build_class__
        safe_builtins['open'] = _restricted_open
        safe_builtins['getattr'] = _safe_getattr
        safe_builtins['setattr'] = _safe_setattr
        safe_builtins['delattr'] = _safe_delattr

        class _SafeObject(object):
            __subclasses__ = None
        safe_builtins['object'] = _SafeObject

        exec_globals = {
            '__builtins__': safe_builtins,
            'variables': variables,
            'SystemHelper': system_helper,
            'system_helper': system_helper,
            'task_tmpdir': _task_tmpdir,
            'count_token': count_token,
            'str_to_base64': str_to_base64,
            'create_hmac': create_hmac,
            'delay': delay,
            'http_request': system_helper.http_request,
            'print': _safe_print,
            'json': json,
            'math': _math,
            'time': _time,
        }
        reserved_keys = frozenset(exec_globals.keys())
        for k, v in variables.items():
            if k not in reserved_keys:
                exec_globals[k] = v

        _validate_user_code(code)
        _install_audit_hook()
        exec(code, exec_globals)

        user_main = exec_globals.get('main')
        if user_main is None:
            raise RuntimeError("No 'main' function defined")

        result = _call_main(user_main, variables)
        signal.alarm(0)
        _write_result({'success': True, 'data': {'codeReturn': result, 'log': '\n'.join(_logs)}})
    except (Exception, SystemExit) as e:
        signal.alarm(0)
        _write_result({'success': False, 'message': str(e)})
    finally:
        _restore_modules(snapshots)
        _builtins.__import__ = _original_import
        _builtins.open = _original_open


def _run_warm_worker(init_msg):
    try:
        _init_native_isolation(init_msg.get('isolation') or {})
        sys.stdout.write(_original_json_dumps({'type': 'ready'}, ensure_ascii=False) + '\n')
        sys.stdout.flush()
    except (Exception, SystemExit) as e:
        _write_result({'success': False, 'message': str(e)})
        return

    line = sys.stdin.readline()
    if not line:
        _write_result({'success': False, 'message': 'Missing task input'})
        return
    try:
        msg = json.loads(line)
    except Exception as e:
        _write_result({'success': False, 'message': f'Invalid JSON input: {e}'})
        return
    _run_task(msg)


def main():
    line = sys.stdin.readline()
    if not line:
        _write_result({'success': False, 'message': 'Missing task input'})
        return
    try:
        msg = json.loads(line)
    except Exception as e:
        _write_result({'success': False, 'message': f'Invalid JSON input: {e}'})
        return
    if msg.get('type') == 'init':
        _run_warm_worker(msg)
        return
    _run_task(msg)


if __name__ == '__main__':
    main()
