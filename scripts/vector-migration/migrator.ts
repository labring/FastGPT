/**
 * 迁移引擎
 */
import { DatabaseAdapter, createAdapter } from './adapters';
import { CheckpointManager } from './checkpoint';
import type {
  MigrationConfig,
  MigrationProgress,
  MigrationResult,
  VectorRecord,
  Checkpoint
} from './types';

export class VectorMigrator {
  private config: MigrationConfig;
  private sourceAdapter: DatabaseAdapter;
  private targetAdapter: DatabaseAdapter;
  private checkpointManager: CheckpointManager;

  constructor(config: MigrationConfig) {
    this.config = {
      batchSize: 1000,
      checkpointDir: './checkpoints',
      enableCDC: false,
      cdcPollInterval: 5000,
      ...config
    };

    this.sourceAdapter = createAdapter(config.source);
    this.targetAdapter = createAdapter(config.target);
    this.checkpointManager = new CheckpointManager(this.config.checkpointDir);
  }

  /**
   * 预检查
   */
  async precheck(): Promise<void> {
    console.log('🔍 开始预检查...');

    // 连接源数据库
    console.log('  连接源数据库...');
    await this.sourceAdapter.connect();

    // 连接目标数据库
    console.log('  连接目标数据库...');
    await this.targetAdapter.connect();

    // 检查源数据库记录数
    console.log('  检查源数据库记录数...');
    const sourceCount = await this.sourceAdapter.getTotalCount();
    console.log(`  ✓ 源数据库记录数: ${sourceCount}`);

    // 检查目标数据库记录数
    console.log('  检查目标数据库记录数...');
    const targetCount = await this.targetAdapter.getTotalCount();
    console.log(`  ✓ 目标数据库记录数: ${targetCount}`);

    // 初始化目标数据库 schema
    console.log('  初始化目标数据库 schema...');
    await this.targetAdapter.initSchema();
    console.log('  ✓ Schema 初始化完成');

    console.log('✅ 预检查完成');
  }

  /**
   * 停机版本迁移（全量迁移）
   */
  async migrateOffline(): Promise<MigrationResult> {
    const startTime = new Date();
    console.log('🚀 开始停机迁移...');

    let checkpoint = this.checkpointManager.load();
    if (!checkpoint) {
      await this.precheck();
      const totalRecords = await this.sourceAdapter.getTotalCount();
      checkpoint = this.checkpointManager.createInitial(totalRecords);
      this.checkpointManager.updatePhase(checkpoint, 'full_export');
    }

    try {
      // 全量导出和导入
      await this.fullMigration(checkpoint);

      // 构建索引
      this.checkpointManager.updatePhase(checkpoint, 'index_build');
      console.log('📊 构建索引...');
      // 索引构建由数据库自动完成，这里只是标记阶段

      // 数据验证
      this.checkpointManager.updatePhase(checkpoint, 'validation');
      console.log('✅ 验证数据...');
      await this.validateMigration();

      this.checkpointManager.updatePhase(checkpoint, 'completed');

      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      console.log('✅ 迁移完成！');
      return {
        success: true,
        totalRecords: checkpoint.totalProcessed,
        processedRecords: checkpoint.totalProcessed,
        failedRecords: checkpoint.totalFailed,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration
      };
    } catch (error) {
      console.error('❌ 迁移失败:', error);
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      return {
        success: false,
        totalRecords: checkpoint.totalProcessed,
        processedRecords: checkpoint.totalProcessed,
        failedRecords: checkpoint.totalFailed,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        errors: [String(error)]
      };
    } finally {
      await this.sourceAdapter.disconnect();
      await this.targetAdapter.disconnect();
    }
  }

  /**
   * 不停机版本迁移（增量迁移）
   */
  async migrateOnline(): Promise<MigrationResult> {
    const startTime = new Date();
    console.log('🚀 开始在线迁移...');

    let checkpoint = this.checkpointManager.load();
    if (!checkpoint) {
      await this.precheck();
      const totalRecords = await this.sourceAdapter.getTotalCount();
      checkpoint = this.checkpointManager.createInitial(totalRecords);
      this.checkpointManager.updatePhase(checkpoint, 'full_export');
    }

    try {
      // 全量快照迁移
      if (checkpoint.phase === 'full_export' || checkpoint.phase === 'full_import') {
        await this.fullMigration(checkpoint);
      }

      // CDC 增量同步
      if (this.config.enableCDC) {
        this.checkpointManager.updatePhase(checkpoint, 'cdc_sync');
        console.log('🔄 开始 CDC 增量同步...');
        await this.cdcSync(checkpoint);
      }

      this.checkpointManager.updatePhase(checkpoint, 'completed');

      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      console.log('✅ 迁移完成！');
      return {
        success: true,
        totalRecords: checkpoint.totalProcessed,
        processedRecords: checkpoint.totalProcessed,
        failedRecords: checkpoint.totalFailed,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration
      };
    } catch (error) {
      console.error('❌ 迁移失败:', error);
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - endTime.getTime()) / 1000);

      return {
        success: false,
        totalRecords: checkpoint.totalProcessed,
        processedRecords: checkpoint.totalProcessed,
        failedRecords: checkpoint.totalFailed,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        errors: [String(error)]
      };
    } finally {
      // 在线迁移不自动断开连接，因为 CDC 需要持续运行
      // await this.sourceAdapter.disconnect();
      // await this.targetAdapter.disconnect();
    }
  }

  /**
   * 全量迁移
   */
  private async fullMigration(checkpoint: Checkpoint): Promise<void> {
    const totalRecords = await this.sourceAdapter.getTotalCount();
    const batchSize = this.config.batchSize || 1000;
    const totalBatches = Math.ceil(totalRecords / batchSize);

    console.log(`📦 开始全量迁移，共 ${totalBatches} 批次`);

    let offset = checkpoint.totalProcessed;
    let batchIndex = checkpoint.batches.length;

    while (offset < totalRecords) {
      const batchId = `batch-${batchIndex}`;
      const limit = Math.min(batchSize, totalRecords - offset);

      console.log(
        `  处理批次 ${batchIndex + 1}/${totalBatches} (offset: ${offset}, limit: ${limit})`
      );

      // 如果批次不存在，先创建
      if (!checkpoint.batches.find((b) => b.batchId === batchId)) {
        this.checkpointManager.addBatch(
          checkpoint,
          batchId,
          String(offset),
          String(offset + limit)
        );
      }
      this.checkpointManager.updateBatch(checkpoint, batchId, 'processing');

      try {
        // 读取批次数据
        const records = await this.sourceAdapter.readBatch(offset, limit);

        if (records.length === 0) {
          break;
        }

        // 写入目标数据库
        const insertIds = await this.targetAdapter.writeBatch(records);

        // 更新检查点
        this.checkpointManager.updateBatch(checkpoint, batchId, 'completed', records.length, 0);
        this.checkpointManager.updateProgress(checkpoint, records.length, 0);

        offset += records.length;
        batchIndex++;

        // 显示进度
        const progress = (offset / totalRecords) * 100;
        console.log(`  ✓ 进度: ${progress.toFixed(2)}% (${offset}/${totalRecords})`);
      } catch (error) {
        console.error(`  ❌ 批次 ${batchIndex + 1} 失败:`, error);
        this.checkpointManager.updateBatch(checkpoint, batchId, 'failed', 0, limit);
        this.checkpointManager.updateProgress(checkpoint, 0, limit);
        throw error;
      }
    }

    console.log('✅ 全量迁移完成');
  }

  /**
   * CDC 增量同步
   */
  private async cdcSync(checkpoint: Checkpoint): Promise<void> {
    const pollInterval = this.config.cdcPollInterval || 5000;
    let lastSyncTime = checkpoint.lastTimestamp
      ? new Date(checkpoint.lastTimestamp)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // 默认同步最近24小时的数据

    console.log(`🔄 CDC 同步开始，轮询间隔: ${pollInterval}ms`);

    // 持续同步（实际应用中应该通过信号控制停止）
    while (true) {
      try {
        const now = new Date();
        const newRecords = await this.sourceAdapter.readByTimeRange(lastSyncTime, now);

        if (newRecords.length > 0) {
          console.log(`  发现 ${newRecords.length} 条新记录`);
          await this.targetAdapter.writeBatch(newRecords);
          this.checkpointManager.updateProgress(checkpoint, newRecords.length, 0);
          checkpoint.lastTimestamp = now.toISOString();
          this.checkpointManager.save(checkpoint);
        }

        lastSyncTime = now;
        await this.sleep(pollInterval);
      } catch (error) {
        console.error('  ❌ CDC 同步错误:', error);
        await this.sleep(pollInterval);
      }
    }
  }

  /**
   * 验证迁移结果
   */
  private async validateMigration(): Promise<void> {
    const sourceCount = await this.sourceAdapter.getTotalCount();
    const targetCount = await this.targetAdapter.getTotalCount();

    console.log(`  源数据库记录数: ${sourceCount}`);
    console.log(`  目标数据库记录数: ${targetCount}`);

    if (sourceCount !== targetCount) {
      throw new Error(`数据不一致: 源数据库 ${sourceCount} 条，目标数据库 ${targetCount} 条`);
    }

    console.log('  ✓ 数据验证通过');
  }

  /**
   * 获取迁移进度
   */
  getProgress(): MigrationProgress | null {
    const checkpoint = this.checkpointManager.load();
    if (!checkpoint) return null;

    const totalRecords = checkpoint.totalProcessed + checkpoint.totalFailed;
    const percentage = totalRecords > 0 ? (checkpoint.totalProcessed / totalRecords) * 100 : 0;

    return {
      phase: checkpoint.phase,
      totalRecords,
      processedRecords: checkpoint.totalProcessed,
      failedRecords: checkpoint.totalFailed,
      currentBatch: checkpoint.batches.filter((b) => b.status === 'completed').length,
      totalBatches: checkpoint.batches.length,
      percentage
    };
  }

  /**
   * 工具方法：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
