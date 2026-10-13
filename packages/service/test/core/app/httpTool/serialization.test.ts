import { describe, expect, it } from 'vitest';
import { serializeOpenAPIParameter } from '@fastgpt/service/core/app/httpTool/serialization';

describe('serializeOpenAPIParameter', () => {
  it.each([
    { value: ['a', 'b'], expected: 'color=a&color=b' },
    { value: ['a', 'b'], explode: false, expected: 'color=a%2Cb' },
    { value: { R: 100, G: 200 }, expected: 'R=100&G=200' },
    { value: { R: 100, G: 200 }, explode: false, expected: 'color=R%2C100%2CG%2C200' },
    { value: ['a', 'b'], style: 'spaceDelimited', expected: 'color=a+b' },
    { value: ['a', 'b'], style: 'pipeDelimited', expected: 'color=a%7Cb' },
    {
      value: { R: 100, G: 200 },
      style: 'deepObject',
      explode: true,
      expected: 'color%5BR%5D=100&color%5BG%5D=200'
    },
    { value: '', expected: 'color=' },
    { value: 0, expected: 'color=0' },
    { value: false, expected: 'color=false' },
    { value: null, expected: 'color=null' },
    { value: [], expected: '' },
    { value: [], explode: false, expected: 'color=' },
    { value: {}, expected: '' },
    { value: {}, explode: false, expected: 'color=' },
    { value: ['a/b', '中文 &+#%'], expected: 'color=a%2Fb&color=%E4%B8%AD%E6%96%87+%26%2B%23%25' }
  ])('serializes query %j', ({ value, style, explode, expected }) => {
    const entries = serializeOpenAPIParameter({
      location: 'query',
      name: 'color',
      value,
      style,
      explode
    });
    expect(new URLSearchParams(entries).toString()).toBe(expected);
  });

  it.each([
    { value: 'blue', expected: 'blue' },
    { value: ['blue', 'black'], expected: 'blue,black' },
    { value: ['blue', 'black'], explode: true, expected: 'blue,black' },
    { value: { R: 100, G: 200 }, expected: 'R,100,G,200' },
    { value: { R: 100, G: 200 }, explode: true, expected: 'R=100,G=200' },
    { style: 'label', value: 'blue', expected: '.blue' },
    { style: 'label', value: ['blue', 'black'], expected: '.blue,black' },
    { style: 'label', value: ['blue', 'black'], explode: true, expected: '.blue.black' },
    { style: 'label', value: { R: 100, G: 200 }, expected: '.R,100,G,200' },
    { style: 'label', value: { R: 100, G: 200 }, explode: true, expected: '.R=100.G=200' },
    { style: 'matrix', value: 'blue', expected: ';color=blue' },
    { style: 'matrix', value: ['blue', 'black'], expected: ';color=blue,black' },
    {
      style: 'matrix',
      value: ['blue', 'black'],
      explode: true,
      expected: ';color=blue;color=black'
    },
    { style: 'matrix', value: { R: 100, G: 200 }, expected: ';color=R,100,G,200' },
    { style: 'matrix', value: { R: 100, G: 200 }, explode: true, expected: ';R=100;G=200' },
    { value: ['a/b', 'x,y'], expected: 'a%2Fb,x%2Cy' },
    { value: "中文?#%!'()*", expected: '%E4%B8%AD%E6%96%87%3F%23%25%21%27%28%29%2A' },
    { value: [''], style: 'matrix', expected: ';color=' }
  ])('serializes path %j', ({ value, style, explode, expected }) => {
    expect(
      serializeOpenAPIParameter({ location: 'path', name: 'color', value, style, explode })
    ).toEqual([['color', expected]]);
  });

  it.each([
    { value: 'a/b', expected: 'a/b' },
    { value: [0, false], expected: '0,false' },
    { value: { R: 100, G: 200 }, expected: 'R,100,G,200' },
    { value: { R: 100, G: 200 }, explode: true, expected: 'R=100,G=200' }
  ])('serializes header %j', ({ value, explode, expected }) => {
    expect(
      serializeOpenAPIParameter({ location: 'header', name: 'X-Color', value, explode })
    ).toEqual([['X-Color', expected]]);
  });

  it.each([
    { location: 'query', style: 'simple', value: 'x' },
    { location: 'header', style: 'form', value: 'x' },
    { location: 'cookie', value: 'x' },
    { location: 'query', style: 'deepObject', value: { a: 1 } },
    { location: 'query', style: 'deepObject', explode: true, value: ['a'] },
    { location: 'query', style: 'pipeDelimited', value: 'x' },
    { location: 'query', style: 'spaceDelimited', explode: true, value: ['a'] },
    { location: 'query', value: { nested: { a: 1 } } },
    { location: 'query', value: [['a']] },
    { location: 'query', value: undefined },
    { location: 'query', value: Infinity },
    { location: 'path', value: '.' },
    { location: 'path', value: '..' },
    { location: 'path', style: 'label', value: '' },
    { location: 'path', style: 'label', value: '.' }
  ])('rejects undefined encodings and unsafe path segments: %j', (input) => {
    expect(() => serializeOpenAPIParameter({ name: 'color', ...input })).toThrow();
  });
});
