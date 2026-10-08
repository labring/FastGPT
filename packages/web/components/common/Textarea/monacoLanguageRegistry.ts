import type { Monaco } from '@monaco-editor/react';

export type EditorVariablePickerType = {
  key: string;
  label: string;
};

type MonacoModel = ReturnType<Monaco['editor']['getModels']>[number];

type JsonEditorContext = {
  model: MonacoModel;
  variables: EditorVariablePickerType[];
};

const jsonEditorContexts = new Map<string, JsonEditorContext>();
const registeredJsonLanguageMonacoInstances = new WeakSet<Monaco>();
const registeredJsonModels = new WeakSet<MonacoModel>();

/** 注册 JSON model 的变量上下文，并在 model 销毁时移除旧引用。 */
export const registerJsonEditorContext = (
  model: MonacoModel,
  variables: EditorVariablePickerType[]
) => {
  const uri = model.uri.toString();
  jsonEditorContexts.set(uri, { model, variables });

  if (registeredJsonModels.has(model)) return;
  registeredJsonModels.add(model);
  model.onWillDispose(() => {
    if (jsonEditorContexts.get(uri)?.model === model) {
      jsonEditorContexts.delete(uri);
    }
  });
};

/** 为每个 Monaco runtime 注册一次 JSON 语言能力，避免配置变更重启 worker。 */
export const registerJsonEditorLanguage = (monaco: Monaco) => {
  if (registeredJsonLanguageMonacoInstances.has(monaco)) return;
  registeredJsonLanguageMonacoInstances.add(monaco);

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: false,
    allowComments: false,
    schemas: [
      {
        uri: 'http://myserver/foo-schema.json',
        fileMatch: ['*'],
        schema: {}
      }
    ]
  });

  try {
    monaco.languages.setMonarchTokensProvider('json', {
      tokenizer: {
        root: [
          [/\{\{[^{}]+\}\}/, 'variable'],
          [/".*?"/, 'string'],
          [/[{}\[\]]/, '@brackets'],
          [/[0-9]+/, 'number'],
          [/true|false/, 'keyword'],
          [/:/, 'delimiter'],
          [/,/, 'delimiter.comma']
        ]
      }
    });
  } catch (error) {
    console.warn('Failed to register Monaco Monarch token provider:', error);
  }

  monaco.languages.registerCompletionItemProvider('json', {
    triggerCharacters: ['{'],
    provideCompletionItems(model, position) {
      const variables = jsonEditorContexts.get(model.uri.toString())?.variables ?? [];
      const lineContent = model.getLineContent(position.lineNumber);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const startText = lineContent.substring(0, position.column - 1);
      const endText = lineContent.substring(position.column - 1);
      const before2Char = startText[startText.length - 2];
      const beforeChar = startText[startText.length - 1];
      const afterChar = endText[0];
      const after2Char = endText[1];

      if (before2Char !== '{' && beforeChar !== '"') {
        return { suggestions: [] };
      }

      return {
        suggestions: variables.map((item) => {
          let insertText = item.key;
          if (before2Char !== '{') {
            insertText = `{${insertText}`;
          }
          if (afterChar !== '}') {
            insertText = `${insertText}}`;
          }
          if (after2Char !== '}') {
            insertText = `${insertText}}`;
          }

          return {
            label: item.key,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: item.label,
            insertText,
            range
          };
        })
      };
    }
  });
};
