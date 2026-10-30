import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowBuilderEntry from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/WorkflowBuilderEntry';

const mocks = vi.hoisted(() => ({
  access: 'enabled',
  track: vi.fn(),
  open: vi.fn(),
  focus: vi.fn()
}));
vi.mock('@/web/common/middle/tracks/utils', () => ({
  webPushTrack: { workflowBuilderClick: mocks.track }
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/hooks/useWorkflowBuilderUI',
  () => ({
    useWorkflowBuilderUI: () => ({
      entryAccess: mocks.access,
      openLeftPanel: mocks.open,
      requestInputFocus: mocks.focus
    })
  })
);
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/presentation/GuidePopover',
  () => ({ default: ({ children }: { children: React.ReactNode }) => children })
);
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/presentation/WorkflowToolbarTooltip',
  () => ({ default: ({ children }: { children: React.ReactNode }) => children })
);
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  IconButton: ({ onClick }: { onClick: () => void }) =>
    React.createElement('button', { onClick }, 'Builder')
}));

describe('WorkflowBuilderEntry click tracking', () => {
  let dom: JSDOM;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access = 'enabled';
    mocks.track.mockResolvedValue(undefined);
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each(['enabled', 'commercial'])(
    'reports each %s entry click without counting rendering',
    async (access) => {
      mocks.access = access;
      await act(async () => root.render(React.createElement(WorkflowBuilderEntry)));
      expect(mocks.track).not.toHaveBeenCalled();
      await act(async () => {
        document.querySelector('button')!.click();
        document.querySelector('button')!.click();
      });
      expect(mocks.track).toHaveBeenCalledTimes(2);
      expect(mocks.open).toHaveBeenCalledTimes(2);
      expect(mocks.focus).toHaveBeenCalledTimes(access === 'enabled' ? 2 : 0);
    }
  );
  it('does not report a hidden entry', async () => {
    mocks.access = 'hidden';
    await act(async () => root.render(React.createElement(WorkflowBuilderEntry)));
    expect(document.querySelector('button')).toBeNull();
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it('keeps opening the panel when reporting fails', async () => {
    mocks.track.mockRejectedValueOnce(new Error('offline'));
    await act(async () => root.render(React.createElement(WorkflowBuilderEntry)));
    await act(async () => document.querySelector('button')!.click());
    expect(mocks.open).toHaveBeenCalledWith('workflowBuilder');
  });
});
