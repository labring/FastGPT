import { availableParallelism, totalmem } from 'node:os';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const FILE_PARSE_MEMORY_RESERVE_RATIO = 0.25;
const FILE_PARSE_MIN_MEMORY_RESERVE_BYTES = 256 * MIB;
const FILE_PARSE_MAX_MEMORY_RESERVE_BYTES = GIB;

const lightweightExtensions = new Set(['txt', 'md', 'csv']);
const documentExtensions = new Set(['doc', 'wps', 'docm', 'rtf', 'odt']);
const presentationExtensions = new Set([
  'docx',
  'ppt',
  'pps',
  'pot',
  'pptx',
  'pptm',
  'ppsx',
  'ppsm',
  'odp',
  'epub'
]);
const spreadsheetExtensions = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods']);

type FileParseMemoryRule = {
  baseBytes: number;
  multiplier: number;
};

export type FileParseMemoryState = {
  constrainedMemoryBytes: number;
  availableMemoryBytes: number;
  safetyReserveBytes: number;
  maximumSafeTaskMemoryBytes: number;
  currentlySchedulableMemoryBytes: number;
};

/**
 * 使用 Node.js 可见的 CPU 并行度作为 readFile worker 硬上限。
 *
 * `availableParallelism` 已考虑容器 CPU 配额，因此无需再叠加固定上限或人为扣减 CPU。
 * 内存策略负责控制实际同时执行的任务数；此处只保证异常输入时至少保留一个 worker 槽位。
 */
export const getFileParseMaxWorkers = (parallelism = availableParallelism()) => {
  if (!Number.isFinite(parallelism)) return 1;
  return Math.max(1, Math.floor(parallelism));
};

/** 根据容器约束计算系统安全保留内存，结果始终位于 256 MiB 到 1 GiB。 */
export const getFileParseSafetyReserveBytes = (constrainedMemoryBytes: number) =>
  Math.min(
    FILE_PARSE_MAX_MEMORY_RESERVE_BYTES,
    Math.max(
      FILE_PARSE_MIN_MEMORY_RESERVE_BYTES,
      constrainedMemoryBytes * FILE_PARSE_MEMORY_RESERVE_RATIO
    )
  );

/**
 * 返回当前文件解析调度可使用的内存快照。
 *
 * `process.constrainedMemory()` 在没有容器/cgroup 约束时可能返回 0，此时回退到系统总内存。
 * 当前可用内存同时被约束上限截断，避免平台返回值超过容器可用范围。
 */
export const getFileParseMemoryState = ({
  constrainedMemoryBytes = process.constrainedMemory(),
  availableMemoryBytes = process.availableMemory(),
  totalMemoryBytes = totalmem()
}: {
  constrainedMemoryBytes?: number;
  availableMemoryBytes?: number;
  totalMemoryBytes?: number;
} = {}): FileParseMemoryState => {
  const effectiveConstrainedMemoryBytes =
    Number.isFinite(constrainedMemoryBytes) && constrainedMemoryBytes > 0
      ? constrainedMemoryBytes
      : totalMemoryBytes;
  const safetyReserveBytes = getFileParseSafetyReserveBytes(effectiveConstrainedMemoryBytes);
  const effectiveAvailableMemoryBytes = Math.min(
    Math.max(0, availableMemoryBytes),
    effectiveConstrainedMemoryBytes
  );

  return {
    constrainedMemoryBytes: effectiveConstrainedMemoryBytes,
    availableMemoryBytes: effectiveAvailableMemoryBytes,
    safetyReserveBytes,
    maximumSafeTaskMemoryBytes: Math.max(0, effectiveConstrainedMemoryBytes - safetyReserveBytes),
    currentlySchedulableMemoryBytes: Math.max(0, effectiveAvailableMemoryBytes - safetyReserveBytes)
  };
};

/**
 * 通过文件类型和输入大小估算解析阶段峰值内存。
 *
 * 该值用于并发调度而不是精确的内存计量。规则优先保守覆盖 Office、PDF 和 AnyDoc 格式；
 * 未识别格式按 64 MiB 基础开销和 4 倍输入大小处理。
 */
export const estimateFileParseMemoryBytes = ({
  extension,
  fileSizeBytes
}: {
  extension: string;
  fileSizeBytes: number;
}) => {
  const normalizedExtension = extension.trim().toLowerCase().replace(/^\./, '');
  const normalizedFileSizeBytes = Math.max(0, fileSizeBytes);

  const rule: FileParseMemoryRule = (() => {
    if (lightweightExtensions.has(normalizedExtension)) {
      return { baseBytes: 32 * MIB, multiplier: 1.5 };
    }
    if (normalizedExtension === 'html') {
      return { baseBytes: 32 * MIB, multiplier: 2 };
    }
    if (documentExtensions.has(normalizedExtension)) {
      return { baseBytes: 64 * MIB, multiplier: 5 };
    }
    if (presentationExtensions.has(normalizedExtension)) {
      return { baseBytes: 64 * MIB, multiplier: 4 };
    }
    if (spreadsheetExtensions.has(normalizedExtension)) {
      return { baseBytes: 128 * MIB, multiplier: 6 };
    }
    if (normalizedExtension === 'pdf') {
      return { baseBytes: 128 * MIB, multiplier: 4 };
    }
    return { baseBytes: 64 * MIB, multiplier: 4 };
  })();

  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.ceil(rule.baseBytes + normalizedFileSizeBytes * rule.multiplier)
  );
};

export const fileParseResourceConstants = {
  queueTimeoutMs: 30 * 60 * 1000,
  idleWorkerTimeoutMs: 60 * 1000,
  minIdleWorkers: 1
};
