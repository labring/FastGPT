/**
 * Worker 长驻进程 - 真正的 TS 源文件
 *
 * 启动后先从 stdin 读取第一行作为初始化配置（allowedModules 等），
 * 然后进入主循环，逐行接收任务执行。
 *
 * 协议：
 *   第 1 行：{"type":"init","allowedModules":["lodash","dayjs",...]}
 *   后续每行：{"code":"...","variables":{},"timeoutMs":10000}
 *   每行输出：{"success":true,"data":{...}} 或 {"success":false,"message":"..."}
 */
import { createInterface } from 'readline';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as net from 'net';
const _OriginalFunction = Function;

// ===== 安全 shim =====
// 只拦截对 Function 相关原型的访问，防止通过原型链拿到原始构造器
// 不再全局覆盖 Object.getPrototypeOf，避免破坏 lodash 等合法库
const _origGetProto = Object.getPrototypeOf;
const _origReflectGetProto = Reflect.getPrototypeOf;
const _blockedProtos = new Set<any>([_OriginalFunction.prototype]);

Object.getPrototypeOf = function (obj: any) {
  const proto = _origGetProto(obj);
  if (_blockedProtos.has(proto)) return Object.create(null) as any;
  return proto;
};
Reflect.getPrototypeOf = function (obj: any): any {
  const proto = _origReflectGetProto(obj);
  if (_blockedProtos.has(proto)) return Object.create(null);
  return proto;
};
Object.setPrototypeOf = () => false as any;
Reflect.setPrototypeOf = () => false;
if ((Error as any).prepareStackTrace) delete (Error as any).prepareStackTrace;
if ((Error as any).captureStackTrace) delete (Error as any).captureStackTrace;

const _SafeFunction = function (..._args: any[]) {
  throw new Error('Function constructor is not allowed in sandbox');
} as unknown as FunctionConstructor;
Object.defineProperty(_SafeFunction, 'prototype', {
  value: _OriginalFunction.prototype,
  writable: false,
  configurable: false
});
Object.defineProperty(_OriginalFunction.prototype, 'constructor', {
  value: _SafeFunction,
  writable: false,
  configurable: false
});
(globalThis as any).Function = _SafeFunction;

// 锁定 AsyncFunction、GeneratorFunction、AsyncGeneratorFunction 构造器
// 防止通过 (async function(){}).constructor("...") 绕过沙盒
const _AsyncFunction = async function () {}.constructor;
const _GeneratorFunction = function* () {}.constructor;
const _AsyncGeneratorFunction = async function* () {}.constructor;

for (const FnCtor of [_AsyncFunction, _GeneratorFunction, _AsyncGeneratorFunction]) {
  Object.defineProperty(FnCtor.prototype, 'constructor', {
    value: _SafeFunction,
    writable: false,
    configurable: false
  });
}

// C2: Bun API 在用户代码中通过函数参数遮蔽来阻止访问（见 userFn 构造处）
// 不在全局移除，因为 Bun 运行时自身依赖 globalThis.Bun

(globalThis as any).fetch = undefined;
(globalThis as any).XMLHttpRequest = undefined;
(globalThis as any).WebSocket = undefined;

// ===== process 对象加固 =====
// 保存 worker 自身需要的引用
const _workerStdout = process.stdout;
const _workerStdin = process.stdin;

if (typeof process !== 'undefined') {
  // 删除危险方法
  const dangerousMethods = [
    'binding',
    'dlopen',
    '_linkedBinding',
    'kill',
    'chdir',
    'exit',
    'emitWarning',
    'send',
    'disconnect',
    '_debugProcess',
    '_debugEnd',
    '_startProfilerIdleNotifier',
    '_stopProfilerIdleNotifier',
    'reallyExit',
    'abort',
    'umask',
    'setuid',
    'setgid',
    'seteuid',
    'setegid',
    'setgroups',
    'initgroups'
  ];
  for (const method of dangerousMethods) {
    try {
      Object.defineProperty(process, method, {
        value: undefined,
        writable: false,
        configurable: false
      });
    } catch {}
  }

  // 清理 env 敏感变量并冻结
  const sensitivePatterns = [
    /secret/i,
    /password/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
    /private/i,
    /aws/i,
    /api_key/i,
    /apikey/i
  ];
  for (const key of Object.keys(process.env)) {
    if (sensitivePatterns.some((p) => p.test(key))) {
      delete process.env[key];
    }
  }
  Object.freeze(process.env);
}

// ===== 网络安全 =====
function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIP(rawIp: string): boolean {
  let ip = rawIp;
  if (!ip) return true;
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  if (!net.isIPv4(ip)) return false;
  const ipLong = ipToLong(ip);
  const cidrs: [string, number][] = [
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['169.254.0.0', 16],
    ['127.0.0.0', 8],
    ['0.0.0.0', 8]
  ];
  for (const [base, bits] of cidrs) {
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    if ((ipLong & mask) === (ipToLong(base) & mask)) return true;
  }
  return false;
}

function dnsResolve(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses.map((a: any) => a.address));
    });
  });
}

const REQUEST_LIMITS = {
  maxRequests: 30,
  timeoutMs: 60000,
  maxResponseSize: 10 * 1024 * 1024,
  maxRequestBodySize: 5 * 1024 * 1024,
  allowedProtocols: ['http:', 'https:']
};

let requestCount = 0;

// ===== Legacy global functions (backward compatibility, not on SystemHelper) =====
function countToken(text: any): number {
  return Math.ceil(String(text).length / 4);
}
function strToBase64(str: string, prefix = ''): string {
  return prefix + Buffer.from(str, 'utf-8').toString('base64');
}
function createHmac(algorithm: string, secret: string) {
  const timestamp = Date.now().toString();
  const stringToSign = timestamp + '\n' + secret;
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(stringToSign, 'utf8');
  return { timestamp, sign: encodeURIComponent(hmac.digest('base64')) };
}
function delay(ms: number): Promise<void> {
  if (ms > 10000) throw new Error('Delay must be <= 10000ms');
  return new Promise((r) => setTimeout(r, ms));
}

// ===== SystemHelper =====
const SystemHelper = {
  async httpRequest(url: string, opts: any = {}): Promise<any> {
    if (++requestCount > REQUEST_LIMITS.maxRequests) {
      throw new Error('Request limit exceeded');
    }
    const parsed = new URL(url);
    if (!REQUEST_LIMITS.allowedProtocols.includes(parsed.protocol)) {
      throw new Error('Protocol not allowed');
    }
    const ips = await dnsResolve(parsed.hostname);
    for (const ip of ips) {
      if (isBlockedIP(ip)) throw new Error('Request to private network not allowed');
    }
    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    const body =
      opts.body != null
        ? typeof opts.body === 'string'
          ? opts.body
          : JSON.stringify(opts.body)
        : null;
    if (body && body.length > REQUEST_LIMITS.maxRequestBodySize) {
      throw new Error('Request body too large');
    }
    const timeoutSeconds =
      typeof opts.timeout === 'number' && Number.isFinite(opts.timeout) && opts.timeout > 0
        ? opts.timeout
        : REQUEST_LIMITS.timeoutMs / 1000;
    const timeout = Math.min(Math.ceil(timeoutSeconds * 1000), REQUEST_LIMITS.timeoutMs);
    if (body && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    const resolvedIP = ips[0];
    if (!headers['Host'] && !headers['host']) {
      headers['Host'] = parsed.hostname + (parsed.port ? ':' + parsed.port : '');
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          method,
          headers,
          timeout,
          hostname: resolvedIP,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          servername: parsed.hostname
        },
        (res: any) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > REQUEST_LIMITS.maxResponseSize) {
              req.destroy();
              reject(new Error('Response too large'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            const data = Buffer.concat(chunks).toString('utf-8');
            const h: Record<string, any> = {};
            for (const [k, v] of Object.entries(res.headers)) h[k] = v;
            resolve({ status: res.statusCode, statusText: res.statusMessage, headers: h, data });
          });
          res.on('error', reject);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
};

const httpRequest = SystemHelper.httpRequest;

// ===== 模块白名单（启动后由 init 消息设置）=====
let allowedModules = new Set<string>();
const origRequire = require;
const safeRequire = new Proxy(origRequire, {
  apply(target, thisArg, args) {
    if (!allowedModules.has(args[0])) {
      throw new Error(`Module '${args[0]}' is not allowed in sandbox`);
    }
    return Reflect.apply(target, thisArg, args);
  }
});

// ===== 输出辅助 =====
function writeLine(obj: any): void {
  _workerStdout.write(JSON.stringify(obj) + '\n');
}

// ===== 主循环 =====
const rl = createInterface({ input: _workerStdin, terminal: false });
let initialized = false;

rl.on('line', async (line: string) => {
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    writeLine({ success: false, message: 'Invalid JSON input' });
    return;
  }

  // 第一条消息：初始化配置
  if (!initialized) {
    if (msg.type === 'init') {
      allowedModules = new Set(msg.allowedModules || []);
      // 从 init 消息读取请求限制（由 process-pool 从 config 传入）
      if (msg.requestLimits) {
        if (msg.requestLimits.maxRequests != null)
          REQUEST_LIMITS.maxRequests = msg.requestLimits.maxRequests;
        if (msg.requestLimits.timeoutMs != null)
          REQUEST_LIMITS.timeoutMs = msg.requestLimits.timeoutMs;
        if (msg.requestLimits.maxResponseSize != null)
          REQUEST_LIMITS.maxResponseSize = msg.requestLimits.maxResponseSize;
        if (msg.requestLimits.maxRequestBodySize != null)
          REQUEST_LIMITS.maxRequestBodySize = msg.requestLimits.maxRequestBodySize;
      }
      writeLine({ type: 'ready' });
      initialized = true;
    } else {
      writeLine({ success: false, message: 'Expected init message' });
    }
    return;
  }

  // ping 健康检查：立即回复 pong
  if (msg.type === 'ping') {
    writeLine({ type: 'pong' });
    return;
  }

  // 后续消息：执行任务
  const { code, variables, timeoutMs } = msg;
  requestCount = 0; // 每次任务重置

  const logs: string[] = [];
  let logSize = 0;
  const MAX_LOG_SIZE = 1024 * 1024; // 1MB
  const safeConsole = {
    log(...args: any[]) {
      const line = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      if (logSize + line.length <= MAX_LOG_SIZE) {
        logs.push(line);
        logSize += line.length;
      }
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // 静态检查：拦截 import() 动态导入，防止绕过 require 白名单
    // 匹配 import( 但排除注释中的（简单启发式）
    if (/\bimport\s*\(/.test(code)) {
      writeLine({
        success: false,
        message: 'Dynamic import() is not allowed in sandbox. Use require() instead.'
      });
      return;
    }

    const resultPromise = (async () => {
      // C2 + #19: 通过函数参数遮蔽危险全局对象，用户代码无法访问 Bun/process/globalThis
      const _sandboxProcess = Object.freeze({
        env: Object.freeze({}),
        cwd: () => '/sandbox',
        version: process.version,
        platform: process.platform
      });
      const userFn = new (_OriginalFunction as any)(
        'require',
        'console',
        'SystemHelper',
        'countToken',
        'strToBase64',
        'createHmac',
        'delay',
        'httpRequest',
        'variables',
        'Bun',
        'process',
        'globalThis',
        'global',
        code + '\nreturn main;'
      );
      const main = userFn(
        safeRequire,
        safeConsole,
        SystemHelper,
        countToken,
        strToBase64,
        createHmac,
        delay,
        httpRequest,
        variables || {},
        undefined,
        _sandboxProcess,
        undefined,
        undefined
      );
      return await main(variables || {});
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Script execution timed out after ${timeoutMs}ms`)),
        timeoutMs || 10000
      );
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);
    clearTimeout(timer);
    writeLine({
      success: true,
      data: { codeReturn: result === undefined ? null : result, log: logs.join('\n') }
    });
  } catch (err: any) {
    clearTimeout(timer);
    writeLine({ success: false, message: err?.message ?? String(err) });
  }
});
