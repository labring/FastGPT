/**
 * 检查点管理器
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, MigrationPhase } from './types';

export class CheckpointManager {
  private checkpointDir: string;
  private checkpointFile: string;

  constructor(checkpointDir: string = './checkpoints') {
    this.checkpointDir = checkpointDir;
    this.checkpointFile = path.join(checkpointDir, 'migration-checkpoint.json');

    // 确保目录存在
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }
  }

  /**
   * 保存检查点
   */
  save(checkpoint: Checkpoint): void {
    checkpoint.lastUpdateTime = new Date().toISOString();
    fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }

  /**
   * 加载检查点
   */
  load(): Checkpoint | null {
    if (!fs.existsSync(this.checkpointFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.checkpointFile, 'utf-8');
      return JSON.parse(content) as Checkpoint;
    } catch (error) {
      console.error('Failed to load checkpoint:', error);
      return null;
    }
  }

  /**
   * 创建初始检查点
   */
  createInitial(totalRecords: number): Checkpoint {
    return {
      totalProcessed: 0,
      totalFailed: 0,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      phase: 'precheck',
      batches: []
    };
  }

  /**
   * 更新阶段
   */
  updatePhase(checkpoint: Checkpoint, phase: MigrationPhase): void {
    checkpoint.phase = phase;
    checkpoint.lastUpdateTime = new Date().toISOString();
    this.save(checkpoint);
  }

  /**
   * 更新进度
   */
  updateProgress(checkpoint: Checkpoint, processed: number, failed: number = 0): void {
    checkpoint.totalProcessed += processed;
    checkpoint.totalFailed += failed;
    checkpoint.lastUpdateTime = new Date().toISOString();
    this.save(checkpoint);
  }

  /**
   * 添加批次检查点
   */
  addBatch(checkpoint: Checkpoint, batchId: string, startId: string, endId: string): void {
    checkpoint.batches.push({
      batchId,
      startId,
      endId,
      processed: 0,
      failed: 0,
      status: 'pending',
      startTime: new Date().toISOString()
    });
    this.save(checkpoint);
  }

  /**
   * 更新批次状态
   */
  updateBatch(
    checkpoint: Checkpoint,
    batchId: string,
    status: 'processing' | 'completed' | 'failed',
    processed?: number,
    failed?: number
  ): void {
    const batch = checkpoint.batches.find((b) => b.batchId === batchId);
    if (batch) {
      batch.status = status;
      if (processed !== undefined) batch.processed = processed;
      if (failed !== undefined) batch.failed = failed;
      if (status === 'completed' || status === 'failed') {
        batch.endTime = new Date().toISOString();
      }
      this.save(checkpoint);
    }
  }

  /**
   * 清除检查点
   */
  clear(): void {
    if (fs.existsSync(this.checkpointFile)) {
      fs.unlinkSync(this.checkpointFile);
    }
  }

  /**
   * 获取检查点文件路径
   */
  getCheckpointFile(): string {
    return this.checkpointFile;
  }
}
