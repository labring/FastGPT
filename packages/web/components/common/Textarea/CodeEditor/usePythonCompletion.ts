import { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';

let monacoInstance: Monaco | null = null;

const usePythonCompletion = () => {
  return useCallback((monaco: Monaco) => {
    if (monacoInstance === monaco) return;
    monacoInstance = monaco;

    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['_'],
      provideCompletionItems: (model, position) => {
        const wordInfo = model.getWordUntilPosition(position);
        const currentWordPrefix = wordInfo.word;
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.slice(0, position.column - 1);

        // Skip built-ins when in member access context (e.g. "foo.")
        if (textBeforeCursor.endsWith('.')) return { suggestions: [] };

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn
        };

        // import line — suggest common packages
        if (lineContent.startsWith('import')) {
          const importLength = 'import'.length;
          const afterImport = lineContent.slice(importLength);
          const spaceMatch = afterImport.match(/^\s*/);
          const spaceLength = spaceMatch ? spaceMatch[0].length : 0;
          const startReplaceCol = importLength + spaceLength + 1;
          const replaceRange = new monaco.Range(
            position.lineNumber,
            startReplaceCol,
            position.lineNumber,
            position.column
          );
          const needsSpace = spaceLength === 0;
          return {
            suggestions: [
              {
                label: 'numpy',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: `${needsSpace ? ' ' : ''}numpy as np`,
                documentation: 'numerical computing library',
                range: replaceRange,
                sortText: 'a'
              },
              {
                label: 'pandas',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: `${needsSpace ? ' ' : ''}pandas as pd`,
                documentation: 'data analysis library',
                range: replaceRange
              }
            ]
          };
        }

        // General Python built-ins
        const suggestions = [
          {
            label: 'len',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'len()',
            documentation: 'Return the length of an object.',
            range,
            sortText: 'a'
          },
          {
            label: 'print',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'print(${1:value})',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Print values to stdout.',
            range
          },
          {
            label: 'range',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'range(${1:stop})',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Return a range object.',
            range
          }
        ];

        return {
          suggestions: suggestions.filter((item) =>
            item.label.toLowerCase().startsWith(currentWordPrefix.toLowerCase())
          )
        };
      }
    });
  }, []);
};

export default usePythonCompletion;
