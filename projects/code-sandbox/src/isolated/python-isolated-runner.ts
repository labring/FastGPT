import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { env, RUNTIME_MEMORY_OVERHEAD_MB } from '../env';
import type { ExecuteOptions, ExecuteResult } from '../types';
import { Semaphore } from '../utils/semaphore';
import { getErrText } from '../utils';
import { getLogger, LogCategories } from '../utils/logger';
import {
  getProcessTreeRSSMB,
  killProcessTree,
  PROCESS_GROUP_SUPPORTED
} from '../utils/process-tree';
import {
  runSandboxHttpRequest,
  type SandboxHttpRequestPayload,
  type SandboxHttpState
} from '../utils/sandbox-http';
import {
  assertPythonNativeIsolationReady,
  getBundledPythonNativeLibraryPath,
  PYTHON_ENABLE_NETWORK_SYSCALLS,
  PYTHON_SANDBOX_GID,
  PYTHON_SANDBOX_ROOT,
  PYTHON_SANDBOX_UID,
  shouldEnablePythonNativeIsolation
} from './python-isolation-config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_SCRIPT = join(__dirname, 'python-bootstrap.py');
const NATIVE_SANDBOX_LIBRARY = getBundledPythonNativeLibraryPath(__dirname);
const RSS_POLL_INTERVAL = 500;
const serverLogger = getLogger(LogCategories.MODULE.SANDBOX.SERVER);

type RunningChild = {
  proc: ChildProcess;
  stderrBuf: string[];
  stdoutRl: ReturnType<typeof createInterface>;
  stderrRl: ReturnType<typeof createInterface>;
  lineHandler?: (line: string) => void;
  closeHandler?: (code: number | null, signal: NodeJS.Signals | null) => void;
  errorHandler?: (err: Error) => void;
};

/**
 * PythonIsolatedRunner 使用 one-shot 预热池执行 Python 代码。
 *
 * 预热进程只完成 bootstrap 和 native seccomp/chroot/降权初始化，尚未执行任何用户
 * 代码。每个预热进程最多接收一条任务，任务结束后销毁并异步补充新的干净进程，
 * 避免用户代码污染后续任务。
 */
export class PythonIsolatedRunner {
  private readonly semaphore: Semaphore;
  private readonly running = new Set<RunningChild>();
  private readonly idleChildren = new Set<RunningChild>();
  private readonly warmingChildren = new Set<RunningChild>();
  private readonly warmIdleTarget: number;
  private ready = false;

  constructor(private readonly maxConcurrency = env.SANDBOX_POOL_SIZE) {
    this.semaphore = new Semaphore(maxConcurrency);
    this.warmIdleTarget = maxConcurrency;
  }

  async init(): Promise<void> {
    assertPythonNativeIsolationReady(NATIVE_SANDBOX_LIBRARY);
    this.ready = true;
    await this.replenishWarmChildren(true);
    serverLogger.info(
      `PythonIsolatedRunner ready: maxConcurrency=${this.maxConcurrency}, ` +
        `warmIdleTarget=${this.warmIdleTarget}, nativeIsolation=${shouldEnablePythonNativeIsolation()}`
    );
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    for (const child of [...this.running, ...this.idleChildren, ...this.warmingChildren]) {
      killProcessTree(child.proc.pid);
      this.cleanupChild(child);
    }
    this.running.clear();
    this.idleChildren.clear();
    this.warmingChildren.clear();
  }

  get stats() {
    const semaphoreStats = this.semaphore.stats;
    return {
      total: this.running.size + this.idleChildren.size + this.warmingChildren.size,
      idle: this.idleChildren.size,
      busy: this.running.size,
      queued: semaphoreStats.queued,
      poolSize: semaphoreStats.max
    };
  }

  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { code, variables } = options;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return { success: false, message: 'Code cannot be empty' };
    }

    await this.semaphore.acquire();
    try {
      if (!this.ready) {
        return { success: false, message: 'Python isolated runner is not ready' };
      }
      return await this.executeOneShot({ code, variables: variables || {} });
    } finally {
      this.semaphore.release();
      void this.replenishWarmChildren();
    }
  }

  private async executeOneShot(task: {
    code: string;
    variables: Record<string, any>;
  }): Promise<ExecuteResult> {
    const child = this.takeIdleChild() ?? this.createChild();
    this.running.add(child);
    return this.executeWithChild(child, task);
  }

  private takeIdleChild(): RunningChild | undefined {
    const child = this.idleChildren.values().next().value;
    if (!child) return undefined;
    this.idleChildren.delete(child);
    if (child.closeHandler) child.proc.off('close', child.closeHandler);
    if (child.errorHandler) child.proc.off('error', child.errorHandler);
    child.closeHandler = undefined;
    child.errorHandler = undefined;
    return child;
  }

  private createChild(): RunningChild {
    const proc = spawn('python3', ['-u', BOOTSTRAP_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: PROCESS_GROUP_SUPPORTED,
      cwd: shouldEnablePythonNativeIsolation() ? PYTHON_SANDBOX_ROOT : undefined,
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        CHECK_INTERNAL_IP: String(env.CHECK_INTERNAL_IP),
        PYTHONISOLATED: '1',
        HOME: '/tmp',
        TMPDIR: '/tmp',
        MPLCONFIGDIR: '/tmp/matplotlib',
        PYTHONDONTWRITEBYTECODE: '1',
        // numpy/OpenBLAS may create worker threads while importing native extensions.
        // Keep it single-threaded so seccomp does not need to allow clone/fork.
        OPENBLAS_NUM_THREADS: '1',
        OMP_NUM_THREADS: '1',
        MKL_NUM_THREADS: '1',
        NUMEXPR_NUM_THREADS: '1'
      }
    });
    const stdoutRl = createInterface({ input: proc.stdout!, terminal: false });
    const stderrRl = createInterface({ input: proc.stderr!, terminal: false });
    const child: RunningChild = { proc, stderrBuf: [], stdoutRl, stderrRl };

    stderrRl.on('line', (line: string) => {
      child.stderrBuf.push(line);
      if (child.stderrBuf.length > 20) child.stderrBuf.shift();
    });

    return child;
  }

  private cleanupChild(child: RunningChild) {
    try {
      child.proc.stdin?.end();
    } catch {}
    child.stdoutRl.close();
    child.stderrRl.close();
    if (child.lineHandler) child.stdoutRl.off('line', child.lineHandler);
    if (child.closeHandler) child.proc.off('close', child.closeHandler);
    if (child.errorHandler) child.proc.off('error', child.errorHandler);
    child.proc.removeAllListeners();
    this.running.delete(child);
    this.idleChildren.delete(child);
    this.warmingChildren.delete(child);
  }

  private markChildIdle(child: RunningChild) {
    child.closeHandler = (code, signal) => {
      const stderr = child.stderrBuf.length > 0 ? ` | stderr: ${child.stderrBuf.join('\n')}` : '';
      serverLogger.warn(
        `Python warm idle child exited (exit code: ${code}, signal: ${signal})${stderr}`
      );
      this.cleanupChild(child);
      void this.replenishWarmChildren();
    };
    child.errorHandler = (err) => {
      serverLogger.warn(`Python warm idle child error: ${getErrText(err)}`);
      this.cleanupChild(child);
      void this.replenishWarmChildren();
    };
    child.proc.once('close', child.closeHandler);
    child.proc.once('error', child.errorHandler);
    this.idleChildren.add(child);
  }

  private buildIsolationPayload() {
    return {
      enableSeccomp: shouldEnablePythonNativeIsolation(),
      enableNetwork: PYTHON_ENABLE_NETWORK_SYSCALLS,
      libraryPath: NATIVE_SANDBOX_LIBRARY,
      sandboxRoot: PYTHON_SANDBOX_ROOT,
      uid: PYTHON_SANDBOX_UID,
      gid: PYTHON_SANDBOX_GID
    };
  }

  private async replenishWarmChildren(waitForReady = false): Promise<void> {
    if (!this.ready || this.warmIdleTarget <= 0) return;

    const promises: Promise<void>[] = [];
    while (this.idleChildren.size + this.warmingChildren.size < this.warmIdleTarget) {
      const child = this.createChild();
      this.warmingChildren.add(child);
      promises.push(this.prepareWarmChild(child));
    }

    if (waitForReady && promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private prepareWarmChild(child: RunningChild): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (lineHandler) child.stdoutRl.off('line', lineHandler);
        if (closeHandler) child.proc.off('close', closeHandler);
        if (errorHandler) child.proc.off('error', errorHandler);
        this.warmingChildren.delete(child);
        if (ready && this.ready) {
          this.markChildIdle(child);
        } else {
          killProcessTree(child.proc.pid);
          this.cleanupChild(child);
        }
        resolve();
      };

      const lineHandler = (line: string) => {
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'ready') {
            settle(true);
            return;
          }
          if (msg.type === 'result') {
            serverLogger.warn(`Python warm child failed: ${msg.message || line}`);
          } else {
            serverLogger.warn(`Unexpected python warm child message: ${line}`);
          }
        } catch {
          serverLogger.warn(`Invalid python warm child response: ${line}`);
        }
        settle(false);
      };

      const closeHandler = (code: number | null, signal: NodeJS.Signals | null) => {
        const stderr = child.stderrBuf.length > 0 ? ` | stderr: ${child.stderrBuf.join('\n')}` : '';
        serverLogger.warn(
          `Python warm child exited before ready (exit code: ${code}, signal: ${signal})${stderr}`
        );
        settle(false);
      };

      const errorHandler = (err: Error) => {
        serverLogger.warn(`Python warm child spawn error: ${getErrText(err)}`);
        settle(false);
      };

      child.stdoutRl.on('line', lineHandler);
      child.proc.once('close', closeHandler);
      child.proc.once('error', errorHandler);

      try {
        child.proc.stdin!.write(
          JSON.stringify({
            type: 'init',
            isolation: this.buildIsolationPayload()
          }) + '\n'
        );
      } catch (err) {
        serverLogger.warn(`Python warm child communication error: ${getErrText(err)}`);
        settle(false);
      }
    });
  }

  private executeWithChild(
    child: RunningChild,
    task: { code: string; variables: Record<string, any> }
  ): Promise<ExecuteResult> {
    return new Promise<ExecuteResult>((resolve) => {
      const timeoutMs = env.SANDBOX_MAX_TIMEOUT;
      const proc = child.proc;
      const stdoutRl = child.stdoutRl;

      let settled = false;
      let outputBytes = 0;
      let rssTimer: ReturnType<typeof setInterval> | undefined;
      const httpState: SandboxHttpState = { requestCount: 0 };
      const httpLimits = {
        maxRequests: env.SANDBOX_REQUEST_MAX_COUNT,
        timeoutMs: env.SANDBOX_REQUEST_TIMEOUT,
        maxResponseSize: env.SANDBOX_REQUEST_MAX_RESPONSE_MB * 1024 * 1024,
        maxRequestBodySize: env.SANDBOX_REQUEST_MAX_BODY_MB * 1024 * 1024
      };

      const cleanup = () => {
        clearTimeout(timer);
        if (rssTimer) clearInterval(rssTimer);
        this.cleanupChild(child);
      };

      const settle = (result: ExecuteResult, opts: { kill?: boolean } = {}) => {
        if (settled) return;
        settled = true;
        if (opts.kill) {
          killProcessTree(proc.pid);
        }
        cleanup();
        resolve(result);
      };

      child.lineHandler = (line: string) => {
        outputBytes += Buffer.byteLength(line, 'utf8') + 1;
        const maxOutputBytes = env.SANDBOX_MAX_OUTPUT_MB * 1024 * 1024;
        if (outputBytes > maxOutputBytes) {
          settle(
            { success: false, message: `Output too large (limit: ${maxOutputBytes} bytes)` },
            { kill: true }
          );
          return;
        }

        try {
          const msg = JSON.parse(line);
          if (msg.type === 'http_request') {
            this.handleHttpRequestMessage({
              proc,
              id: msg.id,
              payload: msg.payload,
              httpState,
              httpLimits
            }).catch((err) => {
              serverLogger.warn(
                `PythonIsolatedRunner http_request handler failed: ${getErrText(err)}`
              );
            });
            return;
          }
          if (msg.type === 'result') {
            delete msg.type;
            settle(msg as ExecuteResult);
            return;
          }
          settle(
            { success: false, message: `Unknown python runner message: ${msg.type || line}` },
            { kill: true }
          );
        } catch {
          settle(
            { success: false, message: `Invalid python runner response: ${line}` },
            { kill: true }
          );
        }
      };
      stdoutRl.on('line', child.lineHandler);

      child.errorHandler = (err) => {
        settle({ success: false, message: `Python runner spawn error: ${getErrText(err)}` });
      };
      proc.once('error', child.errorHandler);

      // `exit` may fire before stdout/stderr streams are fully drained. Fast
      // Python tasks can therefore exit with code 0 while the JSON result line
      // is still buffered in the parent process. Wait for `close`, which is
      // emitted after stdio streams are closed, before declaring "no result".
      child.closeHandler = (code, signal) => {
        if (settled) return;
        const stderr = child.stderrBuf.length > 0 ? ` | stderr: ${child.stderrBuf.join('\n')}` : '';
        settle({
          success: false,
          message: `Python runner exited before result (exit code: ${code}, signal: ${signal})${stderr}`
        });
      };
      proc.once('close', child.closeHandler);

      const timer = setTimeout(() => {
        settle(
          { success: false, message: `Script execution timed out after ${timeoutMs}ms` },
          { kill: true }
        );
      }, timeoutMs + 2000);

      if (env.SANDBOX_MAX_MEMORY_MB > 0 && proc.pid) {
        const limitMB = env.SANDBOX_MAX_MEMORY_MB + RUNTIME_MEMORY_OVERHEAD_MB;
        rssTimer = setInterval(async () => {
          if (settled || !proc.pid) return;
          const rss = await getProcessTreeRSSMB(proc.pid);
          if (rss !== null && rss > limitMB) {
            settle(
              {
                success: false,
                message: `Memory limit exceeded (RSS: ${Math.round(rss)}MB, limit: ${limitMB}MB)`
              },
              { kill: true }
            );
          }
        }, RSS_POLL_INTERVAL);
      }

      const payload = {
        code: task.code,
        variables: task.variables,
        timeoutMs,
        allowedModules: env.SANDBOX_PYTHON_ALLOWED_MODULES,
        requestLimits: {
          maxRequests: env.SANDBOX_REQUEST_MAX_COUNT,
          timeoutMs: env.SANDBOX_REQUEST_TIMEOUT,
          maxResponseSize: env.SANDBOX_REQUEST_MAX_RESPONSE_MB * 1024 * 1024,
          maxRequestBodySize: env.SANDBOX_REQUEST_MAX_BODY_MB * 1024 * 1024,
          maxOutputSize: env.SANDBOX_MAX_OUTPUT_MB * 1024 * 1024
        },
        isolation: {
          ...this.buildIsolationPayload()
        }
      };

      try {
        proc.stdin!.write(JSON.stringify(payload) + '\n');
      } catch (err) {
        settle(
          { success: false, message: `Python runner communication error: ${getErrText(err)}` },
          { kill: true }
        );
      }
    });
  }

  private async handleHttpRequestMessage({
    proc,
    id,
    payload,
    httpState,
    httpLimits
  }: {
    proc: ChildProcess;
    id: string;
    payload: SandboxHttpRequestPayload;
    httpState: SandboxHttpState;
    httpLimits: {
      maxRequests: number;
      timeoutMs: number;
      maxResponseSize: number;
      maxRequestBodySize: number;
    };
  }) {
    const writeResponse = (response: Record<string, any>) => {
      if (!proc.stdin?.writable) return;
      proc.stdin.write(JSON.stringify({ type: 'http_response', id, ...response }) + '\n');
    };

    try {
      const data = await runSandboxHttpRequest({
        payload,
        limits: httpLimits,
        state: httpState
      });
      writeResponse({ success: true, payload: data });
    } catch (err) {
      writeResponse({ success: false, message: getErrText(err, 'HTTP request failed') });
    }
  }
}
