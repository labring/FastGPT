import type { Monaco } from '@monaco-editor/react';

export type EditorVariablePickerType = {
  key: string;
  label: string;
};

type MonacoModel = ReturnType<Monaco['editor']['getModels']>[number];

type MonacoDisposable = {
  dispose: () => void;
};

type JsonLanguageRegistration = {
  dispose: () => void;
};

const jsonEditorContexts = new WeakMap<MonacoModel, EditorVariablePickerType[]>();
const jsonLanguageRegistrations = new WeakMap<Monaco, JsonLanguageRegistration>();

/** 注册 JSON model 的变量上下文；WeakMap 会随 model 生命周期自动释放引用。 */
export const registerJsonEditorContext = (
  model: MonacoModel,
  variables: EditorVariablePickerType[]
) => {
  jsonEditorContexts.set(model, variables);
};

/** 为每个 Monaco runtime 注册一次 JSON 语言能力，避免配置变更重启 worker。 */
export const registerJsonEditorLanguage = (monaco: Monaco): JsonLanguageRegistration => {
  const existingRegistration = jsonLanguageRegistrations.get(monaco);
  if (existingRegistration) return existingRegistration;

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

  let tokensProvider: MonacoDisposable | undefined;
  try {
    tokensProvider = monaco.languages.setMonarchTokensProvider('json', {
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

  let completionProvider: MonacoDisposable;
  try {
    completionProvider = monaco.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['{'],
      provideCompletionItems(model, position) {
        const variables = jsonEditorContexts.get(model) ?? [];
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
  } catch (error) {
    tokensProvider?.dispose();
    throw error;
  }

  let disposed = false;
  const registration: JsonLanguageRegistration = {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      completionProvider.dispose();
      tokensProvider?.dispose();
      jsonLanguageRegistrations.delete(monaco);
    }
  };
  jsonLanguageRegistrations.set(monaco, registration);
  return registration;
};
