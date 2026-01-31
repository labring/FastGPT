/**
 * 数据库适配器基类
 */
import type { VectorRecord, DatabaseConfig, DatabaseType } from '../types';

export abstract class DatabaseAdapter {
  protected config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * 初始化数据库连接
   */
  abstract connect(): Promise<void>;

  /**
   * 关闭数据库连接
   */
  abstract disconnect(): Promise<void>;

  /**
   * 获取总记录数
   */
  abstract getTotalCount(): Promise<number>;

  /**
   * 批量读取数据
   */
  abstract readBatch(offset: number, limit: number): Promise<VectorRecord[]>;

  /**
   * 根据时间范围读取数据（用于 CDC）
   */
  abstract readByTimeRange(startTime: Date, endTime: Date): Promise<VectorRecord[]>;

  /**
   * 根据 ID 范围读取数据
   */
  abstract readByIdRange(startId: string, endId: string, limit: number): Promise<VectorRecord[]>;

  /**
   * 批量写入数据
   */
  abstract writeBatch(records: VectorRecord[]): Promise<string[]>; // 返回插入的 ID 列表

  /**
   * 验证数据一致性
   */
  abstract validateRecord(record: VectorRecord): Promise<boolean>;

  /**
   * 获取数据库类型
   */
  abstract getType(): DatabaseType;

  /**
   * 初始化表结构（如果需要）
   */
  abstract initSchema(): Promise<void>;
}
