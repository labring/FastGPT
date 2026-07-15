import { describe, expect, it } from 'vitest';
import {
  createToolParamsStreamBuffer,
  getToolParamsPreview
} from '@/components/core/chat/ChatContainer/ChatBox/utils/toolParamsStreamBuffer';

describe('getToolParamsPreview', () => {
  it('should keep short params unchanged and return a bounded tail for long params', () => {
    expect(getToolParamsPreview('1234', 4)).toBe('1234');
    expect(getToolParamsPreview('12345', 4)).toBe('2345');
  });

  it('should normalize invalid preview lengths', () => {
    expect(getToolParamsPreview('12345', -1)).toBe('');
    expect(getToolParamsPreview('12345', 2.9)).toBe('45');
  });
});

describe('createToolParamsStreamBuffer', () => {
  it('should accumulate full params while publishing only dirty bounded previews', () => {
    const buffer = createToolParamsStreamBuffer({ previewMaxLength: 5 });

    expect(
      buffer.append({ responseValueId: 'value-1', tool: { id: 'tool-1', params: 'hello' } })
    ).toBe(true);
    expect(
      buffer.append({ responseValueId: 'value-1', tool: { id: 'tool-1', params: ' world' } })
    ).toBe(true);

    expect(buffer.takePreviewUpdates()).toEqual([
      {
        responseValueId: 'value-1',
        tool: { id: 'tool-1', params: 'world' }
      }
    ]);
    expect(buffer.takePreviewUpdates()).toEqual([]);

    expect(buffer.append({ responseValueId: 'value-1', tool: { id: 'tool-1', params: '!' } })).toBe(
      true
    );
    expect(buffer.takePreviewUpdates()[0]?.tool.params).toBe('orld!');
    expect(buffer.flush()).toEqual([
      {
        responseValueId: 'value-1',
        tool: { id: 'tool-1', params: 'hello world!' }
      }
    ]);
    expect(buffer.flush()).toEqual([]);
  });

  it('should isolate tools with ambiguous ids and ignore empty chunks', () => {
    const buffer = createToolParamsStreamBuffer();

    expect(buffer.append({ responseValueId: 'a:b', tool: { id: 'c', params: 'first' } })).toBe(
      true
    );
    expect(buffer.append({ responseValueId: 'a', tool: { id: 'b:c', params: 'second' } })).toBe(
      true
    );
    expect(buffer.append({ responseValueId: 'a', tool: { id: 'b:c', params: '' } })).toBe(false);

    expect(buffer.flush()).toEqual([
      { responseValueId: 'a:b', tool: { id: 'c', params: 'first' } },
      { responseValueId: 'a', tool: { id: 'b:c', params: 'second' } }
    ]);
  });

  it('should discard buffered params when cleared', () => {
    const buffer = createToolParamsStreamBuffer();
    buffer.append({ tool: { id: 'tool-1', params: 'content' } });

    buffer.clear();

    expect(buffer.takePreviewUpdates()).toEqual([]);
    expect(buffer.flush()).toEqual([]);
  });

  it('should keep a bounded preview while preserving a large argument exactly once', () => {
    const buffer = createToolParamsStreamBuffer({ previewMaxLength: 32 });
    const chunks = Array.from(
      { length: 2048 },
      (_, index) => `<p data-index="${index}">${'x'.repeat(512)}</p>`
    );
    const fullParams = chunks.join('');
    expect(fullParams.length).toBeGreaterThan(1024 * 1024);

    chunks.forEach((params) => buffer.append({ tool: { id: 'large-tool', params } }));

    const preview = buffer.takePreviewUpdates()[0]?.tool.params || '';
    expect(preview.length).toBeLessThanOrEqual(32);
    expect(preview).toBe(fullParams.slice(-32));
    expect(buffer.flush()[0]?.tool.params).toBe(fullParams);
  });
});
