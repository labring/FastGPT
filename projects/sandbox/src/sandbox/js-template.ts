/**
 * JS 执行脚本模板生成器
 *
 * 生成一个完整的 JS 脚本，包含：
 * - 安全 shim（原型链冻结、Bun API 禁用）
 * - 模块白名单（通过 Function 构造器注入 safe require）
 * - SystemHelper 内置函数
 * - 临时文件系统（路径遍历防护 + 磁盘配额）
 * - 日志收集
 * - 用户代码执行
 */
import { BLOCKED_IP_RANGES, REQUEST_LIMITS } from './network-config';

export function generateJsScript(
  userCode: string,
  allowedModules: string[],
  limits: { timeoutMs: number; memoryMB: number; diskMB: number }
): string {
  // 转义用户代码中的反引号和 ${} 以安全嵌入模板字符串
  const escapedUserCode = userCode
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  return `// ===== 安全 shim =====
// 阻止原型链逃逸
Object.getPrototypeOf = () => Object.create(null);
Reflect.getPrototypeOf = () => Object.create(null);
Object.setPrototypeOf = () => false;
Reflect.setPrototypeOf = () => false;
if (Error.prepareStackTrace) delete Error.prepareStackTrace;
if (Error.captureStackTrace) delete Error.captureStackTrace;

// 阻止 constructor.constructor 逃逸到全局 Function
// 保存原始 Function 供内部使用，然后覆盖全局 Function 构造器
const _OriginalFunction = Function;
const _SafeFunction = function(...args) {
  throw new Error('Function constructor is not allowed in sandbox');
};
_SafeFunction.prototype = _OriginalFunction.prototype;
Object.defineProperty(_OriginalFunction.prototype, 'constructor', {
  value: _SafeFunction,
  writable: false,
  configurable: false
});
globalThis.Function = _SafeFunction;

// 阻止访问 Bun 内置危险 API
if (typeof globalThis.Bun !== 'undefined') {
  // 注意：不能删除 Bun.file，因为 Bun 内部的 fs 和 process.stdout 依赖它
  const _dangerousBunAPIs = [
    'write', 'spawn', 'spawnSync', 'openInEditor',
    'serve', 'connect', 'listen',
    'udpSocket', 'dns', 'plugin',
    'build', 'Transpiler'
  ];
  for (const api of _dangerousBunAPIs) {
    try { globalThis.Bun[api] = undefined; } catch {}
  }
}

// ===== 模块白名单 =====
const _origRequire = require;
const ALLOWED_MODULES = new Set(${JSON.stringify(allowedModules)});

// 清理 process.env，仅保留必要变量
{
  const _keepEnv = ['SANDBOX_TMPDIR', 'SANDBOX_MEMORY_MB', 'SANDBOX_DISK_MB', 'PATH', 'HOME', 'NODE_ENV'];
  for (const key of Object.keys(process.env)) {
    if (!_keepEnv.includes(key)) {
      delete process.env[key];
    }
  }
}

const _safeRequire = new Proxy(_origRequire, {
  apply(target, thisArg, args) {
    const mod = args[0];
    if (!ALLOWED_MODULES.has(mod)) {
      throw new Error("Module '" + mod + "' is not allowed in sandbox");
    }
    return Reflect.apply(target, thisArg, args);
  }
});

// ===== SystemHelper =====
const _fs = _origRequire('fs');
const _path = _origRequire('path');
const _crypto = _origRequire('crypto');
const _http = _origRequire('http');
const _https = _origRequire('https');
const _dns = _origRequire('dns');
const _net = _origRequire('net');
const _urlMod = _origRequire('url');

// 禁用全局网络 API
globalThis.fetch = undefined;
globalThis.XMLHttpRequest = undefined;
globalThis.WebSocket = undefined;

// 限制 process 对象，移除危险 API
{
  const _dangerousProcessAPIs = [
    'binding', 'dlopen', '_linkedBinding',
    'moduleLoadList', '_channel',
    'reallyExit', 'abort',
    'chdir', 'umask',
    'setuid', 'setgid', 'seteuid', 'setegid',
    'setgroups', 'initgroups',
    'kill', '_kill',
    'execPath', 'execArgv', 'argv0',
    'config', 'mainModule',
    '_debugProcess', '_debugEnd', '_startProfilerIdleNotifier', '_stopProfilerIdleNotifier',
  ];
  for (const api of _dangerousProcessAPIs) {
    try { Object.defineProperty(process, api, { value: undefined, writable: false, configurable: false }); } catch {}
  }
  // 冻结 process.env 防止用户修改
  Object.freeze(process.env);
}

const TMPDIR = process.env.SANDBOX_TMPDIR;
const DISK_LIMIT = ${limits.diskMB} * 1024 * 1024;
let _diskUsed = 0;
const _fileSizes = new Map();

// ===== 网络安全 =====
const _BLOCKED_CIDRS = ${JSON.stringify(BLOCKED_IP_RANGES)};
const _REQUEST_LIMITS = ${JSON.stringify(REQUEST_LIMITS)};
let _requestCount = 0;

function _ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function _isBlockedIP(ip) {
  if (!ip) return true;
  // IPv6 loopback
  if (ip === '::1' || ip === '::') return true;
  // IPv6 mapped IPv4
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // IPv6 ULA / link-local
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  // IPv4 check
  if (!_net.isIPv4(ip)) return false;
  const ipLong = _ipToLong(ip);
  const cidrs = [
    ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16],
    ['169.254.0.0', 16], ['127.0.0.0', 8], ['0.0.0.0', 8]
  ];
  for (const [base, bits] of cidrs) {
    const mask = (0xFFFFFFFF << (32 - bits)) >>> 0;
    if ((ipLong & mask) === (_ipToLong(base) & mask)) return true;
  }
  return false;
}

function _dnsResolve(hostname) {
  return new Promise((resolve, reject) => {
    _dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses.map(a => a.address));
    });
  });
}

function _safePath(userPath) {
  const resolved = _path.resolve(TMPDIR, userPath);
  const rel = _path.relative(TMPDIR, resolved);
  if (rel.startsWith('..') || _path.isAbsolute(rel)) {
    throw new Error('Path traversal not allowed');
  }
  // Resolve symlinks to prevent symlink-based path traversal
  if (_fs.existsSync(resolved)) {
    const real = _fs.realpathSync(resolved);
    if (!real.startsWith(TMPDIR)) {
      throw new Error('Path traversal not allowed');
    }
    return real;
  }
  return resolved;
}

const SystemHelper = {
  countToken(text) {
    if (typeof text !== 'string') text = String(text);
    return Math.ceil(text.length / 4);
  },

  strToBase64(str, prefix = '') {
    return prefix + Buffer.from(str, 'utf-8').toString('base64');
  },

  createHmac(algorithm, secret) {
    const timestamp = Date.now().toString();
    const stringToSign = timestamp + '\\n' + secret;
    const hmac = _crypto.createHmac(algorithm, secret);
    hmac.update(stringToSign, 'utf8');
    const sign = encodeURIComponent(hmac.digest('base64'));
    return { timestamp, sign };
  },

  delay(ms) {
    if (ms > 10000) throw new Error('Delay must be <= 10000ms');
    return new Promise((r) => setTimeout(r, ms));
  },

  /**
   * 安全的 HTTP 请求
   * @param {string} url - 请求地址
   * @param {object} opts - 选项 { method, headers, body, timeout }
   * @returns {Promise<{status: number, statusText: string, headers: object, data: string}>}
   */
  async httpRequest(url, opts = {}) {
    if (++_requestCount > _REQUEST_LIMITS.maxRequests) {
      throw new Error('Request limit exceeded: max ' + _REQUEST_LIMITS.maxRequests + ' requests per execution');
    }

    const parsed = new URL(url);
    if (!_REQUEST_LIMITS.allowedProtocols.includes(parsed.protocol)) {
      throw new Error('Protocol ' + parsed.protocol + ' is not allowed. Use http: or https:');
    }

    // DNS 解析后校验 IP，并用 resolved IP 发起连接防止 DNS rebinding
    const ips = await _dnsResolve(parsed.hostname);
    for (const ip of ips) {
      if (_isBlockedIP(ip)) {
        throw new Error('Request to private/internal network is not allowed');
      }
    }

    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    const body = opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : null;
    const timeout = Math.min(opts.timeout || _REQUEST_LIMITS.timeoutMs, _REQUEST_LIMITS.timeoutMs);

    if (body && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    // 使用 resolved IP 发起连接，设置 Host header 为原始 hostname（防止 DNS rebinding TOCTOU）
    const resolvedIP = ips[0];
    const originalHostname = parsed.hostname;
    const resolvedUrl = new URL(url);
    resolvedUrl.hostname = resolvedIP;
    if (!headers['Host'] && !headers['host']) {
      headers['Host'] = originalHostname + (parsed.port ? ':' + parsed.port : '');
    }

    const lib = parsed.protocol === 'https:' ? _https : _http;

    return new Promise((resolve, reject) => {
      const reqOpts = {
        method,
        headers,
        timeout,
        hostname: resolvedIP,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        servername: originalHostname,  // SNI for TLS
      };
      const req = lib.request(reqOpts, (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > _REQUEST_LIMITS.maxResponseSize) {
            req.destroy();
            reject(new Error('Response too large: max ' + (_REQUEST_LIMITS.maxResponseSize / 1024 / 1024) + 'MB'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          const respHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            respHeaders[k] = v;
          }
          resolve({ status: res.statusCode, statusText: res.statusMessage, headers: respHeaders, data });
        });
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout: ' + timeout + 'ms')); });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  },

  fs: {
    writeFile(path, content) {
      const safe = _safePath(path);
      const bytes = Buffer.byteLength(content, 'utf-8');
      const oldBytes = _fileSizes.get(safe) || 0;
      if (_diskUsed - oldBytes + bytes > DISK_LIMIT) {
        throw new Error('Disk quota exceeded: ${limits.diskMB}MB limit');
      }
      const dir = _path.dirname(safe);
      if (!_fs.existsSync(dir)) {
        _fs.mkdirSync(dir, { recursive: true });
      }
      _fs.writeFileSync(safe, content, 'utf-8');
      _diskUsed = _diskUsed - oldBytes + bytes;
      _fileSizes.set(safe, bytes);
    },
    readFile(path) {
      return _fs.readFileSync(_safePath(path), 'utf-8');
    },
    readdir(path = '.') {
      return _fs.readdirSync(_safePath(path));
    },
    mkdir(path) {
      _fs.mkdirSync(_safePath(path), { recursive: true });
    },
    exists(path) {
      return _fs.existsSync(_safePath(path));
    },
    get tmpDir() {
      return TMPDIR;
    }
  }
};

// 向后兼容全局函数（deprecated）
const countToken = SystemHelper.countToken;
const strToBase64 = SystemHelper.strToBase64;
const createHmac = SystemHelper.createHmac;
const delay = SystemHelper.delay;
const httpRequest = SystemHelper.httpRequest;

// ===== 日志收集 =====
const _logs = [];
const _safeConsole = {
  log(...args) {
    _logs.push(
      args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ')
    );
  }
};

// ===== 读取输入 =====
const _inputText = await Bun.stdin.text();
const _input = JSON.parse(_inputText);
const variables = _input.variables;

// ===== 用户代码（通过 Function 构造器注入 safe require） =====
// 使用 _OriginalFunction 因为全局 Function 已被安全覆盖
const _userFn = new _OriginalFunction(
  'require', 'console', 'SystemHelper',
  'countToken', 'strToBase64', 'createHmac', 'delay', 'httpRequest',
  'variables',
  \`${escapedUserCode}
return main;\`
);
const main = _userFn(
  _safeRequire, _safeConsole, SystemHelper,
  countToken, strToBase64, createHmac, delay, httpRequest,
  variables
);

// ===== 执行 =====
try {
  const _result = await main(variables);
  // undefined/void 返回值序列化为 null，避免 JSON.stringify 返回 undefined
  process.stdout.write('__SANDBOX_RESULT__:' + JSON.stringify(_result === undefined ? null : _result));
  process.stderr.write(_logs.join('\\n'));
} catch (err) {
  process.stdout.write('__SANDBOX_RESULT__:' + JSON.stringify({ error: err?.message ?? String(err) }));
}
`;
}
