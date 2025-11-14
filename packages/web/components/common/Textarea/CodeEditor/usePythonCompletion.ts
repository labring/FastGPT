import { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';
let monacoInstance: Monaco | null = null;
const usePythonCompletion = () => {
  return useCallback((monaco: Monaco) => {
    if (monacoInstance === monaco) return;
    monacoInstance = monaco;

    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model, position) => {
        const wordInfo = model.getWordUntilPosition(position);
        const currentWordPrefix = wordInfo.word;

        const lineContent = model.getLineContent(position.lineNumber);

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn
        };

        const baseSuggestions = [
          {
            label: 'len',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'len()',
            documentation: 'get length of object',
            range,
            sortText: 'a'
          }
        ];

        const filtered = baseSuggestions.filter((item) =>
          item.label.toLowerCase().startsWith(currentWordPrefix.toLowerCase())
        );

        if (lineContent.startsWith('import')) {
          const importLength = 'import'.length;
          const afterImport = lineContent.slice(importLength);
          const spaceMatch = afterImport.match(/^\s*/);
          const spaceLength = spaceMatch ? spaceMatch[0].length : 0;

          const startReplaceCol = importLength + spaceLength + 1;
          const currentCol = position.column;

          const replaceRange = new monaco.Range(
            position.lineNumber,
            startReplaceCol,
            position.lineNumber,
            currentCol
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

        return { suggestions: filtered };
      },
      triggerCharacters: ['.', '_']
    });
  }, []);
};

export default usePythonCompletion;
