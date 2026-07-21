import type { BullMQRuntimeContext } from './index';

declare global {
  var bullMQRuntimeContext: BullMQRuntimeContext | undefined;
}

export {};
