import { describe, expect, it } from 'vitest';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue,
  type HeaderSecretConfigType
} from '@/components/common/secret/HeaderAuthConfig';
import {
  formatReferenceValue,
  getShowInput,
  getSingleReference,
  shouldRenderReferenceSelector
} from '@/components/common/secret/HeaderAuthForm';

const bearerRef = { ref: ['node', 'token'] } as const;
const basicRef = { ref: ['node', 'credentials'] } as const;
const customRef = { ref: ['node', 'headerValue'] } as const;
const tupleArrayRef = {
  ref: [
    ['node', 'header-a'],
    ['node', 'header-b']
  ]
} as const;

describe('HeaderAuth ref helpers', () => {
  it('round-trips raw Bearer and Basic references without adding a scheme', () => {
    const bearer: HeaderSecretConfigType = { Bearer: bearerRef };
    const basic: HeaderSecretConfigType = { Basic: basicRef };

    expect(headerValue2StoreHeader(bearer)).toEqual({ Bearer: bearerRef });
    expect(headerValue2StoreHeader(basic)).toEqual({ Basic: basicRef });
    expect(storeHeader2HeaderValue({ Bearer: bearerRef } as StoreSecretValueType)).toEqual(bearer);
    expect(storeHeader2HeaderValue({ Basic: basicRef } as StoreSecretValueType)).toEqual(basic);
  });

  it('round-trips custom header references while keeping the key separate', () => {
    const custom: HeaderSecretConfigType = {
      customs: [{ key: 'X-Token', value: customRef }]
    };

    expect(headerValue2StoreHeader(custom)).toEqual({ 'X-Token': customRef });
    expect(storeHeader2HeaderValue({ 'X-Token': customRef } as StoreSecretValueType)).toEqual(
      custom
    );
  });

  it('keeps tuple-array references read-only for the single-reference UI', () => {
    expect(getSingleReference(tupleArrayRef)).toBeUndefined();
    expect(formatReferenceValue(tupleArrayRef)).toBe('node / header-a, node / header-b');
  });

  it('renders the reference selector before a value has been selected', () => {
    expect(shouldRenderReferenceSelector({ mode: 'reference' })).toBe(true);
  });

  it('shows the input only for empty or actively edited values', () => {
    expect(getShowInput({ secretValue: { value: '' }, index: 0 })).toBe(true);
    expect(getShowInput({ secretValue: { value: 'token' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { secret: 'encrypted' }, index: 0 })).toBe(false);
    expect(getShowInput({ secretValue: { value: 'token' }, editingIndex: 0, index: 0 })).toBe(true);
  });
});
