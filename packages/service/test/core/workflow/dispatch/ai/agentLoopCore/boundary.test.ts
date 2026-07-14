import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');
const collectTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    return statSync(fullPath).isDirectory()
      ? collectTsFiles(fullPath)
      : fullPath.endsWith('.ts')
        ? [fullPath]
        : [];
  });

describe('workflow agent-loop core boundary', () => {
  it('keeps Workflow Agent and ToolCall on the shared core entry', () => {
    const entryFiles = [
      'core/workflow/dispatch/ai/agent/index.ts',
      'core/workflow/dispatch/ai/toolcall/toolCall.ts'
    ];

    for (const file of entryFiles) {
      const source = readSource(file);
      expect(source, `${file} must call the shared core`).toContain('runAgentLoopCoreWithSummary');
      expect(source, `${file} must not call the low-level loop directly`).not.toMatch(
        /\brunAgentLoop\s*\(/
      );
      expect(source, `${file} must not import provider internals`).not.toContain(
        '/agentLoop/provider/'
      );
      expect(source, `${file} must use the shared core interface`).toContain(
        'agentLoopCore/interface'
      );
    }
  });

  it('keeps provider implementations out of the public agent-loop interface', () => {
    const source = readSource('core/ai/llm/agentLoop/interface/index.ts');

    expect(source).not.toContain('infrastructure');
    expect(source).not.toContain('runFastAgentLoop');
    expect(source).not.toContain('runPiAgentLoop');
  });

  it('removes legacy root entries instead of forwarding them', () => {
    expect(() => readSource('core/ai/llm/agentLoop/index.ts')).toThrow();
    expect(() => readSource('core/workflow/dispatch/ai/agentLoopCore/index.ts')).toThrow();
    expect(() => readSource('core/workflow/dispatch/ai/agentLoopCore/interface/run.ts')).toThrow();
  });

  it('keeps internal collectors and helpers out of the public core interface', () => {
    const source = readSource('core/workflow/dispatch/ai/agentLoopCore/interface/index.ts');
    const internalExports = [
      'createAgentLoopCoreAssistantEventCollector',
      'createAgentLoopCoreEventDispatcher',
      'createAgentLoopCoreNodeResponseEventCollector',
      'createAgentLoopCoreToolRunResponseCollector',
      'normalizeAgentLoopCoreToolRunResult',
      'parseAgentLoopCoreReadFileCall',
      'sumAgentLoopCoreUsagePoints'
    ];

    for (const exportName of internalExports) {
      expect(source, `${exportName} must stay internal`).not.toContain(exportName);
    }
  });

  it('keeps domain independent and outer nodes on the public interface', () => {
    for (const file of collectTsFiles('core/workflow/dispatch/ai/agentLoopCore/domain')) {
      const source = readSource(file);
      expect(source, `${file} must not depend on adapters`).not.toContain('../adapter');
      expect(source, `${file} must not depend on application services`).not.toContain(
        '../application'
      );
      expect(source, `${file} must not depend on its public interface`).not.toContain(
        '../interface'
      );
    }

    const outerFiles = [
      ...collectTsFiles('core/workflow/dispatch/ai/agent'),
      ...collectTsFiles('core/workflow/dispatch/ai/toolcall')
    ];
    for (const file of outerFiles) {
      const source = readSource(file);
      const coreImports = source.match(/from ['"][^'"]*agentLoopCore[^'"]*['"]/g) ?? [];
      for (const coreImport of coreImports) {
        expect(coreImport, `${file} must import agentLoopCore through interface`).toContain(
          'agentLoopCore/interface'
        );
      }
    }
  });
});
