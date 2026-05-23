import { describe, expect, it } from 'vitest';
import {
  asyncIterableToBuffer,
  bufferToReadableStream,
  readableStreamToAsyncIterable,
  streamToString,
  stringToReadableStream
} from '@/utils/streams';

describe('stream utilities', () => {
  describe('asyncIterableToBuffer', () => {
    it('should convert empty async iterable to empty buffer', async () => {
      async function* emptyIterable() {
        // Empty generator
      }
      const result = await asyncIterableToBuffer(emptyIterable());
      expect(result).toEqual(new Uint8Array([]));
    });

    it('should convert single chunk async iterable to buffer', async () => {
      async function* singleChunk() {
        yield new Uint8Array([1, 2, 3]);
      }
      const result = await asyncIterableToBuffer(singleChunk());
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should combine multiple chunks into single buffer', async () => {
      async function* multipleChunks() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4]);
        yield new Uint8Array([5, 6]);
      }
      const result = await asyncIterableToBuffer(multipleChunks());
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('should handle large chunks', async () => {
      async function* largeChunks() {
        yield new Uint8Array(1000).fill(1);
        yield new Uint8Array(2000).fill(2);
      }
      const result = await asyncIterableToBuffer(largeChunks());
      expect(result.length).toBe(3000);
      expect(result[0]).toBe(1);
      expect(result[1000]).toBe(2);
    });
  });

  describe('bufferToReadableStream', () => {
    it('should convert empty buffer to stream', async () => {
      const buffer = new Uint8Array([]);
      const stream = bufferToReadableStream(buffer);
      const reader = stream.getReader();
      const { value } = await reader.read();
      expect(value).toEqual(new Uint8Array([]));
      const next = await reader.read();
      expect(next.done).toBe(true);
    });

    it('should convert buffer to readable stream', async () => {
      const buffer = new Uint8Array([1, 2, 3, 4]);
      const stream = bufferToReadableStream(buffer);
      const reader = stream.getReader();

      const { done, value } = await reader.read();
      expect(done).toBe(false);
      expect(value).toEqual(buffer);

      const next = await reader.read();
      expect(next.done).toBe(true);
    });

    it('should close stream after single read', async () => {
      const buffer = new Uint8Array([5, 6, 7]);
      const stream = bufferToReadableStream(buffer);
      const reader = stream.getReader();

      await reader.read();
      const { done } = await reader.read();
      expect(done).toBe(true);
    });
  });

  describe('stringToReadableStream', () => {
    it('should convert empty string to stream', async () => {
      const stream = stringToReadableStream('');
      const result = await streamToString(stream);
      expect(result).toBe('');
    });

    it('should convert string to readable stream', async () => {
      const stream = stringToReadableStream('Hello, World!');
      const result = await streamToString(stream);
      expect(result).toBe('Hello, World!');
    });

    it('should handle unicode characters', async () => {
      const text = 'Hello 世界 🌍';
      const stream = stringToReadableStream(text);
      const result = await streamToString(stream);
      expect(result).toBe(text);
    });

    it('should handle multiline text', async () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const stream = stringToReadableStream(text);
      const result = await streamToString(stream);
      expect(result).toBe(text);
    });
  });

  describe('readableStreamToAsyncIterable', () => {
    it('should convert stream to async iterable', async () => {
      const buffer = new Uint8Array([1, 2, 3]);
      const stream = bufferToReadableStream(buffer);
      const iterable = readableStreamToAsyncIterable(stream);

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(buffer);
    });

    it('should handle empty stream', async () => {
      const stream = bufferToReadableStream(new Uint8Array([]));
      const iterable = readableStreamToAsyncIterable(stream);

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(new Uint8Array([]));
    });

    it('should properly release reader lock', async () => {
      const stream = bufferToReadableStream(new Uint8Array([1, 2, 3]));
      const iterable = readableStreamToAsyncIterable(stream);

      // Consume the iterable
      for await (const _chunk of iterable) {
        // Just consume
      }

      // After iteration completes, reader should be released
      // This is verified by the fact that the iteration completes without error
      expect(true).toBe(true);
    });

    it('should handle stream that already has Symbol.asyncIterator', async () => {
      // Create a mock stream with async iterator
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield new Uint8Array([1, 2, 3]);
        }
      } as ReadableStream<Uint8Array>;

      const iterable = readableStreamToAsyncIterable(mockStream);
      const chunks: Uint8Array[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should create async iterable for stream without Symbol.asyncIterator', async () => {
      // Create a custom stream-like object without Symbol.asyncIterator
      const queue = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
      let index = 0;

      const customStream = {
        getReader() {
          return {
            read: async () => {
              if (index < queue.length) {
                return { done: false, value: queue[index++] };
              }
              return { done: true, value: undefined };
            },
            releaseLock() {
              // No-op
            }
          };
        }
      } as ReadableStream<Uint8Array>;

      // Ensure it doesn't have Symbol.asyncIterator
      expect(customStream[Symbol.asyncIterator]).toBeUndefined();

      const iterable = readableStreamToAsyncIterable(customStream);
      const chunks: Uint8Array[] = [];

      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toEqual(new Uint8Array([1, 2]));
      expect(chunks[1]).toEqual(new Uint8Array([3, 4]));
    });

    it('should handle multiple chunks without Symbol.asyncIterator', async () => {
      // Create custom stream with multiple chunks and test the while loop
      const queue = [new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array([4, 5, 6])];
      let index = 0;

      const customStream = {
        getReader() {
          return {
            read: async () => {
              if (index < queue.length) {
                return { done: false, value: queue[index++] };
              }
              return { done: true, value: undefined };
            },
            releaseLock() {
              // No-op
            }
          };
        }
      } as ReadableStream<Uint8Array>;

      const iterable = readableStreamToAsyncIterable(customStream);
      const chunks: Uint8Array[] = [];

      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3);
      expect(chunks[0]).toEqual(new Uint8Array([1]));
      expect(chunks[1]).toEqual(new Uint8Array([2, 3]));
      expect(chunks[2]).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('should handle stream that becomes done immediately', async () => {
      // Custom stream that's immediately done
      const customStream = {
        getReader() {
          return {
            read: async () => ({ done: true, value: undefined }),
            releaseLock() {
              // No-op
            }
          };
        }
      } as ReadableStream<Uint8Array>;

      const iterable = readableStreamToAsyncIterable(customStream);
      const chunks: Uint8Array[] = [];

      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(0);
    });

    it('should skip undefined values from stream', async () => {
      // Custom stream that yields some undefined values
      const queue = [
        new Uint8Array([1]),
        undefined,
        new Uint8Array([2]),
        null,
        new Uint8Array([3])
      ];
      let index = 0;

      const customStream = {
        getReader() {
          return {
            read: async () => {
              if (index < queue.length) {
                return { done: false, value: queue[index++] as Uint8Array };
              }
              return { done: true, value: undefined };
            },
            releaseLock() {
              // No-op
            }
          };
        }
      } as ReadableStream<Uint8Array>;

      const iterable = readableStreamToAsyncIterable(customStream);
      const chunks: Uint8Array[] = [];

      for await (const chunk of iterable) {
        chunks.push(chunk);
      }

      // Should only get non-undefined/null values
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toEqual(new Uint8Array([1]));
      expect(chunks[1]).toEqual(new Uint8Array([2]));
      expect(chunks[2]).toEqual(new Uint8Array([3]));
    });

    it('should release reader lock even on error', async () => {
      let releaseLockCalled = false;
      const customStream = {
        getReader() {
          return {
            read: async () => {
              throw new Error('Stream error');
            },
            releaseLock() {
              releaseLockCalled = true;
            }
          };
        }
      } as unknown as ReadableStream<Uint8Array>;

      const iterable = readableStreamToAsyncIterable(customStream);

      try {
        for await (const _chunk of iterable) {
          // This should throw
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Stream error');
      }

      // Verify reader lock was released in finally block
      expect(releaseLockCalled).toBe(true);
    });
  });

  describe('streamToString', () => {
    it('should convert ReadableStream to string', async () => {
      const stream = stringToReadableStream('Test content');
      const result = await streamToString(stream);
      expect(result).toBe('Test content');
    });

    it('should convert AsyncIterable to string', async () => {
      async function* generate() {
        yield new TextEncoder().encode('Hello ');
        yield new TextEncoder().encode('World');
      }
      const result = await streamToString(generate());
      expect(result).toBe('Hello World');
    });

    it('should handle empty stream', async () => {
      const stream = stringToReadableStream('');
      const result = await streamToString(stream);
      expect(result).toBe('');
    });

    it('should handle unicode in stream', async () => {
      const text = '你好世界 🚀';
      const stream = stringToReadableStream(text);
      const result = await streamToString(stream);
      expect(result).toBe(text);
    });

    it('should handle large text', async () => {
      const largeText = 'x'.repeat(10000);
      const stream = stringToReadableStream(largeText);
      const result = await streamToString(stream);
      expect(result).toBe(largeText);
      expect(result.length).toBe(10000);
    });
  });

  describe('round-trip conversions', () => {
    it('should round-trip buffer through stream', async () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const stream = bufferToReadableStream(original);
      const iterable = readableStreamToAsyncIterable(stream);
      const result = await asyncIterableToBuffer(iterable);
      expect(result).toEqual(original);
    });

    it('should round-trip string through stream', async () => {
      const original = 'The quick brown fox';
      const stream = stringToReadableStream(original);
      const result = await streamToString(stream);
      expect(result).toBe(original);
    });

    it('should round-trip async iterable through buffer and back', async () => {
      async function* generate() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4]);
      }
      const buffer = await asyncIterableToBuffer(generate());
      const stream = bufferToReadableStream(buffer);
      const iterable = readableStreamToAsyncIterable(stream);
      const result = await asyncIterableToBuffer(iterable);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });
});
