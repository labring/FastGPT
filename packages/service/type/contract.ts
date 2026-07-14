/**
 * Minimal request / response contracts for framework-agnostic modules.
 *
 * FastGPT's auth and SSE modules were tightly coupled to NextApiRequest /
 * NextApiResponse.  These contracts define the subset each module actually
 * uses, so consumers on other runtimes (hono, express, fastify) can satisfy
 * them with a thin adapter instead of polyfilling the full NextJS API.
 *
 * NextApiRequest / NextApiResponse satisfy both contracts without any
 * changes — no existing call site needs modification.
 */

export interface RequestContract {
  headers: Record<string, string | undefined>;
}

export interface StreamResponseContract {
  write(chunk: string): boolean;
  setHeader(name: string, value: string | number | readonly string[]): void;
  getHeader(name: string): string | number | undefined;
  on(event: 'close' | 'finish' | 'error', handler: () => void): void;
  once(event: 'close' | 'finish', handler: () => void): void;
  removeListener(event: 'close' | 'finish' | 'error'): void;
  end(): void;
  /** true when SSE headers have been flushed */
  readonly headersSent: boolean;
  /** true when stream is already closed */
  readonly closed: boolean;
  /** true once writable side ended */
  readonly writableEnded: boolean;
  /** true once fully destroyed */
  readonly destroyed: boolean;
}
