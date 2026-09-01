import { FlowProducer } from 'bullmq';
import type { RedisRuntime } from '../runtime/connection';
import type { RedisRuntimeLogger } from '../types';
import { closeWithTimeout, forceDisconnect } from './close';
import type { BullMQDisconnectable } from './types';

/** Manages the shared FlowProducer lifecycle for a BullMQ Runtime. */
export class BullMQFlowProducerManager {
  private flowProducer: FlowProducer | undefined;

  constructor(
    private readonly options: {
      redisRuntime: RedisRuntime;
      logger: RedisRuntimeLogger;
      closeTimeoutMs: number;
    }
  ) {}

  /** Creates one FlowProducer and reuses it for all flows in this Runtime. */
  getFlowProducer() {
    if (this.flowProducer) return this.flowProducer;

    const connection = this.options.redisRuntime.createQueueConnection();
    try {
      const flowProducer = new FlowProducer({ connection });
      const errorHandler = (error: Error) => {
        this.options.logger.error('BullMQ flow producer error', { error });
      };
      flowProducer.on('error', errorHandler);
      this.flowProducer = flowProducer;
      return flowProducer;
    } catch (error) {
      void this.options.redisRuntime.releaseConnection(connection).catch((releaseError) => {
        this.options.logger.warn(
          'Failed to release Redis connection after FlowProducer creation error',
          { error: releaseError }
        );
      });
      throw error;
    }
  }

  async close() {
    const flowProducer = this.flowProducer;
    this.flowProducer = undefined;
    if (!flowProducer) return;

    await closeWithTimeout({
      operation: () => flowProducer.close(),
      resource: 'BullMQ flow producer',
      timeoutMs: this.options.closeTimeoutMs
    }).catch((error) => {
      this.options.logger.warn('BullMQ flow producer close failed', { error });
      const connection = (flowProducer as unknown as { connection?: BullMQDisconnectable })
        .connection;
      forceDisconnect({
        name: 'flow-producer',
        resource: 'flow producer connection',
        disconnect: connection
          ? () => connection.disconnect(false)
          : () => flowProducer.disconnect(),
        logger: this.options.logger
      });
    });
  }
}
