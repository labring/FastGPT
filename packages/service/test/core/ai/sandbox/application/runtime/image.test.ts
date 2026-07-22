import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSandboxAdapterConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxAdapterConfig: mocks.getSandboxAdapterConfig
}));

import {
  isSandboxRuntimeImageMatched,
  normalizeSandboxImage,
  resolveSandboxRuntimeImage
} from '@fastgpt/service/core/ai/sandbox/application/runtime/image';

describe('normalizeSandboxImage', () => {
  it('normalizes string and object image forms without treating registry ports as tags', () => {
    expect(normalizeSandboxImage('registry.example.com/team/runtime:v2')).toEqual({
      repository: 'registry.example.com/team/runtime',
      tag: 'v2'
    });
    expect(normalizeSandboxImage('registry.example.com:5000/team/runtime')).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: ''
    });
    expect(normalizeSandboxImage({ repository: 'team/runtime:v3' })).toEqual({
      repository: 'team/runtime',
      tag: 'v3'
    });
    expect(normalizeSandboxImage({ repository: 'team/runtime', tag: 'stable' })).toEqual({
      repository: 'team/runtime',
      tag: 'stable'
    });
    expect(normalizeSandboxImage()).toBeUndefined();
  });
});

describe('isSandboxRuntimeImageMatched', () => {
  it('compares only normalized repository and tag', () => {
    const runtimeImage = { repository: 'team/runtime', tag: 'v2' };

    expect(isSandboxRuntimeImageMatched(undefined, undefined)).toBe(true);
    expect(isSandboxRuntimeImageMatched(runtimeImage, 'team/runtime:v2')).toBe(true);
    expect(isSandboxRuntimeImageMatched(runtimeImage, { repository: 'team/runtime:v2' })).toBe(
      true
    );
    expect(isSandboxRuntimeImageMatched(runtimeImage, undefined)).toBe(false);
    expect(isSandboxRuntimeImageMatched(runtimeImage, 'team/runtime:v1')).toBe(false);
    expect(isSandboxRuntimeImageMatched(runtimeImage, 'other/runtime:v2')).toBe(false);
  });
});

describe('resolveSandboxRuntimeImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the backend runtime create config as the target image source', () => {
    mocks.getSandboxAdapterConfig.mockReturnValue({
      createConfig: { image: 'team/runtime:v4' }
    });

    expect(
      resolveSandboxRuntimeImage({
        provider: 'opensandbox',
        sandboxId: 'app-sandbox',
        createConfig: { env: { KEY: 'value' } }
      })
    ).toEqual({ repository: 'team/runtime', tag: 'v4' });
    expect(mocks.getSandboxAdapterConfig).toHaveBeenCalledWith({
      provider: 'opensandbox',
      runtime: true,
      sessionId: 'app-sandbox',
      createConfig: { env: { KEY: 'value' } }
    });
  });
});
