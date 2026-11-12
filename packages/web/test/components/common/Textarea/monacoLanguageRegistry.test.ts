import { describe, expect, it, vi } from 'vitest';
import {
  registerJsonEditorContext,
  registerJsonEditorLanguage
} from '../../../../components/common/Textarea/monacoLanguageRegistry';

const createModel = (uri: string, lineContent = '{{') =>
  ({
    uri: { toString: () => uri },
    getLineContent: () => lineContent,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 3 })
  }) as any;

const createMonaco = (failCompletion = false) => {
  let provider: any;
  const tokenDisposable = { dispose: vi.fn() };
  const completionDisposable = { dispose: vi.fn() };
  const monaco = {
    languages: {
      json: { jsonDefaults: { setDiagnosticsOptions: vi.fn() } },
      setMonarchTokensProvider: vi.fn(() => tokenDisposable),
      registerCompletionItemProvider: vi.fn((_language: string, nextProvider: any) => {
        if (failCompletion) throw new Error('completion registration failed');
        provider = nextProvider;
        return completionDisposable;
      }),
      CompletionItemKind: { Variable: 1 }
    },
    editor: {}
  } as any;

  return { monaco, provider: () => provider, tokenDisposable, completionDisposable };
};

const getSuggestions = (provider: any, model: any) =>
  provider.provideCompletionItems(model, {
    lineNumber: 1,
    column: 3
  }).suggestions;

describe('JSON editor model context', () => {
  it('isolates variables by model instead of URI', () => {
    const firstModel = createModel('inmemory://json-editor/shared-uri');
    const secondModel = createModel('inmemory://json-editor/shared-uri');
    const { monaco, provider } = createMonaco();

    registerJsonEditorContext(firstModel, [{ key: 'user.name', label: 'User name' }]);
    registerJsonEditorContext(secondModel, [{ key: 'team.name', label: 'Team name' }]);
    registerJsonEditorLanguage(monaco);

    expect(getSuggestions(provider(), firstModel)).toEqual([
      expect.objectContaining({ label: 'user.name', detail: 'User name' })
    ]);
    expect(getSuggestions(provider(), secondModel)).toEqual([
      expect.objectContaining({ label: 'team.name', detail: 'Team name' })
    ]);
  });

  it('updates variables and keeps one registration per Monaco runtime', () => {
    const model = createModel('inmemory://json-editor/without-path');
    const { monaco, provider } = createMonaco();

    registerJsonEditorContext(model, [{ key: 'user.name', label: 'User name' }]);
    const registration = registerJsonEditorLanguage(monaco);
    registerJsonEditorLanguage(monaco);
    registerJsonEditorContext(model, [{ key: 'user.email', label: 'User email' }]);

    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledTimes(1);
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
    expect(getSuggestions(provider(), model)).toEqual([
      expect.objectContaining({ label: 'user.email', detail: 'User email' })
    ]);

    registration.dispose();
    registration.dispose();
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);

    const nextRegistration = registerJsonEditorLanguage(monaco);
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(2);
    nextRegistration.dispose();
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(2);
  });

  it('registers each Monaco runtime independently', () => {
    const first = createMonaco();
    const second = createMonaco();

    registerJsonEditorLanguage(first.monaco);
    registerJsonEditorLanguage(second.monaco);

    expect(first.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
    expect(second.monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
  });

  it('rolls back token registration when completion registration fails', () => {
    const { monaco, tokenDisposable } = createMonaco(true);

    expect(() => registerJsonEditorLanguage(monaco)).toThrow('completion registration failed');
    expect(tokenDisposable.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns no variables outside a placeholder position', () => {
    const model = createModel('inmemory://json-editor/plain-text', 'abc');
    const { monaco, provider } = createMonaco();

    registerJsonEditorContext(model, [{ key: 'user.name', label: 'User name' }]);
    registerJsonEditorLanguage(monaco);

    expect(getSuggestions(provider(), model)).toEqual([]);
  });
});
