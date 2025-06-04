import { expect, test, vi } from 'vitest';
import tool from '..';

test(async () => {
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          webPages: {
            value: [
              {
                name: 'test',
                url: 'https://test.com',
                snippet: 'test'
              }
            ]
          }
        }),
      preconnect: vi.fn()
    })
  ) as unknown as typeof fetch;
  const result = await tool.cb({
    key: 'test',
    query: 'test'
  });
  expect(global.fetch).toHaveBeenCalledWith('https://api.bing.microsoft.com/v7.0/search?q=test', {
    headers: {
      'Ocp-Apim-Subscription-Key': 'test'
    }
  });
  expect(result).toEqual({
    output: {
      result: JSON.stringify([
        {
          title: 'test',
          link: 'https://test.com',
          snippet: 'test'
        }
      ])
    }
  });
});
