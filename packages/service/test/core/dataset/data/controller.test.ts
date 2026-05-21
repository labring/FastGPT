import { describe, expect, it } from 'vitest';
import { formatDatasetDataValue } from '@fastgpt/service/core/dataset/data/controller';

describe('formatDatasetDataValue', () => {
  it('should append image descriptions to markdown image alt text in question and answer', () => {
    const result = formatDatasetDataValue({
      q: 'Question ![cat]( https://example.com/cat.png ) and ![bird](https://example.com/bird.png)',
      a: 'Answer ![](https://example.com/dog.png)',
      imageDescMap: {
        'https://example.com/cat.png': 'cat desc\nline',
        'https://example.com/dog.png': 'dog desc'
      }
    });

    expect(result).toEqual({
      q: 'Question ![cat - cat descline](https://example.com/cat.png) and ![bird](https://example.com/bird.png)',
      a: 'Answer ![dog desc](https://example.com/dog.png)'
    });
  });
});
