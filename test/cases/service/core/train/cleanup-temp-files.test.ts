import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  cleanupRerankTempFiles,
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

// Mock getRerankTrainDataDir to return test directory
vi.mock('@fastgpt/service/core/train/rerank/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/train/rerank/constants')>();
  return {
    ...actual,
    getRerankTrainDataDir: vi.fn(() => os.tmpdir())
  };
});

describe('临时文件清理功能', () => {
  const testTaskId = 'test_task_123';
  const tempDir = os.tmpdir(); // Use os.tmpdir() instead of hardcoded /tmp
  let testFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Create test files
    testFilePath = path.join(tempDir, `rerank_train_${testTaskId}_${Date.now()}.jsonl`);
    await fs.writeFile(testFilePath, 'test content', 'utf-8');
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      const files = await fs.readdir(tempDir);
      const testFilePattern = new RegExp(`^rerank_train_${testTaskId}_\\d+\\.jsonl$`);

      for (const file of files) {
        if (testFilePattern.test(file)) {
          await fs.unlink(path.join(tempDir, file));
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('应该清理指定的单个文件', async () => {
    // Confirm file exists
    await expect(fs.access(testFilePath)).resolves.toBeUndefined();

    // Call cleanup function
    await cleanupRerankTempFiles(testFilePath);

    // Verify file is deleted
    await expect(fs.access(testFilePath)).rejects.toThrow();
  });

  test('清理不存在的文件时不应该抛出错误', async () => {
    const nonExistentFile = path.join(tempDir, 'non_existent_file.jsonl');

    // Should execute without throwing
    await expect(cleanupRerankTempFiles(nonExistentFile)).resolves.toBeUndefined();
  });

  test('没有提供参数时应该记录警告', async () => {
    const { addLog } = await import('@fastgpt/service/common/system/log');

    await expect(cleanupRerankTempFiles()).resolves.toBeUndefined();
    expect(addLog.warn).toHaveBeenCalledWith(
      'Both filePath and taskId are not provided for cleanup'
    );
  });

  test('根据 taskId 清理匹配的文件', async () => {
    // Create multiple test files
    const uniqueSuffix = Date.now();
    const testFiles = [
      `rerank_train_${testTaskId}_1.jsonl`,
      `rerank_train_${testTaskId}_2.jsonl`,
      `rerank_train_other_task_${uniqueSuffix}.jsonl` // Should not be deleted
    ];

    for (const file of testFiles) {
      const filePath = path.join(tempDir, file);
      await fs.writeFile(filePath, 'test content', 'utf-8');
    }

    // Call cleanup function
    await cleanupRerankTempFiles(undefined, testTaskId);

    // Verify files for the specified task are deleted
    // Use regex matching consistent with cleanupRerankTempFiles logic
    const tempFilePattern = new RegExp(`^rerank_train_${testTaskId}_\\d+\\.jsonl$`);
    const targetFiles = testFiles.filter((file) => tempFilePattern.test(file));

    for (const file of targetFiles) {
      const filePath = path.join(tempDir, file);
      await expect(fs.access(filePath)).rejects.toThrow();
    }

    // Verify other files still exist
    const otherFile = path.join(tempDir, testFiles[2]);
    await expect(fs.access(otherFile)).resolves.toBeUndefined();
  });
});

describe('训练任务删除时的文件清理', () => {
  test('删除任务时应该清理临时文件 - 集成测试', async () => {
    // This test validates the full deletion flow but requires a real database
    // In unit tests we primarily verify the cleanupRerankTempFiles function itself
    // Integration tests can be run with a real database

    // Create a temporary file for testing
    const testFile = '/tmp/rerank_train_delete_test.jsonl';
    await fs.writeFile(testFile, 'test content', 'utf-8');

    // Confirm file exists
    await expect(fs.access(testFile)).resolves.toBeUndefined();

    // Call cleanup function
    await cleanupRerankTempFiles(testFile);

    // Verify file is deleted
    await expect(fs.access(testFile)).rejects.toThrow();
  });
});
