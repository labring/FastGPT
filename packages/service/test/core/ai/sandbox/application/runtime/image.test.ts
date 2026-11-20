import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOpenSandboxRuntimeConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxRuntimeConfig: mocks.getOpenSandboxRuntimeConfig
}));

import {
  isSandboxRuntimeImageMatched,
  normalizeSandboxImage,
  resolveSandboxRuntimeImage
} from '@fastgpt/service/core/ai/sandbox/application/runtime/image';

describe('normalizeSandboxImage', () => {
  it('normalizes string and object image forms without treating registry ports or digests as tags', () => {
    expect(normalizeSandboxImage('registry.example.com/team/runtime:v2')).toEqual({
      repository: 'registry.example.com/team/runtime',
      tag: 'v2'
    });
    expect(normalizeSandboxImage('registry.example.com:5000/team/runtime')).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: ''
    });
    expect(
      normalizeSandboxImage('registry.example.com:5000/team/runtime:v2@sha256:abcdef1234')
    ).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: 'v2'
    });
    expect(
      normalizeSandboxImage('registry.example.com:5000/team/runtime@sha256:abcdef1234')
    ).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: '@sha256:abcdef1234'
    });
    expect(
      normalizeSandboxImage({
        repository: 'registry.example.com:5000/team/runtime',
        digest: 'sha256:abcdef1234'
      })
    ).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: '@sha256:abcdef1234'
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
    mocks.getOpenSandboxRuntimeConfig.mockReturnValue({
      rawImage: 'team/runtime:v4',
      image: { repository: 'team/runtime', tag: 'v4' },
      createConfig: { image: 'team/runtime:v4' }
    });

    expect(
      resolveSandboxRuntimeImage({
        createConfig: { env: { KEY: 'value' } }
      })
    ).toEqual({ repository: 'team/runtime', tag: 'v4' });
    expect(mocks.getOpenSandboxRuntimeConfig).toHaveBeenCalledWith({
      createConfig: { env: { KEY: 'value' } }
    });
  });
});
