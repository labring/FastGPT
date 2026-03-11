import { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';

/**
 * Sandbox runtime type declarations.
 * Matches the actual globals exposed by FastGPT sandbox worker (worker.ts).
 */
export const SANDBOX_GLOBALS_LIB = `
// ===== SystemHelper =====
interface SystemHelperHttpRequestOptions {
  /** HTTP method, default: 'GET' */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Request body (objects auto JSON-serialized) */
  body?: any;
  /** Timeout in seconds, max 60 */
  timeout?: number;
}
interface SystemHelperHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, any>;
  data: any;
}
interface ISystemHelper {
  /** Send an HTTP request (SSRF protected, max 30 per run). */
  httpRequest(url: string, options?: SystemHelperHttpRequestOptions): Promise<SystemHelperHttpResponse>;
}
declare const SystemHelper: ISystemHelper;

// ===== Node.js / Bun runtime globals =====
interface BufferConstructor {
  alloc(size: number, fill?: string | number, encoding?: string): Buffer;
  from(data: string | ArrayBuffer | number[] | Buffer, encoding?: string): Buffer;
  concat(list: Buffer[], totalLength?: number): Buffer;
  isBuffer(obj: any): obj is Buffer;
  byteLength(string: string, encoding?: string): number;
}
interface Buffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
  toJSON(): { type: 'Buffer'; data: number[] };
  slice(start?: number, end?: number): Buffer;
  length: number;
}
declare const Buffer: BufferConstructor;

declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): any;
declare function setInterval(callback: (...args: any[]) => void, ms?: number, ...args: any[]): any;
declare function clearTimeout(id: any): void;
declare function clearInterval(id: any): void;

// ===== Sandbox console (safe, only log) =====
interface SandboxConsole {
  log(...args: any[]): void;
}
declare const console: SandboxConsole;

// ===== require (allowed modules only) =====
declare function require(module: 'lodash'): typeof import('lodash');
declare function require(module: 'moment'): typeof import('moment');
declare function require(module: 'dayjs'): typeof import('dayjs');
declare function require(module: 'crypto-js'): any;
declare function require(module: 'uuid'): { v4: () => string; v1: () => string };
declare function require(module: 'qs'): any;
declare function require(module: string): any;
`;

let monacoInstance: Monaco | null = null;

const useJSCompletion = () => {
  return useCallback((monaco: Monaco) => {
    if (monacoInstance === monaco) return;
    monacoInstance = monaco;

    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      allowJs: true
    };
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);

    // Inject sandbox type declarations — must follow setCompilerOptions
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      SANDBOX_GLOBALS_LIB,
      'ts:filename/sandbox-globals.d.ts'
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      SANDBOX_GLOBALS_LIB,
      'ts:filename/sandbox-globals.d.ts'
    );

    // Disable semantic validation — sandbox has custom module resolution (safeRequire)
    // that TS cannot model. Keep syntax validation for bracket/paren errors.
    const diagnosticsOptions = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true
    };
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model, position) => {
        const wordInfo = model.getWordUntilPosition(position);
        const currentWordPrefix = wordInfo.word;

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn
        };

        const suggestions = [
          {
            label: 'console',
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: 'console',
            documentation: 'Console output (sandbox safe version, only log).',
            range
          },
          {
            label: 'require',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "require('${1:module}')",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Require allowed modules: lodash, moment, dayjs, crypto-js, uuid, qs.',
            range
          },
          {
            label: 'Buffer',
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: 'Buffer',
            documentation: 'Node.js Buffer for binary data.',
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

export default useJSCompletion;
