import { describe, expect, it } from 'vitest';
import {
  fileDataToUint8Array,
  octalNumberToPosixMode,
  posixModeToOctalNumber
} from '@/utils/files';

describe('file mode boundary helpers', () => {
  it('round-trips POSIX bitmasks through provider octal digits', () => {
    for (const [posixMode, providerMode] of [
      [0o644, 644],
      [0o755, 755],
      [0o4755, 4755]
    ] as const) {
      expect(posixModeToOctalNumber(posixMode)).toBe(providerMode);
      expect(octalNumberToPosixMode(providerMode)).toBe(posixMode);
    }
  });

  it('rejects invalid mode values at the provider boundary', () => {
    for (const mode of [-1, 0o10000, 1.5]) {
      expect(() => posixModeToOctalNumber(mode)).toThrow(TypeError);
    }
    for (const mode of [-1, 888, 64.4]) {
      expect(() => octalNumberToPosixMode(mode)).toThrow(TypeError);
    }
  });

  it('normalizes browser and text payloads at the provider boundary', async () => {
    const expected = new TextEncoder().encode('hello');

    await expect(fileDataToUint8Array('hello')).resolves.toEqual(expected);
    await expect(fileDataToUint8Array(new Blob(['hello']))).resolves.toEqual(expected);
  });
});
