import { type Monaco } from '@monaco-editor/react';

type CompletionItemProvider = Parameters<Monaco['languages']['registerCompletionItemProvider']>[1];
type ProvideCompletionItemsFn = CompletionItemProvider['provideCompletionItems'];

export type CompletionModel = Parameters<ProvideCompletionItemsFn>[0];
export type CompletionPosition = Parameters<ProvideCompletionItemsFn>[1];
