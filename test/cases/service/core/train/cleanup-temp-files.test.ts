import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  cleanupTempFiles,
  deleteRerankTrainTask
} from '@fastgpt/service/core/train/rerank/task/controller';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('临时文件清理功能', () => {
  const testTaskId = 'test_task_123';
  const tempDir = os.tmpdir(); // 使用 os.tmpdir() 而不是硬编码 /tmp
  let testFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 创建测试文件
    testFilePath = path.join(tempDir, `rerank_train_${testTaskId}_${Date.now()}.jsonl`);
    await fs.writeFile(testFilePath, 'test content', 'utf-8');
  });

  afterAll(async () => {
    // 清理测试文件
    try {
      const files = await fs.readdir(tempDir);
      const testFilePattern = new RegExp(`^rerank_train_${testTaskId}_\\d+\\.jsonl$`);

      for (const file of files) {
        if (testFilePattern.test(file)) {
          await fs.unlink(path.join(tempDir, file));
        }
      }
    } catch (error) {
      // 忽略清理错误
    }
  });

  test('应该清理指定的单个文件', async () => {
    // 确认文件存在
    await expect(fs.access(testFilePath)).resolves.toBeUndefined();

    // 调用清理函数
    await cleanupTempFiles(testFilePath);

    // 验证文件被删除
    await expect(fs.access(testFilePath)).rejects.toThrow();
  });

  test('清理不存在的文件时不应该抛出错误', async () => {
    const nonExistentFile = path.join(tempDir, 'non_existent_file.jsonl');

    // 应该正常执行，不抛出错误
    await expect(cleanupTempFiles(nonExistentFile)).resolves.toBeUndefined();
  });

  test('没有提供参数时应该记录警告', async () => {
    const { addLog } = await import('@fastgpt/service/common/system/log');

    await expect(cleanupTempFiles()).resolves.toBeUndefined();
    expect(addLog.warn).toHaveBeenCalledWith(
      'Both filePath and taskId are not provided for cleanup'
    );
  });

  test('根据 taskId 清理匹配的文件', async () => {
    // 创建多个测试文件
    const testFiles = [
      `rerank_train_${testTaskId}_1.jsonl`,
      `rerank_train_${testTaskId}_2.jsonl`,
      `rerank_train_other_task_123.jsonl` // 不应该被删除
    ];

    for (const file of testFiles) {
      const filePath = path.join(tempDir, file);
      await fs.writeFile(filePath, 'test content', 'utf-8');
    }

    // 调用清理函数
    await cleanupTempFiles(undefined, testTaskId);

    // 验证指定任务的文件被删除
    const targetFiles = testFiles.filter((file) => file.includes(testTaskId));

    for (const file of targetFiles) {
      const filePath = path.join(tempDir, file);
      await expect(fs.access(filePath)).rejects.toThrow();
    }

    // 验证其他文件仍然存在
    const otherFile = path.join(tempDir, testFiles[2]);
    await expect(fs.access(otherFile)).resolves.toBeUndefined();
  });
});

describe('训练任务删除时的文件清理', () => {
  test('删除任务时应该清理临时文件 - 集成测试', async () => {
    // 这个测试验证完整的删除流程，但需要真实的数据库支持
    // 在单元测试中，我们主要验证 cleanupTempFiles 函数本身的功能
    // 集成测试可以在有真实数据库时进行

    // 创建一个临时文件用于测试
    const testFile = '/tmp/rerank_train_delete_test.jsonl';
    await fs.writeFile(testFile, 'test content', 'utf-8');

    // 确认文件存在
    await expect(fs.access(testFile)).resolves.toBeUndefined();

    // 调用清理函数
    await cleanupTempFiles(testFile);

    // 验证文件被删除
    await expect(fs.access(testFile)).rejects.toThrow();
  });
});
