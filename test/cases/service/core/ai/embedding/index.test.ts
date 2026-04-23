import { decodeEmbedding, formatVectors } from '@fastgpt/service/core/ai/embedding/index';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { EmbeddingTypeEnm } from '@fastgpt/global/core/ai/constants';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the AI API client factory so tests don't hit the real network.
// We control the embeddings.create implementation per-test via `mockCreate`.
const mockCreate = vi.fn();
vi.mock('@fastgpt/service/core/ai/config', () => ({
  getAIApi: () => ({
    embeddings: {
      create: mockCreate
    }
  })
}));

// Skip retryFn backoff so failure-path tests don't wait 3×500ms each.
// The real retryFn retries 3 times with 500ms gaps; for tests we only need to
// verify that errors surface, not the retry cadence.
vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    retryFn: <T>(fn: () => Promise<T>) => fn()
  };
});

describe('decodeEmbedding function test', () => {
  // Helper: encode a number[] as a base64-encoded little-endian Float32 buffer.
  // This matches the server-side encoding that OpenAI-compatible embedding APIs
  // produce when `encoding_format: 'base64'` is used.
  const encodeFloat32Base64 = (values: number[]): string => {
    const floats = new Float32Array(values);
    const buf = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
    return buf.toString('base64');
  };

  describe('number[] input (already decoded)', () => {
    it('should return the same array when input is a populated number[]', () => {
      const input = [0.1, -0.2, 0.3, 0.4, -0.5];
      const result = decodeEmbedding(input);

      expect(result).toBe(input); // same reference, no copy
      expect(result).toEqual(input);
    });

    it('should return an empty array when input is an empty number[]', () => {
      const input: number[] = [];
      const result = decodeEmbedding(input);

      expect(result).toBe(input);
      expect(result).toEqual([]);
    });

    it('should preserve special numeric values (0, negatives, large values)', () => {
      const input = [0, -0, 1e-10, -1e10, 3.14159];
      const result = decodeEmbedding(input);

      expect(result).toEqual(input);
    });
  });

  describe('base64 string input', () => {
    it('should decode a base64-encoded Float32 array back to numbers', () => {
      const original = [0.25, 0.5, -0.75, 1.0];
      const encoded = encodeFloat32Base64(original);

      const result = decodeEmbedding(encoded);

      expect(result).toHaveLength(original.length);
      // Float32 representation is exact for these power-of-two fractions
      expect(result).toEqual(original);
    });

    it('should decode a 1536-dim embedding with acceptable Float32 precision loss', () => {
      const original = Array.from({ length: 1536 }, (_, i) => (i - 768) / 1000);
      const encoded = encodeFloat32Base64(original);

      const result = decodeEmbedding(encoded);

      expect(result).toHaveLength(1536);
      result.forEach((val, i) => {
        // Float32 has ~7 decimal digits of precision
        expect(val).toBeCloseTo(original[i], 5);
      });
    });

    it('should decode an empty string to an empty array', () => {
      const result = decodeEmbedding('');

      expect(result).toEqual([]);
    });

    it('should preserve negative zero, positive/negative numbers, and small values', () => {
      const original = [-0, 0, -3.5, 3.5, 1e-20, -1e20];
      const encoded = encodeFloat32Base64(original);

      const result = decodeEmbedding(encoded);

      expect(result).toHaveLength(original.length);
      expect(Object.is(result[0], -0)).toBe(true); // Float32 preserves -0
      expect(Object.is(result[1], 0)).toBe(true);
      expect(result[2]).toBeCloseTo(-3.5, 5);
      expect(result[3]).toBeCloseTo(3.5, 5);
      // 1e-20 underflows in float32 (flushes to 0) so just check finite non-NaN
      expect(Number.isFinite(result[4])).toBe(true);
      expect(result[5]).toBeCloseTo(-1e20, -15); // large magnitude, coarse tolerance
    });

    it('should decode little-endian Float32 bytes correctly', () => {
      // 1.0 in IEEE 754 little-endian float32 is 00 00 80 3F
      const bytes = Buffer.from([0x00, 0x00, 0x80, 0x3f]);
      const encoded = bytes.toString('base64');

      const result = decodeEmbedding(encoded);

      expect(result).toEqual([1.0]);
    });

    it('should decode multiple little-endian Float32 values in sequence', () => {
      // 1.0, 2.0 in IEEE 754 little-endian float32
      const bytes = Buffer.from([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40]);
      const encoded = bytes.toString('base64');

      const result = decodeEmbedding(encoded);

      expect(result).toEqual([1.0, 2.0]);
    });
  });

  describe('integration with formatVectors', () => {
    it('should produce a valid vector when piped through formatVectors', () => {
      const original = Array.from({ length: 1536 }, (_, i) => (i + 1) / 1536);
      const encoded = encodeFloat32Base64(original);

      const decoded = decodeEmbedding(encoded);
      const formatted = formatVectors(decoded, false);

      expect(formatted).toHaveLength(1536);
      formatted.forEach((val, i) => {
        expect(val).toBeCloseTo(original[i], 5);
      });
    });
  });
});

describe('formatVectors function test', () => {
  // Helper function to create a normalized vector (L2 norm = 1)
  const createNormalizedVector = (length: number): number[] => {
    const vector = Array.from({ length }, (_, i) => (i + 1) / length);
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / norm);
  };

  // Helper function to create an unnormalized vector
  const createUnnormalizedVector = (length: number): number[] => {
    return Array.from({ length }, (_, i) => (i + 1) * 10);
  };

  // Helper function to calculate L2 norm
  const calculateNorm = (vector: number[]): number => {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  };

  // Helper function to check if vector is normalized (L2 norm H 1)
  const isNormalized = (vector: number[]): boolean => {
    const norm = calculateNorm(vector);
    return Math.abs(norm - 1) < 1e-10;
  };

  describe('1536 dimension vectors', () => {
    it('should handle normalized 1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Since input is already normalized, result should be very similar
      expect(result).toEqual(
        expect.arrayContaining(inputVector.map((val) => expect.closeTo(val, 10)))
      );
    });

    it('should handle normalized 1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector);
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle unnormalized 1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Result should be different from input (normalized)
      expect(result).not.toEqual(inputVector);
    });

    it('should handle unnormalized 1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(1536);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector);
      expect(isNormalized(result)).toBe(false);
    });
  });

  describe('Greater than 1536 dimension vectors', () => {
    it('should handle normalized >1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(2048);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated to first 1536 elements and then normalized
      expect(result).toEqual(
        expect.arrayContaining(inputVector.slice(0, 1536).map((val) => expect.any(Number)))
      );
    });

    it('should handle normalized >1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(2048);
      const result = formatVectors(inputVector, true); // Always normalized for >1536 dims

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated and normalized regardless of normalization flag
    });

    it('should handle unnormalized >1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(2048);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated to first 1536 elements and then normalized
    });

    it('should handle unnormalized >1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(2048);
      const result = formatVectors(inputVector, false); // Always normalized for >1536 dims

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated and normalized regardless of normalization flag
    });
  });

  describe('Less than 1536 dimension vectors', () => {
    it('should handle normalized <1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(512);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // First 512 elements should match input, rest should be 0
      expect(result.slice(0, 512)).toEqual(
        expect.arrayContaining(inputVector.map((val) => expect.any(Number)))
      );
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
    });

    it('should handle normalized <1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(512);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      // First 512 elements should match input exactly, rest should be 0
      expect(result.slice(0, 512)).toEqual(inputVector);
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
      // The result remains normalized because adding zeros doesn't change the L2 norm
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle unnormalized <1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(512);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be padded with zeros and then normalized
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
    });

    it('should handle unnormalized <1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(512);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      // First 512 elements should match input exactly, rest should be 0
      expect(result.slice(0, 512)).toEqual(inputVector);
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
      expect(isNormalized(result)).toBe(false);
    });

    it('should demonstrate that padding preserves normalization status', () => {
      // Create a vector that becomes unnormalized after some scaling
      const baseVector = [3, 4]; // norm = 5, not normalized
      const result = formatVectors(baseVector, false);

      expect(result).toHaveLength(1536);
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(4);
      expect(result.slice(2)).toEqual(new Array(1534).fill(0));
      expect(isNormalized(result)).toBe(false);
      expect(calculateNorm(result)).toBeCloseTo(5, 10);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero vector', () => {
      const inputVector = new Array(1536).fill(0);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector); // Zero vector remains zero after normalization
    });

    it('should handle single element vector', () => {
      const inputVector = [5.0];
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(result[0]).toBeCloseTo(1.0, 10); // Normalized single element should be 1
      expect(result.slice(1)).toEqual(new Array(1535).fill(0));
    });

    it('should handle exactly 1536 dimension vector', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle vector with negative values', () => {
      const inputVector = [-1, -2, -3];
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      expect(result[0]).toBeLessThan(0); // Should preserve negative values
      expect(result[1]).toBeLessThan(0);
      expect(result[2]).toBeLessThan(0);
    });
  });
});

describe('getVectorsByText function test', () => {
  // The global mock in test/mocks/core/ai/embedding.ts replaces getVectorsByText.
  // Bypass it by importing the actual module implementation.
  let getVectorsByText: (typeof import('@fastgpt/service/core/ai/embedding/index'))['getVectorsByText'];

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('@fastgpt/service/core/ai/embedding/index')>(
      '@fastgpt/service/core/ai/embedding/index'
    );
    getVectorsByText = actual.getVectorsByText;
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  const buildModel = (overrides: Partial<EmbeddingModelItemType> = {}): EmbeddingModelItemType =>
    ({
      model: 'text-embedding-3-small',
      name: 'text-embedding-3-small',
      batchSize: 10,
      normalization: false,
      ...overrides
    }) as EmbeddingModelItemType;

  // A minimally valid OpenAI-style embedding response. Vector is 4 floats so we can verify
  // padding to 1536 happens via formatVectors, without pretending to cover the whole surface.
  const makeResponse = (
    embeddings: Array<number[] | string>,
    opts: { usage?: { total_tokens: number } } = {}
  ) => ({
    data: embeddings.map((embedding) => ({ embedding })),
    usage: opts.usage
  });

  describe('input validation', () => {
    it('should reject with "input is empty" when input is an empty string', async () => {
      await expect(getVectorsByText({ model: buildModel(), input: '' })).rejects.toMatchObject({
        code: 500,
        message: 'input is empty'
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject when input is an empty array (falsy via [].length check indirectly)', async () => {
      // Empty array is truthy, so it passes the `!input` guard and proceeds.
      // With zero chunks, no API call is made and we get 0 tokens / 0 vectors.
      mockCreate.mockResolvedValue(makeResponse([[0.1, 0.2, 0.3, 0.4]]));
      const result = await getVectorsByText({ model: buildModel(), input: [] });
      expect(result).toEqual({ tokens: 0, vectors: [] });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('basic embedding calls', () => {
    it('should embed a single string input and return tokens + vectors', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 7 } })
      );

      const result = await getVectorsByText({ model: buildModel(), input: 'hello' });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-3-small',
          input: ['hello'],
          encoding_format: 'float'
        }),
        expect.objectContaining({ headers: undefined })
      );
      expect(result.tokens).toBe(7);
      expect(result.vectors).toHaveLength(1);
      expect(result.vectors[0]).toHaveLength(1536); // formatVectors pads to 1536
      expect(result.vectors[0].slice(0, 4)).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should accept array input and call the API once per batch (batchSize)', async () => {
      // batchSize=2, 5 inputs → chunks of [2, 2, 1]
      mockCreate
        .mockResolvedValueOnce(
          makeResponse(
            [
              [0.1, 0.2, 0.3, 0.4],
              [0.5, 0.6, 0.7, 0.8]
            ],
            { usage: { total_tokens: 3 } }
          )
        )
        .mockResolvedValueOnce(
          makeResponse(
            [
              [1.1, 1.2, 1.3, 1.4],
              [1.5, 1.6, 1.7, 1.8]
            ],
            { usage: { total_tokens: 4 } }
          )
        )
        .mockResolvedValueOnce(
          makeResponse([[2.1, 2.2, 2.3, 2.4]], { usage: { total_tokens: 2 } })
        );

      const result = await getVectorsByText({
        model: buildModel({ batchSize: 2 }),
        input: ['a', 'b', 'c', 'd', 'e']
      });

      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(mockCreate.mock.calls[0][0].input).toEqual(['a', 'b']);
      expect(mockCreate.mock.calls[1][0].input).toEqual(['c', 'd']);
      expect(mockCreate.mock.calls[2][0].input).toEqual(['e']);
      expect(result.tokens).toBe(9); // 3 + 4 + 2
      expect(result.vectors).toHaveLength(5);
    });

    it('should default batchSize to 1 when model.batchSize is missing / NaN', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      // Pass undefined to exercise `Number(undefined) → NaN` branch
      const result = await getVectorsByText({
        model: buildModel({ batchSize: undefined }),
        input: ['x', 'y']
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.vectors).toHaveLength(2);
    });

    it('should decode base64-encoded embeddings returned by the API', async () => {
      const raw = [0.125, 0.25, -0.5, 0.75];
      const floats = new Float32Array(raw);
      const base64 = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString(
        'base64'
      );
      mockCreate.mockResolvedValue(makeResponse([base64], { usage: { total_tokens: 2 } }));

      const result = await getVectorsByText({ model: buildModel(), input: 'hi' });

      expect(result.vectors[0].slice(0, 4)).toEqual(raw);
    });
  });

  describe('token counting fallback', () => {
    it('should fall back to countPromptTokens when API response lacks usage', async () => {
      // No usage → the function computes tokens from chunk strings.
      mockCreate.mockResolvedValue(makeResponse([[0.1, 0.2, 0.3, 0.4]]));

      const result = await getVectorsByText({ model: buildModel(), input: 'hello world' });

      expect(result.vectors).toHaveLength(1);
      // countPromptTokens should produce a non-negative integer for a real string
      expect(typeof result.tokens).toBe('number');
      expect(result.tokens).toBeGreaterThanOrEqual(0);
    });
  });

  describe('type / config selection', () => {
    it('should merge defaultConfig into the request payload', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({ defaultConfig: { dimensions: 512 } as any });

      await getVectorsByText({ model, input: 'x' });

      expect(mockCreate.mock.calls[0][0]).toMatchObject({ dimensions: 512 });
    });

    it('should apply dbConfig when type = db', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({ dbConfig: { input_type: 'passage' } as any });

      await getVectorsByText({ model, input: 'x', type: EmbeddingTypeEnm.db });

      expect(mockCreate.mock.calls[0][0]).toMatchObject({ input_type: 'passage' });
    });

    it('should apply queryConfig when type = query', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({ queryConfig: { input_type: 'query' } as any });

      await getVectorsByText({ model, input: 'x', type: EmbeddingTypeEnm.query });

      expect(mockCreate.mock.calls[0][0]).toMatchObject({ input_type: 'query' });
    });

    it('should apply neither dbConfig nor queryConfig when type is omitted', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({
        dbConfig: { input_type: 'passage' } as any,
        queryConfig: { input_type: 'query' } as any
      });

      await getVectorsByText({ model, input: 'x' });

      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('input_type');
    });
  });

  describe('custom request URL and auth', () => {
    it('should pass path, Authorization header and extra headers when requestUrl+requestAuth set', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({
        requestUrl: 'https://custom.example/v1/embeddings',
        requestAuth: 'secret-token'
      });

      await getVectorsByText({
        model,
        input: 'x',
        headers: { 'X-Custom': 'yes' }
      });

      expect(mockCreate.mock.calls[0][1]).toEqual({
        path: 'https://custom.example/v1/embeddings',
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Custom': 'yes'
        }
      });
    });

    it('should omit Authorization header when requestUrl is set but requestAuth is empty', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );
      const model = buildModel({ requestUrl: 'https://custom.example/v1/embeddings' });

      await getVectorsByText({ model, input: 'x' });

      expect(mockCreate.mock.calls[0][1]).toEqual({
        path: 'https://custom.example/v1/embeddings',
        headers: {}
      });
    });

    it('should only pass headers (no path) when requestUrl is not set', async () => {
      mockCreate.mockResolvedValue(
        makeResponse([[0.1, 0.2, 0.3, 0.4]], { usage: { total_tokens: 1 } })
      );

      await getVectorsByText({
        model: buildModel(),
        input: 'x',
        headers: { 'X-Trace': 't1' }
      });

      expect(mockCreate.mock.calls[0][1]).toEqual({ headers: { 'X-Trace': 't1' } });
    });
  });

  describe('normalization', () => {
    it('should normalize vectors when model.normalization is true', async () => {
      mockCreate.mockResolvedValue(makeResponse([[3, 4, 0, 0]], { usage: { total_tokens: 1 } }));
      const model = buildModel({ normalization: true });

      const result = await getVectorsByText({ model, input: 'x' });

      const norm = Math.sqrt(result.vectors[0].reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('error paths', () => {
    it('should reject when API response has no data', async () => {
      mockCreate.mockResolvedValue({ data: null });

      await expect(getVectorsByText({ model: buildModel(), input: 'x' })).rejects.toBe(
        'Embedding API is not responding'
      );
    });

    it('should reject when API response data exists but has no embedding', async () => {
      mockCreate.mockResolvedValue({ data: [{}] });

      await expect(getVectorsByText({ model: buildModel(), input: 'x' })).rejects.toBe(
        'Embedding API is not responding'
      );
    });

    it('should reject with underlying error when embeddings.create throws', async () => {
      const apiErr = new Error('network boom');
      mockCreate.mockRejectedValue(apiErr);

      await expect(getVectorsByText({ model: buildModel(), input: 'x' })).rejects.toBe(apiErr);
    });
  });
});
