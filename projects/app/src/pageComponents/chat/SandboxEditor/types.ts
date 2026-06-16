import type Editor from '@monaco-editor/react';

export type SandboxEditorInstance = Parameters<
  NonNullable<Parameters<typeof Editor>[0]['onMount']>
>[0];
