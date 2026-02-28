import { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';

let monacoInstance: Monaco | null = null;

const useSystemHelperCompletion = () => {
  return useCallback((monaco: Monaco) => {
    if (monacoInstance === monaco) return;
    monacoInstance = monaco;

    const buildSuggestions = (
      monaco: Monaco,
      model: Parameters<
        Parameters<
          typeof monaco.languages.registerCompletionItemProvider
        >[1]['provideCompletionItems']
      >[0],
      position: Parameters<
        Parameters<
          typeof monaco.languages.registerCompletionItemProvider
        >[1]['provideCompletionItems']
      >[1],
      memberSnippet: string
    ) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.slice(0, position.column - 1);

      // After "SystemHelper." — suggest members
      if (textBeforeCursor.endsWith('SystemHelper.')) {
        return {
          suggestions: [
            {
              label: 'httpRequest',
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: memberSnippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Send an HTTP request. Returns { status, data }.',
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column,
                endColumn: position.column
              }
            }
          ]
        };
      }

      // Suggest "SystemHelper" as a global identifier
      const wordInfo = model.getWordUntilPosition(position);
      if (wordInfo.word.length > 0 && 'SystemHelper'.startsWith(wordInfo.word)) {
        return {
          suggestions: [
            {
              label: 'SystemHelper',
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: 'SystemHelper',
              documentation: 'Built-in helper utilities provided by FastGPT sandbox.',
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: wordInfo.startColumn,
                endColumn: wordInfo.endColumn
              }
            }
          ]
        };
      }

      return { suggestions: [] };
    };

    // JS/TS completion provider
    const jsSnippet =
      "httpRequest(${1:url}, {\n\tmethod: '${2:GET}',\n\theaders: {},\n\tbody: null,\n\ttimeout: 60\n})";
    for (const lang of ['javascript', 'typescript'] as const) {
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.'],
        provideCompletionItems: (model, position) =>
          buildSuggestions(monaco, model, position, jsSnippet)
      });
    }

    // Python completion provider
    const pySnippet = 'httpRequest(${1:url}, method="${2:GET}", headers={}, timeout=${3:60})';
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model, position) =>
        buildSuggestions(monaco, model, position, pySnippet)
    });
  }, []);
};

export default useSystemHelperCompletion;
