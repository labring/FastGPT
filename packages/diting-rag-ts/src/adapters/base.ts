// src/adapters/base.ts

import type { Logger } from '../ports/logger';
import type { DitingConfig } from '../ports/config';
import type { ChunkResult } from '../types/chunk';

export interface AdapterContext {
  logger: Logger;
  config: DitingConfig;
}

export abstract class BaseAdapter<T = any> {
  protected context: AdapterContext;

  constructor(context: AdapterContext) {
    this.context = context;
  }

  protected log = {
    debug: (msg: string, meta?: Record<string, unknown>) => this.context.logger.debug(msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => this.context.logger.info(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => this.context.logger.warn(msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => this.context.logger.error(msg, meta)
  };

  abstract toDitingChunk(data: T): ChunkResult;
  abstract fromDitingChunk(chunk: ChunkResult): T;

  toDitingChunks(dataList: T[]): ChunkResult[] {
    return dataList.map((d) => this.toDitingChunk(d));
  }

  fromDitingChunks(chunks: ChunkResult[]): T[] {
    return chunks.map((c) => this.fromDitingChunk(c));
  }
}
