/**
 * JS 沙箱子进程入口
 *
 * 启动后先从 stdin 读取第一行作为初始化配置（allowedModules 等），
 * 然后接收用户任务执行。生产环境由进程池保证每个进程只执行一个用户任务；
 * 循环协议仅保留 ping/HTTP RPC 和非 Linux 本地调试兼容。
 *
 * 协议：
 *   第 1 行：{"type":"init","allowedModules":["lodash","dayjs",...]}
 *   后续每行：{"code":"...","variables":{},"timeoutMs":10000}
 *   每行输出：{"success":true,"data":{...}} 或 {"success":false,"message":"..."}
 */
import { createInterface } from 'readline';
import { createRequire } from 'module';
import * as crypto from 'crypto';
import { parse } from 'acorn';
import { simple as walk } from 'acorn-walk';

const require = createRequire(import.meta.url);
const _OriginalFunction = Function;
const _JSONParse = JSON.parse.bind(JSON);
const _JSONStringify = JSON.stringify.bind(JSON);
const _ObjectFreeze = Object.freeze;
const _ObjectDefineProperty = Object.defineProperty;
const _ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const _ObjectKeys = Object.keys;
const _OriginalProxy = Proxy;
const _ReflectGet = Reflect.get.bind(Reflect);
const _ReflectApply = Reflect.apply.bind(Reflect);
const _ReflectConstruct = Reflect.construct.bind(Reflect);
const _OriginalPromise = Promise;
const _PromiseRace = Promise.race.bind(Promise);
const _OriginalError = Error;
const _workerSetTimeout = setTimeout.bind(globalThis);
const _workerClearTimeout = clearTimeout.bind(globalThis);
const _workerSetInterval = setInterval.bind(globalThis);
const _workerClearInterval = clearInterval.bind(globalThis);
type WorkerTimeoutHandle = ReturnType<typeof _workerSetTimeout>;
type WorkerIntervalHandle = ReturnType<typeof _workerSetInterval>;
type WorkerTimerHandle = WorkerTimeoutHandle | WorkerIntervalHandle | number;
const DYNAMIC_IMPORT_ERROR_MESSAGE =
  'Dynamic import() is not allowed in sandbox. Use require() instead.';
const EVAL_ERROR_MESSAGE = 'Code generation with eval() is not allowed in sandbox.';

function lockGlobal(name: string, value = (globalThis as any)[name]): void {
  try {
    _ObjectDefineProperty(globalThis, name, {
      value,
      writable: false,
      configurable: false
    });
  } catch {}
}

function assertNoDynamicImport(code: string): void {
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowReturnOutsideFunction: true
  });

  // 通过 AST 识别真实 import() 表达式，避免注释/换行绕过正则检查。
  walk(ast, {
    ImportExpression() {
      throw new Error(DYNAMIC_IMPORT_ERROR_MESSAGE);
    }
  });
}

const readonlyViews = new WeakMap<object, any>();
const readonlyRawValues = new WeakMap<object, object>();
function unwrapReadonly<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value;
  }
  return (readonlyRawValues.get(value as object) as T) || value;
}
function readonlyView<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value;
  }

  const obj = value as object;
  const existing = readonlyViews.get(obj);
  if (existing) return existing;

  const proxy = new _OriginalProxy(obj as any, {
    get(target, prop) {
      return readonlyView(_ReflectGet(target, prop, target));
    },
    getOwnPropertyDescriptor(target, prop) {
      const descriptor = _ObjectGetOwnPropertyDescriptor(target, prop);
      if (!descriptor || !('value' in descriptor) || descriptor.configurable === false) {
        return descriptor;
      }
      return { ...descriptor, value: readonlyView(descriptor.value) };
    },
    set() {
      throw new Error('Sandbox module exports are read-only');
    },
    defineProperty() {
      throw new Error('Sandbox module exports are read-only');
    },
    deleteProperty() {
      throw new Error('Sandbox module exports are read-only');
    },
    setPrototypeOf() {
      throw new Error('Sandbox module exports are read-only');
    },
    apply(target, thisArg, argArray) {
      return readonlyView(
        _ReflectApply(
          target,
          unwrapReadonly(thisArg),
          Array.from(argArray, (item) => unwrapReadonly(item))
        )
      );
    },
    construct(target, argArray, newTarget) {
      return readonlyView(
        _ReflectConstruct(
          target,
          Array.from(argArray, (item) => unwrapReadonly(item)),
          newTarget
        )
      );
    }
  });

  readonlyViews.set(obj, proxy);
  readonlyRawValues.set(proxy, obj);
  return proxy;
}

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
const _SafeEval = function (..._args: any[]) {
  throw new Error(EVAL_ERROR_MESSAGE);
} as typeof eval;
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
lockGlobal('Function', _SafeFunction);
lockGlobal('eval', _SafeEval);

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

const hardenedIntrinsics = [
  Object,
  Object.prototype,
  Array,
  Array.prototype,
  Function.prototype,
  _AsyncFunction.prototype,
  _GeneratorFunction.prototype,
  _AsyncGeneratorFunction.prototype,
  JSON,
  Math,
  Reflect,
  Promise,
  Promise.prototype,
  Proxy,
  RegExp,
  RegExp.prototype,
  Date,
  Date.prototype,
  Error,
  Error.prototype,
  Map,
  Map.prototype,
  Set,
  Set.prototype,
  WeakMap,
  WeakMap.prototype,
  WeakSet,
  WeakSet.prototype,
  String,
  String.prototype,
  Number,
  Number.prototype,
  Boolean,
  Boolean.prototype,
  Symbol,
  Symbol.prototype,
  BigInt,
  BigInt.prototype,
  ArrayBuffer,
  ArrayBuffer.prototype,
  DataView,
  DataView.prototype,
  Uint8Array,
  Uint8Array.prototype,
  Uint16Array,
  Uint16Array.prototype,
  Uint32Array,
  Uint32Array.prototype,
  Int8Array,
  Int8Array.prototype,
  Int16Array,
  Int16Array.prototype,
  Int32Array,
  Int32Array.prototype,
  Float32Array,
  Float32Array.prototype,
  Float64Array,
  Float64Array.prototype,
  URL,
  URL.prototype,
  URLSearchParams,
  URLSearchParams.prototype,
  TextEncoder,
  TextEncoder.prototype,
  TextDecoder,
  TextDecoder.prototype,
  Buffer,
  Buffer.prototype,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
] as const;

const lockedGlobalNames = [
  'Object',
  'Array',
  'Function',
  'JSON',
  'Math',
  'Reflect',
  'Promise',
  'Proxy',
  'RegExp',
  'Date',
  'Error',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'ArrayBuffer',
  'DataView',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'Buffer',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'process'
] as const;

// C2: Bun API 在用户代码中通过函数参数遮蔽来阻止访问（见 userFn 构造处）
// 不在全局移除，因为 Bun 运行时自身依赖 globalThis.Bun

lockGlobal('fetch', undefined);
lockGlobal('XMLHttpRequest', undefined);
lockGlobal('WebSocket', undefined);

// ===== process 对象加固 =====
// 保存 worker 自身需要的引用
const _workerStdout = process.stdout;
const _workerStdin = process.stdin;

// 启动期立即删除：与 worker 自身/白名单模块无依赖关系
const earlyDangerousMethods = [
  'binding',
  '_linkedBinding',
  'chdir',
  'send',
  'disconnect',
  '_debugProcess',
  '_debugEnd',
  '_startProfilerIdleNotifier',
  '_stopProfilerIdleNotifier',
  'reallyExit',
  'umask',
  'setuid',
  'setgid',
  'seteuid',
  'setegid',
  'setgroups',
  'initgroups'
];

// 延迟处理：会被 https/dns/tsx/url 等内部使用，要等 hardenRuntime 预加载完白名单后再收紧。
const lateDangerousMethods = ['dlopen', 'kill', 'exit', 'abort'];

function deleteProcessMethods(methods: readonly string[]): void {
  for (const method of methods) {
    try {
      Object.defineProperty(process, method, {
        value: undefined,
        writable: false,
        configurable: false
      });
    } catch {}
  }
}

function stubProcessMethods(methods: readonly string[]): void {
  for (const method of methods) {
    try {
      Object.defineProperty(process, method, {
        value: () => undefined,
        writable: false,
        configurable: false
      });
    } catch {}
  }
}

if (typeof process !== 'undefined') {
  deleteProcessMethods(earlyDangerousMethods);

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
  // Node 的 process.env 是 host-protected 的 Proxy，不能直接 freeze。
  // 用 try/catch 兜底：Bun 下能 freeze（保留原行为），Node 下静默跳过
  // （后续 process.env 已通过函数参数遮蔽，用户代码本就拿不到）
  try {
    _ObjectFreeze(process.env);
  } catch {
    /* ignore: Node process.env not freezable */
  }
}

const REQUEST_LIMITS = {
  maxRequests: 30,
  timeoutMs: 60000,
  maxResponseSize: 10 * 1024 * 1024,
  maxRequestBodySize: 5 * 1024 * 1024,
  maxOutputSize: 10 * 1024 * 1024,
  allowedProtocols: ['http:', 'https:']
};

let httpRpcSequence = 0;
const pendingHttpRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason: Error) => void }
>();

/** 将联网操作交给未进入 seccomp 的可信父进程执行。 */
function callParentHttpProxy(payload: Record<string, any>): Promise<any> {
  const id = `http-${++httpRpcSequence}`;
  return new _OriginalPromise((resolve, reject) => {
    pendingHttpRequests.set(id, { resolve, reject });
    writeLine({ type: 'http_request', id, payload });
  });
}

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

// ===== SystemHelper =====
const SystemHelper = {
  async httpRequest(url: string, opts: any = {}): Promise<any> {
    return callParentHttpProxy({ url, ...opts });
  }
};
_ObjectFreeze(SystemHelper);

const httpRequest = SystemHelper.httpRequest;

// ===== 模块白名单（启动后由 init 消息设置）=====
let allowedModules = new Set<string>();
const origRequire = require;
let runtimeHardened = false;
function hardenRuntime(): void {
  if (runtimeHardened) return;

  for (const moduleName of allowedModules) {
    try {
      origRequire(moduleName);
    } catch {}
  }

  // 白名单模块已加载完毕，此时再删除 kill/exit/abort：
  // 这些方法仅在模块初始化时被 https/dns/tsx 等使用，预加载后不再需要。
  deleteProcessMethods(lateDangerousMethods);
  // Node 内置 url.parse 在运行时仍会调用 process.emitWarning。
  // 用户代码拿到的是下方 _sandboxProcess，这里只给真实 process 保留不可写 no-op 兼容内置模块。
  stubProcessMethods(['emitWarning']);

  for (const intrinsic of hardenedIntrinsics) {
    if (intrinsic) _ObjectFreeze(intrinsic);
  }

  for (const name of lockedGlobalNames) {
    lockGlobal(name);
  }

  runtimeHardened = true;
}
function getRequireCacheKeys(): Set<string> {
  return new Set(_ObjectKeys(origRequire.cache || {}));
}
function cleanupUserRequireCache(cacheKeysBeforeTask: Set<string>): void {
  for (const key of _ObjectKeys(origRequire.cache || {})) {
    if (!cacheKeysBeforeTask.has(key)) {
      delete origRequire.cache[key];
    }
  }
}
function safeRequire(moduleName: string) {
  if (!allowedModules.has(moduleName)) {
    throw new Error(`Module '${moduleName}' is not allowed in sandbox`);
  }
  return readonlyView(origRequire(moduleName));
}
const safeRequireResolve = _ObjectFreeze((moduleName: string) => {
  if (!allowedModules.has(moduleName)) {
    throw new Error(`Module '${moduleName}' is not allowed in sandbox`);
  }
  return origRequire.resolve(moduleName);
});
Object.defineProperty(safeRequire, 'resolve', {
  value: safeRequireResolve,
  writable: false,
  configurable: false
});
_ObjectFreeze(safeRequire.prototype);
_ObjectFreeze(safeRequire);

// ===== 输出辅助 =====
function writeLine(obj: any): void {
  let line: string;
  try {
    line = _JSONStringify(obj);
  } catch (err: any) {
    line = _JSONStringify({
      success: false,
      message: `Failed to serialize output: ${err?.message ?? String(err)}`,
      workerRecycle: 'output_serialize'
    });
  }

  if (Buffer.byteLength(line, 'utf8') > REQUEST_LIMITS.maxOutputSize) {
    line = _JSONStringify({
      success: false,
      message: `Output too large (limit: ${REQUEST_LIMITS.maxOutputSize} bytes)`,
      workerRecycle: 'output_limit'
    });
  }

  _workerStdout.write(line + '\n');
}

// ===== 主循环 =====
const rl = createInterface({ input: _workerStdin, terminal: false });
let initialized = false;

rl.on('line', async (line: string) => {
  let msg: any;
  try {
    msg = _JSONParse(line);
  } catch {
    writeLine({ success: false, message: 'Invalid JSON input' });
    return;
  }

  if (msg.type === 'http_response') {
    const pending = pendingHttpRequests.get(msg.id);
    if (!pending) return;
    pendingHttpRequests.delete(msg.id);
    if (msg.success) pending.resolve(msg.payload);
    else pending.reject(new _OriginalError(msg.message || 'HTTP request failed'));
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
        if (msg.requestLimits.maxOutputSize != null)
          REQUEST_LIMITS.maxOutputSize = msg.requestLimits.maxOutputSize;
      }
      // 先加载白名单与 native addon；进入 seccomp 后不再允许动态装载原生代码。
      for (const moduleName of allowedModules) {
        try {
          origRequire(moduleName);
        } catch {}
      }
      if (msg.nativeIsolation?.enabled) {
        const addon = origRequire(msg.nativeIsolation.addonPath);
        addon.init({
          uid: msg.nativeIsolation.uid,
          gid: msg.nativeIsolation.gid,
          cwd: msg.nativeIsolation.cwd
        });
      }
      hardenRuntime();
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
  const logs: string[] = [];
  let logSize = 0;
  const MAX_LOG_SIZE = 1024 * 1024; // 1MB
  const _consoleLog = (...args: any[]) => {
    const line = args.map((a) => (typeof a === 'object' ? _JSONStringify(a) : String(a))).join(' ');
    if (logSize + line.length <= MAX_LOG_SIZE) {
      logs.push(line);
      logSize += line.length;
    }
  };
  const safeConsole = {
    log: _consoleLog,
    info: _consoleLog,
    warn: _consoleLog,
    error: _consoleLog,
    debug: _consoleLog,
    trace: _consoleLog,
    dir: _consoleLog,
    table: _consoleLog
  };
  const activeTimeouts = new Set<WorkerTimerHandle>();
  const activeIntervals = new Set<WorkerTimerHandle>();
  const safeSetTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
    if (typeof handler !== 'function') {
      throw new Error('setTimeout expects a function');
    }
    const timer = _workerSetTimeout(
      (...callbackArgs: any[]) => {
        activeTimeouts.delete(timer);
        try {
          handler(...callbackArgs);
        } catch (err: any) {
          _consoleLog(err?.message ?? String(err));
        }
      },
      timeout,
      ...args
    );
    activeTimeouts.add(timer);
    return timer;
  };
  const safeClearTimeout = (timer: WorkerTimerHandle) => {
    activeTimeouts.delete(timer);
    _workerClearTimeout(timer as WorkerTimeoutHandle);
  };
  const safeSetInterval = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
    if (typeof handler !== 'function') {
      throw new Error('setInterval expects a function');
    }
    const timer = _workerSetInterval(() => {
      try {
        handler(...args);
      } catch (err: any) {
        _consoleLog(err?.message ?? String(err));
      }
    }, timeout);
    activeIntervals.add(timer);
    return timer;
  };
  const safeClearInterval = (timer: WorkerTimerHandle) => {
    activeIntervals.delete(timer);
    _workerClearInterval(timer as WorkerIntervalHandle);
  };
  const cleanupUserTimers = () => {
    for (const timer of activeTimeouts) {
      _workerClearTimeout(timer as WorkerTimeoutHandle);
    }
    activeTimeouts.clear();
    for (const timer of activeIntervals) {
      _workerClearInterval(timer as WorkerIntervalHandle);
    }
    activeIntervals.clear();
  };
  const safeDelay = (ms: number): Promise<void> => {
    if (ms > 10000) throw new Error('Delay must be <= 10000ms');
    return new _OriginalPromise((resolve) => {
      safeSetTimeout(resolve, ms);
    });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const requireCacheKeysBeforeTask = getRequireCacheKeys();
  try {
    assertNoDynamicImport(code);

    const resultPromise = (async () => {
      // C2 + #19: 通过函数参数遮蔽危险全局对象，用户代码无法访问 Bun/process/globalThis
      const _sandboxProcess = _ObjectFreeze({
        env: _ObjectFreeze({}),
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
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Object',
        'Array',
        'JSON',
        'Reflect',
        'Promise',
        'Math',
        'RegExp',
        'Date',
        'Error',
        'Map',
        'Set',
        'WeakMap',
        'WeakSet',
        'String',
        'Number',
        'Boolean',
        'Symbol',
        'BigInt',
        'ArrayBuffer',
        'DataView',
        'Uint8Array',
        'Uint16Array',
        'Uint32Array',
        'Int8Array',
        'Int16Array',
        'Int32Array',
        'Float32Array',
        'Float64Array',
        'Buffer',
        'URL',
        'URLSearchParams',
        'TextEncoder',
        'TextDecoder',
        '"use strict";\n' + code + '\nreturn main;'
      );
      const main = userFn(
        safeRequire,
        safeConsole,
        SystemHelper,
        countToken,
        strToBase64,
        createHmac,
        safeDelay,
        httpRequest,
        variables || {},
        undefined,
        _sandboxProcess,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        safeSetTimeout,
        safeClearTimeout,
        safeSetInterval,
        safeClearInterval,
        Object,
        Array,
        JSON,
        Reflect,
        Promise,
        Math,
        RegExp,
        Date,
        Error,
        Map,
        Set,
        WeakMap,
        WeakSet,
        String,
        Number,
        Boolean,
        Symbol,
        BigInt,
        ArrayBuffer,
        DataView,
        Uint8Array,
        Uint16Array,
        Uint32Array,
        Int8Array,
        Int16Array,
        Int32Array,
        Float32Array,
        Float64Array,
        Buffer,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder
      );
      return await main(variables || {});
    })();

    const timeoutPromise = new _OriginalPromise((_, reject) => {
      timer = _workerSetTimeout(() => {
        timedOut = true;
        reject(new _OriginalError(`Script execution timed out after ${timeoutMs}ms`));
      }, timeoutMs || 10000);
    });

    const result = await _PromiseRace([resultPromise, timeoutPromise]);
    _workerClearTimeout(timer);
    writeLine({
      success: true,
      data: { codeReturn: result === undefined ? null : result, log: logs.join('\n') }
    });
  } catch (err: any) {
    _workerClearTimeout(timer);
    writeLine({
      success: false,
      message: err?.message ?? String(err),
      ...(timedOut ? { workerRecycle: 'timeout' } : {})
    });
  } finally {
    cleanupUserTimers();
    cleanupUserRequireCache(requireCacheKeysBeforeTask);
  }
});
