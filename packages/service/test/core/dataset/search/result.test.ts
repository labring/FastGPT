import { describe, expect, it } from 'vitest';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { removeDuplicateSearchResults } from '@fastgpt/service/core/dataset/search/defaultRecall/result';

const candidate = (
  id: string,
  overrides: Partial<SearchDataResponseItemType> = {}
): SearchDataResponseItemType => ({
  id,
  q: 'A red handbag',
  a: '',
  datasetId: 'dataset',
  collectionId: 'collection',
  sourceName: 'catalogue',
  sourceId: 'catalogue-file',
  updateTime: new Date('2026-01-01'),
  chunkIndex: 0,
  score: [{ type: SearchScoreTypeEnum.embedding, value: 0.9, index: 0 }],
  ...overrides
});

describe('removeDuplicateSearchResults', () => {
  it('keeps different images with the same caption', () => {
    const first = candidate('first', { imageId: 'dataset/dataset/front.png' });
    const second = candidate('second', { imageId: 'dataset/dataset/back.png' });

    expect(removeDuplicateSearchResults([first, second])).toEqual([first, second]);
  });

  it('keeps different images without captions', () => {
    const first = candidate('first', { q: '', imageId: 'dataset/dataset/first.png' });
    const second = candidate('second', { q: '', imageId: 'dataset/dataset/second.png' });

    expect(removeDuplicateSearchResults([first, second])).toEqual([first, second]);
  });

  it('keeps a text result alongside an image with the same text', () => {
    const text = candidate('text');
    const image = candidate('image', { imageId: 'dataset/dataset/photo.png' });

    expect(removeDuplicateSearchResults([text, image])).toEqual([text, image]);
    expect(removeDuplicateSearchResults([image, text])).toEqual([image, text]);
  });

  it('deduplicates the same image and normalized caption across different chunks', () => {
    const first = candidate('first', { imageId: 'dataset/dataset/photo.png' });
    const duplicate = candidate('duplicate', {
      q: 'A red, handbag!',
      imageId: 'dataset/dataset/photo.png',
      collectionId: 'other-collection'
    });

    expect(removeDuplicateSearchResults([first, duplicate])).toEqual([first]);
  });

  it('retains distinct text attached to the same image', () => {
    const front = candidate('front', { imageId: 'dataset/dataset/photo.png' });
    const detail = candidate('detail', {
      q: 'The handbag has two internal compartments',
      imageId: 'dataset/dataset/photo.png'
    });

    expect(removeDuplicateSearchResults([front, detail])).toEqual([front, detail]);
  });

  it('retains distinct answers attached to the same image', () => {
    const first = candidate('first', { imageId: 'dataset/dataset/photo.png', a: 'Leather' });
    const second = candidate('second', { imageId: 'dataset/dataset/photo.png', a: 'Canvas' });

    expect(removeDuplicateSearchResults([first, second])).toEqual([first, second]);
  });

  it.each([
    ['dataset/dataset/a-b.png', 'dataset/dataset/ab.png'],
    ['dataset/dataset/photo.png', 'dataset/dataset/PHOTO.png'],
    ['dataset/first/photo.png', 'dataset/second/photo.png'],
    ['https://images.test/photo.png?version=1', 'https://images.test/photo.png?version=2'],
    ['https://images.test/a.png#front', 'https://images.test/a.png#back']
  ])('compares image identities exactly: %s versus %s', (firstImage, secondImage) => {
    const first = candidate('first', { imageId: firstImage });
    const second = candidate('second', { imageId: secondImage });

    expect(removeDuplicateSearchResults([first, second])).toEqual([first, second]);
  });

  it('does not confuse a URL in text with a standalone image', () => {
    const text = candidate('text', { q: '![A red handbag](https://images.test/photo.png)' });
    const image = candidate('image', { imageId: 'https://images.test/photo.png' });

    expect(removeDuplicateSearchResults([text, image])).toEqual([text, image]);
  });

  it('preserves punctuation and whitespace normalization for text-only results', () => {
    const first = candidate('first', { q: 'Hello, world!', a: 'An answer.' });
    const duplicate = candidate('duplicate', { q: 'Hello world', a: 'An\nanswer' });

    expect(removeDuplicateSearchResults([first, duplicate])).toEqual([first]);
  });

  it('preserves Unicode letters and numbers in normalized text', () => {
    const first = candidate('first', { q: '红色手袋，型号１２３', a: '容量：2升' });
    const duplicate = candidate('duplicate', { q: '红色手袋型号１２３', a: '容量2升' });
    const distinct = candidate('distinct', { q: '蓝色手袋型号１２３', a: '容量2升' });

    expect(removeDuplicateSearchResults([first, duplicate, distinct])).toEqual([first, distinct]);
  });

  it('keeps case-sensitive text comparisons', () => {
    const lower = candidate('lower', { q: 'red handbag' });
    const upper = candidate('upper', { q: 'Red handbag' });

    expect(removeDuplicateSearchResults([lower, upper])).toEqual([lower, upper]);
  });

  it('treats a missing optional answer like an empty answer', () => {
    const first = candidate('first', { a: undefined });
    const duplicate = candidate('duplicate', { a: '' });

    expect(removeDuplicateSearchResults([first, duplicate])).toEqual([first]);
  });

  it('does not add the literal word undefined to a missing answer', () => {
    const first = candidate('first', { a: undefined });
    const distinct = candidate('distinct', { a: 'undefined' });

    expect(removeDuplicateSearchResults([first, distinct])).toEqual([first, distinct]);
  });

  it('treats an empty imageId as a text-only result', () => {
    const first = candidate('first');
    const duplicate = candidate('duplicate', { imageId: '' });

    expect(removeDuplicateSearchResults([first, duplicate])).toEqual([first]);
  });

  it('keeps the first candidate and its source, metadata and scores intact', () => {
    const first = candidate('first', {
      imageId: 'dataset/dataset/photo.png',
      metadata: { page: 1 },
      score: [{ type: SearchScoreTypeEnum.reRank, value: 0.99, index: 0 }]
    });
    const second = candidate('second', {
      imageId: 'dataset/dataset/photo.png',
      sourceName: 'another source',
      metadata: { page: 2 }
    });
    const result = removeDuplicateSearchResults([first, second]);

    expect(result).toEqual([first]);
    expect(result[0]).toBe(first);
    expect(result[0].score).toBe(first.score);
    expect(result[0].metadata).toEqual({ page: 1 });
  });

  it('does not mutate the candidate list or any candidate fields', () => {
    const first = candidate('first', { imageId: 'dataset/dataset/first.png' });
    const second = candidate('second', { imageId: 'dataset/dataset/second.png' });
    const duplicate = candidate('duplicate', { imageId: first.imageId });
    const input = [first, second, duplicate];
    const snapshot = structuredClone(input);

    const result = removeDuplicateSearchResults(input);

    expect(input).toEqual(snapshot);
    expect(result).not.toBe(input);
    expect(result).toEqual([first, second]);
  });

  it('preserves order when text and image duplicates are interleaved', () => {
    const first = candidate('first', { imageId: 'dataset/dataset/first.png' });
    const text = candidate('text');
    const second = candidate('second', { imageId: 'dataset/dataset/second.png' });
    const duplicates = [
      candidate('duplicate-text'),
      candidate('duplicate-image', { imageId: first.imageId })
    ];

    expect(removeDuplicateSearchResults([first, text, second, ...duplicates])).toEqual([
      first,
      text,
      second
    ]);
  });

  it('returns an empty list for no candidates', () => {
    expect(removeDuplicateSearchResults([])).toEqual([]);
  });
});
