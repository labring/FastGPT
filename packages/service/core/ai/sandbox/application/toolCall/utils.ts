import { SANDBOX_TOOL_MAX_LINES, SANDBOX_TOOL_MAX_BYTES } from '../../constants';
import type { SandboxClient } from '../runtime/client';
import { STOPPED_TOOL_RESPONSE_TEXT } from '../../../../chat/stop';

/**
 * 校验沙箱工具取消信号；若已触发停止则立即抛出统一中断文本，阻止发起后续副作用。
 */
export const throwIfSandboxToolAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error(STOPPED_TOOL_RESPONSE_TEXT);
  }
};

/**
 * 等待沙箱连接恢复并响应取消信号。
 *
 * 只让当前工具等待提前脱身，不取消底层共享的 ensureAvailablePromise，并在返回后再次复核信号，
 * 避免宽限期脱钩后迟到的连接恢复继续发起写入或会话创建等副作用。
 */
export const ensureSandboxAvailableWithSignal = async ({
  sandboxInstance,
  signal
}: {
  sandboxInstance: SandboxClient;
  signal?: AbortSignal;
}) => {
  throwIfSandboxToolAborted(signal);

  if (!signal) {
    await sandboxInstance.ensureAvailable();
    return;
  }

  let cleanupAbortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new Error(STOPPED_TOOL_RESPONSE_TEXT));
    signal.addEventListener('abort', onAbort, { once: true });
    cleanupAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  const ensurePromise = sandboxInstance.ensureAvailable();
  // 防止工具因取消提前脱身后，迟到的 ensureAvailable 拒绝演变为未捕获异常。
  void ensurePromise.catch(() => {});

  try {
    await Promise.race([ensurePromise, abortPromise]);
  } finally {
    cleanupAbortListener?.();
  }

  throwIfSandboxToolAborted(signal);
};

export type SandboxToolOutputTruncation = {
  content: string;
  truncated: boolean;
  truncatedBy?: 'lines' | 'bytes';
  totalLines: number;
  outputLines: number;
  outputBytes: number;
};

const splitLines = (content: string) => {
  if (content.length === 0) return [];
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  return lines;
};

/**
 * 按 UTF-8 字节截取字符串，避免 Buffer 切片把多字节字符截断成替换字符。
 */
const truncateUtf8Tail = ({ content, maxBytes }: { content: string; maxBytes: number }) => {
  if (Buffer.byteLength(content, 'utf8') <= maxBytes) return content;

  const chars = Array.from(content);
  const selected: string[] = [];
  let bytes = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]!;
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) break;
    selected.push(char);
    bytes += charBytes;
  }

  return selected.reverse().join('');
};

/**
 * 统一限制 sandbox 工具文本输出。文件读取/搜索保留头部，命令输出保留尾部。
 */
export const truncateSandboxToolOutput = ({
  content,
  direction,
  maxLines = SANDBOX_TOOL_MAX_LINES,
  maxBytes = SANDBOX_TOOL_MAX_BYTES
}: {
  content: string;
  direction: 'head' | 'tail';
  maxLines?: number;
  maxBytes?: number;
}): SandboxToolOutputTruncation => {
  const lines = splitLines(content);
  const totalBytes = Buffer.byteLength(content, 'utf8');
  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: undefined,
      totalLines: lines.length,
      outputLines: lines.length,
      outputBytes: totalBytes
    };
  }

  const selectedLines: string[] = [];
  let selectedBytes = 0;
  let truncatedBy: 'lines' | 'bytes' = 'lines';
  const indexes =
    direction === 'head'
      ? lines.map((_, index) => index)
      : lines.map((_, index) => lines.length - index - 1);

  for (const index of indexes) {
    if (selectedLines.length >= maxLines) break;
    const line = lines[index]!;
    const lineBytes = Buffer.byteLength(line, 'utf8') + (selectedLines.length > 0 ? 1 : 0);
    if (selectedBytes + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      if (direction === 'tail' && selectedLines.length === 0) {
        selectedLines.push(truncateUtf8Tail({ content: line, maxBytes }));
      }
      break;
    }

    if (direction === 'head') selectedLines.push(line);
    else selectedLines.unshift(line);
    selectedBytes += lineBytes;
  }

  const output = selectedLines.join('\n');

  return {
    content: output,
    truncated: true,
    truncatedBy,
    totalLines: lines.length,
    outputLines: selectedLines.length,
    outputBytes: Buffer.byteLength(output, 'utf8')
  };
};
