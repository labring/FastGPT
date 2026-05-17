import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return collectTsFiles(fullPath);
    }
    return fullPath.endsWith('.ts') ? [fullPath] : [];
  });

describe('agentLoop module boundary', () => {
  it('does not import workflow runtime or workflow dispatch types', () => {
    const files = collectTsFiles('core/ai/llm/agentLoop');
    const forbidden = [
      '@fastgpt/global/core/workflow/runtime',
      '@fastgpt/global/core/workflow/template',
      '../../../../../web',
      '@fastgpt/web',
      'packages/service/core/workflow',
      'workflowStreamResponse',
      'DispatchNodeResponseKeyEnum',
      'SseResponseEventEnum',
      'ModuleDispatchProps'
    ];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(content, `${file} should not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });
});
