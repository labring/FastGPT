import { describe, expect, it, vi } from 'vitest';
import {
  registerJsonEditorContext,
  registerJsonEditorLanguage
} from '../../../../components/common/Textarea/monacoLanguageRegistry';

const createModel = (uri: string) =>
  ({
    uri: { toString: () => uri },
    onWillDispose: vi.fn(),
    getLineContent: () => '{{',
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 3 })
  }) as any;

describe('JSON editor model context', () => {
  it('provides variables for a model without a path', () => {
    const model = createModel('inmemory://json-editor/without-path');
    let provider: any;
    const monaco = {
      languages: {
        json: { jsonDefaults: { setDiagnosticsOptions: vi.fn() } },
        setMonarchTokensProvider: vi.fn(),
        registerCompletionItemProvider: vi.fn((_language: string, nextProvider: any) => {
          provider = nextProvider;
        }),
        CompletionItemKind: { Variable: 1 }
      },
      editor: {}
    } as any;

    registerJsonEditorContext(model, [{ key: 'user.name', label: 'User name' }]);
    registerJsonEditorLanguage(monaco);

    const result = provider.provideCompletionItems(model, {
      lineNumber: 1,
      column: 3
    });

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        label: 'user.name',
        detail: 'User name',
        insertText: 'user.name}}'
      })
    ]);
  });
});
