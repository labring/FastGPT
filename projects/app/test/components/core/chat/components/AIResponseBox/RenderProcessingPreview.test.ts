import { describe, expect, it } from 'vitest';
import { getProcessingPreviewLabel } from '@/components/core/chat/components/AIResponseBox/RenderProcessingPreview';

describe('getProcessingPreviewLabel', () => {
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
