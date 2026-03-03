/**
 * Stream utilities for working with ReadableStream and AsyncIterable.
 */

/**
 * Convert an AsyncIterable to a Uint8Array.
 * Collects all chunks into a single buffer.
 */
export async function asyncIterableToBuffer(
  iterable: AsyncIterable<Uint8Array>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of iterable) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Convert a Uint8Array to a ReadableStream.
 */
export function bufferToReadableStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    }
  });
}

/**
 * Convert a string to a ReadableStream.
 */
export function stringToReadableStream(str: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return bufferToReadableStream(encoder.encode(str));
}

/**
 * Convert a ReadableStream to an AsyncIterable.
 * (Native ReadableStream is already async iterable in modern environments,
 * but this ensures compatibility.)
 */
export function readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> {
  // If stream already has Symbol.asyncIterator, use it
  if (stream[Symbol.asyncIterator]) {
    return stream as AsyncIterable<Uint8Array>;
  }
  // Otherwise create an async iterable
  return {
    [Symbol.asyncIterator]: async function* () {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
}

/**
 * Read a stream and convert to string.
 */
export async function streamToString(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): Promise<string> {
  const iterable =
    stream instanceof ReadableStream ? readableStreamToAsyncIterable(stream) : stream;

  const buffer = await asyncIterableToBuffer(iterable);
  return new TextDecoder().decode(buffer);
}
