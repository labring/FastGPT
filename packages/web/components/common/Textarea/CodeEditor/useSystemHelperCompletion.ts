import { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';

const JS_SYSTEM_HELPER_LIB = `
interface SystemHelperHttpRequestOptions {
  /** HTTP method, default: 'GET' */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Request body, objects will be auto JSON-serialized */
  body?: any;
  /** Timeout in seconds, max 60 */
  timeout?: number;
}
interface SystemHelperHttpResponse {
  status: number;
  data: any;
}
interface ISystemHelper {
  /**
   * Send an HTTP request from the sandbox.
   * @param url - Target URL
   * @param options - Request options
   */
  httpRequest(url: string, options?: SystemHelperHttpRequestOptions): Promise<SystemHelperHttpResponse>;
}
declare const SystemHelper: ISystemHelper;
`;

let monacoInstance: Monaco | null = null;

const useSystemHelperCompletion = () => {
  return useCallback((monaco: Monaco) => {
    if (monacoInstance === monaco) return;
    monacoInstance = monaco;

    // Restrict lib to ES2022 only — removes DOM typings (TextDecoderStream, etc.)
    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      lib: ['ES2022']
    };
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);

    // Disable "no suggestion" diagnostics noise from the TS worker
    const diagnosticsOptions = {
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true
    };
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    // JS/TS: inject type declarations for IntelliSense
    // URI must use "ts:" scheme so Monaco treats it as a declaration file
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      JS_SYSTEM_HELPER_LIB,
      'ts:filename/system-helper.d.ts'
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      JS_SYSTEM_HELPER_LIB,
      'ts:filename/system-helper.d.ts'
    );

    // Python: register completion items for SystemHelper
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.slice(0, position.column - 1);

        // Suggest methods after "SystemHelper."
        if (textBeforeCursor.endsWith('SystemHelper.')) {
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column
          };
          return {
            suggestions: [
              {
                label: 'httpRequest',
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'httpRequest(${1:url}, method="${2:GET}", headers={}, timeout=${3:60})',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Send an HTTP request. Returns dict with "status" and "data".',
                range
              }
            ]
          };
        }

        // Suggest "SystemHelper" as a global identifier
        const wordInfo = model.getWordUntilPosition(position);
        if ('SystemHelper'.startsWith(wordInfo.word) && wordInfo.word.length > 0) {
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: wordInfo.startColumn,
            endColumn: wordInfo.endColumn
          };
          return {
            suggestions: [
              {
                label: 'SystemHelper',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: 'SystemHelper',
                documentation: 'Built-in helper utilities provided by FastGPT sandbox.',
                range
              }
            ]
          };
        }

        return { suggestions: [] };
      }
    });
  }, []);
};

export default useSystemHelperCompletion;
