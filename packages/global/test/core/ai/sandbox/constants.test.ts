import { describe, it, expect } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';

describe('generateSandboxId', () => {
  it('should return same ID for same triplet', () => {
    const id1 = generateSandboxId('app1', 'user1', 'chat1');
    const id2 = generateSandboxId('app1', 'user1', 'chat1');
    expect(id1).toBe(id2);
  });

  it('should return different IDs for different triplets', () => {
    const id1 = generateSandboxId('app1', 'user1', 'chat1');
    const id2 = generateSandboxId('app1', 'user1', 'chat2');
    const id3 = generateSandboxId('app2', 'user1', 'chat1');
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id2).not.toBe(id3);
  });

  it('should return a 16-char hex string', () => {
    const id = generateSandboxId('app1', 'user1', 'chat1');
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should hash mixed-case source into a lowercase hex string', () => {
    const id = generateSandboxId(
      '69ce5237057b145f058436f4',
      '69ce490acaad46cd13982521',
      'debug-69ce5237057b145f058436f4-7BdojPlukIQw'
    );

    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
