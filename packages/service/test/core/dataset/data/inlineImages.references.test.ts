import { describe, expect, it } from 'vitest';
import { getDatasetImageReferences } from '@fastgpt/service/core/dataset/data/inlineImages/utils';
import { getS3ObjectKeysFromTexts } from '@fastgpt/service/common/s3/utils/preview';

const key = `dataset/507f1f77bcf86cd799439011/inline-images/file/${'a'.repeat(32)}.png`;

describe('dataset inline image reference syntax', () => {
  it.each([
    `[view](${key})`,
    `[view](<${key}>)`,
    `[view]( ${key} "caption" )`,
    `[view](${key} 'caption')`,
    `[view](${key} (caption))`,
    `![view](${key})`,
    `<img src="${key}">`
  ])('protects a reference recognized by the actual preview consumer: %s', (text) => {
    expect(getS3ObjectKeysFromTexts([text])).toEqual([key]);
    expect([...getDatasetImageReferences({ q: text })]).toContain(key);
  });

  it.each([
    { q: `[view](${key})` },
    { a: `[view](${key})` },
    { history: [{ q: `[view](${key})` }] },
    { history: [{ a: `[view](${key})` }] },
    { indexes: [{ text: `[view](${key})` }] }
  ])('finds ordinary links in every guarded content field: %j', (data) => {
    expect([...getDatasetImageReferences(data)]).toEqual([key]);
  });

  it('normalizes escaped Markdown link destinations without unescaping HTML attributes', () => {
    const escapedKey = key.replace('.png', '\\.png');
    expect([...getDatasetImageReferences({ q: `[view](${escapedKey})` })]).toEqual([key]);
    expect([...getDatasetImageReferences({ q: `<img src="${escapedKey}">` })]).toEqual([
      escapedKey
    ]);
  });
});
