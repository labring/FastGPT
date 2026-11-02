import { describe, expect, it } from 'vitest';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import {
  headerValue2StoreHeader,
  storeHeader2HeaderValue,
  type HeaderSecretConfigType
} from '@/components/common/secret/HeaderAuthConfig';

const ref = { ref: ['node', 'token'] as [string, string] };
const cases: { form: HeaderSecretConfigType; store: StoreSecretValueType }[] = [
  { form: {}, store: {} },
  { form: { Bearer: ref }, store: { Bearer: ref } },
  { form: { Basic: ref }, store: { Basic: ref } },
  {
    form: {
      customs: [
        { key: 'X-Token', value: ref },
        { key: 'Authorization', value: { secret: 'cipher' } }
      ]
    },
    store: { 'X-Token': ref, Authorization: { secret: 'cipher' } }
  }
];

describe('headerValue2StoreHeader', () => {
  it('stores each header mode without resolving references or adding schemes', () => {
    for (const { form, store } of cases) {
      expect(headerValue2StoreHeader(form)).toEqual(store);
    }
  });
});

describe('storeHeader2HeaderValue', () => {
  it('restores each editor mode and initializes absent configuration', () => {
    for (const { form, store } of cases) {
      expect(storeHeader2HeaderValue(store)).toEqual(form);
    }
    expect(storeHeader2HeaderValue()).toEqual({});
  });
});
