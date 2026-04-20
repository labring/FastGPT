export {
  configureTracing,
  disposeTracing,
  getCurrentSpanContext,
  getTraceLogContext,
  getTracer,
  setSpanError,
  withActiveSpan
} from './client';
export type { ActiveSpanOptions, TraceLogContext } from './client';
