import { describe, expect, it } from 'vitest';

import {
  isSandboxRuntimeImageMatched,
  normalizeSandboxImage
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
      tag: 'v2@sha256:abcdef1234'
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
        tag: 'v2',
        digest: 'sha256:abcdef1234'
      })
    ).toEqual({
      repository: 'registry.example.com:5000/team/runtime',
      tag: 'v2@sha256:abcdef1234'
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
    expect(
      isSandboxRuntimeImageMatched(
        { repository: 'team/runtime', tag: 'v2', digest: 'sha256:abc' } as any,
        { repository: 'team/runtime', tag: 'v2@sha256:abc' }
      )
    ).toBe(true);
    expect(
      isSandboxRuntimeImageMatched(
        { repository: 'team/runtime', tag: 'v2', digest: 'sha256:abc' } as any,
        { repository: 'team/runtime', tag: 'v2@sha256:def' }
      )
    ).toBe(false);
  });
});
