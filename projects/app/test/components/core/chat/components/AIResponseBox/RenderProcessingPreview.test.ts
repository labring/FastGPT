import { describe, expect, it } from 'vitest';
import {
  getProcessingPreviewLabel,
  getProcessingPreviewTarget
} from '@/components/core/chat/components/AIResponseBox/RenderProcessingPreview';

describe('getProcessingPreviewLabel', () => {
  it('keeps the internal tool name without exposing an expandable detail target', () => {
    const value = {
      tools: [
        {
          id: 'skill-reference',
          toolName: 'Read file',
          toolAvatar: '',
          functionName: 'sandbox_read_file',
          hideDetails: true,
          params: '{"path":"internal-reference"}'
        }
      ]
    };
    expect(getProcessingPreviewLabel(value, (key) => key)).toBe('Read file');
    expect(getProcessingPreviewTarget(value)).toBeUndefined();
  });

  it('translates Builder tool names and reasoning labels through the supplied t', () => {
    const translations: Record<string, string> = {
      'workflow:workflow_builder_tool_preview': '方案预览',
      'chat:history_generating': '思考中'
    };
    const t = (key: string) => translations[key] ?? key;

    expect(
      getProcessingPreviewLabel(
        {
          id: 'v1',
          tool: {
            id: 't1',
            toolName: 'Plan preview',
            toolAvatar: '',
            functionName: 'workflow_builder_present_preview',
            params: '{}',
            response: ''
          }
        },
        t
      )
    ).toBe('方案预览');

    expect(
      getProcessingPreviewLabel(
        {
          id: 'v2',
          reasoning: {
            content: 'thinking...'
          }
        },
        t
      )
    ).toBe('思考中');
  });
});
