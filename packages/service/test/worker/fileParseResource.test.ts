import { describe, expect, it } from 'vitest';
import {
  estimateFileMaterializationMemoryBytes,
  estimateFileParseMemoryBytes,
  fileParseResourceConstants,
  getFileParseMaxWorkers,
  getFileParseMemoryState,
  getFileParseSafetyReserveBytes,
  getUnknownFileParseBaseMemoryBytes
} from '@fastgpt/service/worker/fileParseResource';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe('worker/fileParseResource getFileParseMaxWorkers', () => {
  it.each([
    [1, 1],
    [2, 2],
    [8, 8],
    [64, 64],
    [0, 1],
    [Number.NaN, 1]
  ])('可用并行度 %i 时返回 %i 个 worker', (parallelism, expected) => {
    expect(getFileParseMaxWorkers(parallelism)).toBe(expected);
  });
});

describe('worker/fileParseResource getFileParseSafetyReserveBytes', () => {
  it('安全保留内存限制在 256 MiB 到 1 GiB', () => {
    expect(getFileParseSafetyReserveBytes(512 * MIB)).toBe(256 * MIB);
    expect(getFileParseSafetyReserveBytes(2 * GIB)).toBe(512 * MIB);
    expect(getFileParseSafetyReserveBytes(16 * GIB)).toBe(GIB);
  });
});

describe('worker/fileParseResource getFileParseMemoryState', () => {
  it('根据容器约束、当前可用内存和安全保留计算调度值', () => {
    expect(
      getFileParseMemoryState({
        constrainedMemoryBytes: 4 * GIB,
        availableMemoryBytes: 3 * GIB,
        totalMemoryBytes: 32 * GIB
      })
    ).toEqual({
      constrainedMemoryBytes: 4 * GIB,
      availableMemoryBytes: 3 * GIB,
      safetyReserveBytes: GIB,
      maximumSafeTaskMemoryBytes: 3 * GIB,
      currentlySchedulableMemoryBytes: 2 * GIB
    });
  });

  it('容器约束无效时回退系统内存，并截断异常可用值', () => {
    expect(
      getFileParseMemoryState({
        constrainedMemoryBytes: 0,
        availableMemoryBytes: 8 * GIB,
        totalMemoryBytes: 2 * GIB
      })
    ).toMatchObject({
      constrainedMemoryBytes: 2 * GIB,
      availableMemoryBytes: 2 * GIB,
      maximumSafeTaskMemoryBytes: 1.5 * GIB,
      currentlySchedulableMemoryBytes: 1.5 * GIB
    });

    expect(
      getFileParseMemoryState({
        constrainedMemoryBytes: Number.NaN,
        availableMemoryBytes: -1,
        totalMemoryBytes: GIB
      }).currentlySchedulableMemoryBytes
    ).toBe(0);
  });
});

describe('worker/fileParseResource estimateFileParseMemoryBytes', () => {
  it.each([
    ['txt', 32 * MIB + 1.5 * MIB],
    ['HTML', 32 * MIB + 2 * MIB],
    ['.doc', 64 * MIB + 5 * MIB],
    ['wps', 64 * MIB + 5 * MIB],
    ['pptx', 64 * MIB + 4 * MIB],
    ['xlsx', 128 * MIB + 6 * MIB],
    ['pdf', 128 * MIB + 4 * MIB],
    ['unknown', 64 * MIB + 4 * MIB]
  ])('按 %s 格式应用对应估算规则', (extension, expected) => {
    expect(estimateFileParseMemoryBytes({ extension, fileSizeBytes: MIB })).toBe(expected);
  });

  it('负文件大小按 0 处理，超大结果限制为安全整数', () => {
    expect(estimateFileParseMemoryBytes({ extension: 'doc', fileSizeBytes: -1 })).toBe(64 * MIB);
    expect(
      estimateFileParseMemoryBytes({ extension: 'xlsx', fileSizeBytes: Number.MAX_SAFE_INTEGER })
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('调度常量使用 30 分钟排队、60 秒空闲回收和一个 warm worker', () => {
    expect(fileParseResourceConstants).toEqual({
      queueTimeoutMs: 30 * 60 * 1000,
      idleWorkerTimeoutMs: 60 * 1000,
      minIdleWorkers: 1
    });
  });
});

describe('worker/fileParseResource materialization estimate', () => {
  it('按格式 base 加两倍输入大小估算 chunks 与最终 Buffer 共存峰值', () => {
    expect(estimateFileMaterializationMemoryBytes({ extension: 'txt', fileSizeBytes: MIB })).toBe(
      34 * MIB
    );
    expect(estimateFileMaterializationMemoryBytes({ extension: 'xlsx', fileSizeBytes: MIB })).toBe(
      130 * MIB
    );
  });

  it('未知外链使用当前最重解析器 base', () => {
    expect(getUnknownFileParseBaseMemoryBytes()).toBe(128 * MIB);
    expect(
      estimateFileMaterializationMemoryBytes({
        extension: '',
        fileSizeBytes: MIB,
        unknownUsesMaximumBase: true
      })
    ).toBe(130 * MIB);
  });
});
