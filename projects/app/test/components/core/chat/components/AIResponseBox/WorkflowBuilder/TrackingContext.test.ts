import React, { act, useContext, type ContextType } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkflowBuilderTrackingContext,
  WorkflowBuilderTrackingProvider
} from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/TrackingContext';
import RenderWorkflowBuilderPreview from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/web/common/middle/tracks/utils', () => ({
  webPushTrack: { workflowBuilder: mocks.track }
}));
vi.mock('@chakra-ui/react', async () => {
  const { forwardRef, createElement } = await import('react');
  const Container = forwardRef<HTMLDivElement, React.PropsWithChildren>(({ children }, ref) =>
    createElement('div', { ref }, children)
  );
  return { Box: Container, Flex: Container };
});
vi.mock('@/components/Markdown', () => ({ default: () => null }));

const preview: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',
  previewId: 'new-preview',
  params: { title: 'Preview', mermaid: 'flowchart LR', sections: [], actions: [] }
};

describe('Workflow Builder preview tracking', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;
  let tracking: ContextType<typeof WorkflowBuilderTrackingContext>;
  let visibility: DocumentVisibilityState;
  let intersect: (entries: Array<{ isIntersecting: boolean }>) => void;
  const disconnect = vi.fn();
  const Harness = ({ show }: { show: boolean }) => {
    tracking = useContext(WorkflowBuilderTrackingContext);
    return show
      ? React.createElement(RenderWorkflowBuilderPreview, { interactive: preview })
      : null;
  };
  const render = async (appId: string, show = true) =>
    act(async () =>
      root.render(
        React.createElement(
          WorkflowBuilderTrackingProvider,
          { appId, key: appId },
          React.createElement(Harness, { show })
        )
      )
    );

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => visibility });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof intersect) {
          intersect = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('ignores visible history, waits for a new visible preview and deduplicates remounts', async () => {
    await render('app-1');
    intersect([{ isIntersecting: true }]);
    expect(mocks.track).not.toHaveBeenCalled();
    tracking!.registerPreview(preview.previewId);
    visibility = 'hidden';
    intersect([{ isIntersecting: true }]);
    expect(mocks.track).not.toHaveBeenCalled();
    visibility = 'visible';
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
      appId: 'app-1',
      action: 'preview_shown'
    });
    tracking!.registerPreview(preview.previewId);
    await render('app-1', false);
    await render('app-1');
    intersect([{ isIntersecting: true }]);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
  });

  it('requires intersection and resets eligibility when changing applications', async () => {
    await render('app-1');
    tracking!.registerPreview(preview.previewId);
    intersect([{ isIntersecting: false }]);
    expect(mocks.track).not.toHaveBeenCalled();
    intersect([{ isIntersecting: true }]);
    await render('app-2');
    intersect([{ isIntersecting: true }]);
    expect(mocks.track).toHaveBeenCalledOnce();
    tracking!.registerPreview(preview.previewId);
    intersect([{ isIntersecting: true }]);
    expect(mocks.track).toHaveBeenLastCalledWith({ appId: 'app-2', action: 'preview_shown' });
  });
});
