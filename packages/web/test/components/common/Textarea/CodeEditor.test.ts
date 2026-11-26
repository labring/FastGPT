// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const model = {
    uri: { toString: () => 'inmemory://workflow/test' },
    getValue: vi.fn(() => 'stale model'),
    setValue: vi.fn(),
    onWillDispose: vi.fn(),
    isDisposed: vi.fn(() => false),
    dispose: vi.fn()
  };
  const monaco = {
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    editor: {
      getModel: vi.fn(() => model),
      setModelLanguage: vi.fn()
    }
  };
  const editor = { getModel: vi.fn(() => model), getDomNode: vi.fn(() => null) };

  return {
    model,
    monaco,
    editor,
    delayMount: false,
    finishMount: undefined as (() => void) | undefined,
    lifecycleProps: vi.fn(),
    unmountPath: vi.fn()
  };
});

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  const MockEditor = ({
    path,
    keepCurrentModel,
    saveViewState,
    onMount
  }: {
    path?: string;
    keepCurrentModel?: boolean;
    saveViewState?: boolean;
    onMount?: (editor: unknown, monaco: unknown) => void;
  }) => {
    mocks.lifecycleProps({ path, keepCurrentModel, saveViewState });
    const initialPath = React.useRef(path);
    const initialOnMount = React.useRef(onMount);
    React.useEffect(() => {
      const mountedPath = initialPath.current;
      return () => mocks.unmountPath(mountedPath);
    }, []);
    React.useEffect(() => {
      // Monaco React 仅在首次 ready 时调用首次渲染捕获的 onMount。
      const completeMount = () => initialOnMount.current?.(mocks.editor, mocks.monaco);
      if (mocks.delayMount) mocks.finishMount = completeMount;
      else completeMount();
    }, []);
    return React.createElement('div');
  };

  return {
    default: MockEditor,
    loader: { config: vi.fn() },
    useMonaco: () => mocks.monaco
  };
});

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import CodeEditor from '../../../../components/common/Textarea/CodeEditor';
import JSONEditor from '../../../../components/common/Textarea/JsonEditor';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.delayMount = false;
  mocks.finishMount = undefined;
  mocks.model.getValue.mockReturnValue('stale model');
});

describe('Monaco model hydration', () => {
  it.each(['code', 'json'] as const)(
    'updates the %s model with the latest props after a delayed mount',
    async (kind) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      const render = (value: string, language: string) =>
        act(async () => {
          const path = 'inmemory://fastgpt/workflow/app/session/node/field';
          root.render(
            React.createElement(
              ChakraProvider,
              null,
              kind === 'json'
                ? React.createElement(JSONEditor, { path, value })
                : React.createElement(CodeEditor, { path, value, language })
            )
          );
        });

      try {
        mocks.delayMount = true;
        await render('{"before":1}', 'js');
        await render('{"after":2}', 'py');
        expect(mocks.model.setValue).not.toHaveBeenCalled();
        expect(mocks.finishMount).toBeDefined();
        await act(async () => mocks.finishMount?.());
        expect(mocks.model.setValue).toHaveBeenCalledExactlyOnceWith('{"after":2}');
        expect(mocks.monaco.editor.setModelLanguage).toHaveBeenCalledWith(
          mocks.model,
          kind === 'json' ? 'json' : 'python'
        );
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it('updates a reused code model from the current value on mount', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(CodeEditor, {
            path: 'workflow/node/code',
            value: 'latest code',
            language: 'javascript'
          })
        )
      );
    });

    expect(mocks.model.setValue).toHaveBeenCalledWith('latest code');
    expect(mocks.monaco.editor.setModelLanguage).toHaveBeenCalledWith(mocks.model, 'javascript');
    root.unmount();
  });

  it('updates a reused JSON model from the current formatted value on mount', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(JSONEditor, {
            path: 'workflow/node/json',
            value: '{\n  "latest": true\n}'
          })
        )
      );
    });

    expect(mocks.model.setValue).toHaveBeenCalledWith(`{
  "latest": true
}`);
    expect(mocks.monaco.editor.setModelLanguage).toHaveBeenCalledWith(mocks.model, 'json');
    root.unmount();
  });
});

describe('Monaco model view state', () => {
  it.each([
    { name: 'code', Component: CodeEditor },
    { name: 'JSON', Component: JSONEditor }
  ])('keeps $name workflow models without storing view state', async ({ name, Component }) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (path: string) =>
      act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement<{ path: string; value: string }>(Component, { path, value: '{}' })
          )
        );
      });
    const workflowPath = `inmemory://fastgpt/workflow/app/session/${name}/node/field`;
    const stablePath = `file:///editors/${name}/field`;

    try {
      await render(workflowPath);
      expect(mocks.lifecycleProps).toHaveBeenLastCalledWith({
        path: workflowPath,
        keepCurrentModel: true,
        saveViewState: false
      });

      await render(stablePath);
      expect(mocks.unmountPath).toHaveBeenCalledWith(workflowPath);
      expect(mocks.lifecycleProps).toHaveBeenLastCalledWith({
        path: stablePath,
        keepCurrentModel: true,
        saveViewState: true
      });

      await render(`${stablePath}-other`);
      expect(mocks.unmountPath).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
