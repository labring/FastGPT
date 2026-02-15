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

const TMPDIR = process.env.SANDBOX_TMPDIR;
const DISK_LIMIT = ${limits.diskMB} * 1024 * 1024;
let _diskUsed = 0;

function _safePath(userPath) {
  const resolved = _path.resolve(TMPDIR, userPath);
  const rel = _path.relative(TMPDIR, resolved);
  if (rel.startsWith('..') || _path.isAbsolute(rel)) {
    throw new Error('Path traversal not allowed');
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

  fs: {
    writeFile(path, content) {
      const safe = _safePath(path);
      const bytes = Buffer.byteLength(content, 'utf-8');
      if (_diskUsed + bytes > DISK_LIMIT) {
        throw new Error('Disk quota exceeded: ${limits.diskMB}MB limit');
      }
      const dir = _path.dirname(safe);
      if (!_fs.existsSync(dir)) {
        _fs.mkdirSync(dir, { recursive: true });
      }
      _fs.writeFileSync(safe, content, 'utf-8');
      _diskUsed += bytes;
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
const _userFn = new Function(
  'require', 'console', 'SystemHelper',
  'countToken', 'strToBase64', 'createHmac', 'delay',
  'variables',
  \`${escapedUserCode}
return main;\`
);
const main = _userFn(
  _safeRequire, _safeConsole, SystemHelper,
  countToken, strToBase64, createHmac, delay,
  variables
);

// ===== 执行 =====
try {
  const _result = await main(variables);
  process.stdout.write(JSON.stringify(_result));
  process.stderr.write(_logs.join('\\n'));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err?.message ?? String(err) }));
}
`;
}
