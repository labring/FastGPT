import { act, createElement, Fragment, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowBuilderUIProvider } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/context';
import {
  useWorkflowBuilderUI,
  WorkflowBuilderUIInitializer
} from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/hooks/useWorkflowBuilderUI';
import { WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY } from '@/web/core/app/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    pathname: '/app/detail',
    query: {} as Record<string, string | string[]>,
    replace: vi.fn()
  },
  editor: {
    hasCompletedSystemConfigFirstEntryGuide: true,
    hasCompletedWorkflowBuilderFirstEntryGuide: true,
    completeSystemConfigFirstEntryGuide: vi.fn(),
    completeWorkflowBuilderFirstEntryGuide: vi.fn()
  }
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/components/core/app/useAppEditorUIState', () => ({
  useAppEditorUIState: () => mocks.editor
}));

type ProviderProps = Omit<ComponentProps<typeof WorkflowBuilderUIProvider>, 'children'>;
type BuilderUI = ReturnType<typeof useWorkflowBuilderUI>;

describe('useWorkflowBuilderUI', () => {
  let dom: JSDOM;
  let root: Root;
  let consumers: BuilderUI[];

  const Consumer = ({ index }: { index: number }) => {
    consumers[index] = useWorkflowBuilderUI();
    return null;
  };

  const render = async (props: Partial<ProviderProps> = {}, initialize = false) => {
    await act(async () => {
      root.render(
        createElement(
          WorkflowBuilderUIProvider,
          {
            appId: 'app-1',
            canEdit: true,
            entryAccess: 'enabled',
            systemInitialized: true,
            ...props
          },
          createElement(
            Fragment,
            null,
            initialize && createElement(WorkflowBuilderUIInitializer),
            createElement(Consumer, { index: 0 }),
            createElement(Consumer, { index: 1 })
          )
        )
      );
    });
  };

  const version = (overrides: Partial<WorkflowBuilderVersion> = {}): WorkflowBuilderVersion => ({
    versionNo: 1,
    name: 'AI version 1',
    filename: 'version-1.json',
    checksum: `sha256:${'1'.repeat(64)}`,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000).toISOString(),
    ...overrides
  });

  beforeEach(() => {
    consumers = [];
    vi.clearAllMocks();
    mocks.router.isReady = true;
    mocks.router.query = {};
    mocks.router.replace.mockResolvedValue(true);
    mocks.editor.hasCompletedSystemConfigFirstEntryGuide = true;
    mocks.editor.hasCompletedWorkflowBuilderFirstEntryGuide = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T00:00:00.000Z'));
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares acknowledgements and banner dismissal across consumers while new attention remains visible', async () => {
    await render();
    await act(async () => {
      consumers[0].acknowledgeAttention();
      consumers[1].dismissBanner();
      consumers[0].setActivity({
        isChatGenerating: true,
        isBuildingWorkflow: false,
        pendingInteractiveKey: 'ask-1',
        errorAttentionKey: 'error-1',
        latestVersion: { version: version(), responseChatItemId: 'response-1' }
      });
    });
    expect(consumers.every((ui) => ui.showGeneratingHalo && ui.showAttentionDot)).toBe(true);
    expect(consumers.every((ui) => ui.showLatestBanner)).toBe(true);

    await act(async () => consumers[0].acknowledgeAttention());
    expect(consumers.every((ui) => !ui.showAttentionDot && ui.showLatestBanner)).toBe(true);
    await act(async () => {
      consumers[1].acknowledgeAttention();
      consumers[1].dismissBanner();
    });
    expect(consumers.every((ui) => !ui.showLatestBanner && ui.showGeneratingHalo)).toBe(true);

    await act(async () =>
      consumers[1].setActivity((current) => ({
        ...current,
        isChatGenerating: false,
        pendingInteractiveKey: 'ask-2'
      }))
    );
    expect(consumers.every((ui) => ui.showAttentionDot && !ui.showGeneratingHalo)).toBe(true);
  });

  it.each(['open', 'close', 'toggle'] as const)(
    'acknowledges newly displayed attention when leaving Builder through %s',
    async (action) => {
      await render();
      await act(async () => {
        consumers[0].setActivity({
          isChatGenerating: false,
          isBuildingWorkflow: false,
          latestVersion: { version: version(), responseChatItemId: 'response-1' }
        });
      });
      await act(async () => consumers[0].openLeftPanel('workflowBuilder'));
      await act(async () =>
        consumers[1].setActivity((current) => ({ ...current, errorAttentionKey: 'error-2' }))
      );
      expect(consumers.every((ui) => !ui.showAttentionDot && !ui.showLatestBanner)).toBe(true);

      await act(async () => {
        if (action === 'open') consumers[1].openLeftPanel('systemConfig');
        if (action === 'close') consumers[1].closeLeftPanel('workflowBuilder');
        if (action === 'toggle') consumers[1].toggleLeftPanel('systemConfig');
      });
      expect(consumers.every((ui) => !ui.showAttentionDot && !ui.showLatestBanner)).toBe(true);
      expect(consumers[0].activeLeftPanel).toBe(action === 'close' ? undefined : 'systemConfig');
      expect(consumers[1].activeLeftPanel).toBe(consumers[0].activeLeftPanel);
    }
  );

  it('keeps unrelated panel operations from acknowledging unseen Builder attention', async () => {
    await render();
    await act(async () =>
      consumers[0].setActivity({
        isChatGenerating: false,
        isBuildingWorkflow: false,
        errorAttentionKey: 'error-1'
      })
    );
    await act(async () => consumers[0].toggleLeftPanel('nodeTemplates'));
    await act(async () => consumers[1].closeLeftPanel('systemConfig'));
    expect(consumers[0].activeLeftPanel).toBe('nodeTemplates');
    expect(consumers.every((ui) => ui.showAttentionDot)).toBe(true);
    await act(async () => consumers[1].closeLeftPanel());
    expect(consumers[0].activeLeftPanel).toBeUndefined();

    await act(async () => consumers[0].toggleLeftPanel('workflowBuilder'));
    await act(async () => consumers[1].toggleLeftPanel('workflowBuilder'));
    expect(consumers.every((ui) => !ui.showAttentionDot && !ui.isOpen)).toBe(true);
  });

  it('expires the dot and banner together without stopping the generating halo or hiding a newer version', async () => {
    await render();
    await act(async () =>
      consumers[0].setActivity({
        isChatGenerating: true,
        isBuildingWorkflow: true,
        latestVersion: { version: version(), responseChatItemId: 'response-1' }
      })
    );
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(consumers.every((ui) => ui.showAttentionDot && ui.showLatestBanner)).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(2));
    expect(
      consumers.every((ui) => !ui.showAttentionDot && !ui.showLatestBanner && ui.showGeneratingHalo)
    ).toBe(true);

    await act(async () =>
      consumers[0].setActivity((current) => ({
        ...current,
        latestVersion: {
          version: version({ checksum: `sha256:${'2'.repeat(64)}` }),
          responseChatItemId: 'response-2'
        }
      }))
    );
    expect(consumers.every((ui) => ui.showAttentionDot && ui.showLatestBanner)).toBe(true);
  });

  it.each(['applied', 'expired'] as const)('does not remind for an %s version', async (state) => {
    await render();
    await act(async () =>
      consumers[0].setActivity({
        isChatGenerating: false,
        isBuildingWorkflow: false,
        latestVersion: {
          version: version(
            state === 'applied'
              ? { appliedAt: new Date().toISOString() }
              : { expiresAt: new Date(Date.now() - 1000).toISOString() }
          ),
          responseChatItemId: 'response-1'
        }
      })
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(consumers.every((ui) => !ui.showAttentionDot && !ui.showLatestBanner)).toBe(true);
  });

  it.each(['enabled', 'upgrade'] as const)(
    'initializes the guide once and preserves %s auto-open behavior',
    async (entryAccess) => {
      const enabled = entryAccess === 'enabled';
      mocks.editor.hasCompletedWorkflowBuilderFirstEntryGuide = false;
      mocks.router.query = { [WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY]: ['1'] };
      await render({ entryAccess }, true);
      expect(consumers[0].entryAccess).toBe(entryAccess);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(mocks.router.replace).toHaveBeenCalledTimes(1);
      expect(consumers[0].guideStep).toBe('systemConfig');
      await act(async () => consumers[0].completeGuideStep('systemConfig'));
      expect(consumers[1].guideStep).toBe('workflowBuilder');
      await act(async () => consumers[1].completeGuideStep('workflowBuilder'));
      expect(mocks.editor.completeWorkflowBuilderFirstEntryGuide).toHaveBeenCalledTimes(1);
      expect(consumers[0].isOpen).toBe(enabled);
      expect(consumers[1].focusRequestId).toBe(enabled ? 1 : 0);
      await act(async () => consumers[0].requestInputFocus());
      expect(consumers[1].focusRequestId).toBe(enabled ? 2 : 1);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(mocks.router.replace).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['upgrade', 'hidden'] as const)(
    'does not auto-open Builder if access changes to %s during its guide',
    async (entryAccess) => {
      mocks.editor.hasCompletedWorkflowBuilderFirstEntryGuide = false;
      mocks.router.query = { [WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY]: '1' };
      await render({}, true);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      await act(async () => consumers[0].completeGuideStep('systemConfig'));
      expect(consumers[1].guideStep).toBe('workflowBuilder');

      await render({ entryAccess }, true);
      await act(async () => consumers[1].completeGuideStep('workflowBuilder'));
      expect(consumers.every((ui) => ui.entryAccess === entryAccess && !ui.isOpen)).toBe(true);
      expect(consumers.every((ui) => ui.focusRequestId === 0)).toBe(true);
      expect(mocks.editor.completeWorkflowBuilderFirstEntryGuide).toHaveBeenCalledTimes(1);
    }
  );

  it('waits for initialization readiness and preserves the system-config fallback', async () => {
    mocks.router.isReady = false;
    mocks.editor.hasCompletedSystemConfigFirstEntryGuide = false;
    await render({ systemInitialized: false, entryAccess: 'hidden' }, true);
    expect(consumers[0].entryAccess).toBe('hidden');
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(consumers[0].activeLeftPanel).toBeUndefined();
    mocks.router.isReady = true;
    await render({ entryAccess: 'hidden' }, true);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(consumers[1].activeLeftPanel).toBe('systemConfig');
    expect(mocks.editor.completeSystemConfigFirstEntryGuide).toHaveBeenCalledTimes(1);
    await act(async () => consumers[0].completeGuideStep('systemConfig'));
    expect(consumers[1].guideStep).toBeUndefined();
  });

  it('opens and focuses immediately after a completed guide, then keeps a manually closed panel closed', async () => {
    mocks.router.query = { [WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY]: '1' };
    await render({}, true);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(consumers.every((ui) => ui.isOpen && ui.focusRequestId === 1)).toBe(true);

    await act(async () =>
      consumers[0].setActivity({
        isChatGenerating: false,
        isBuildingWorkflow: false,
        errorAttentionKey: 'error-1'
      })
    );
    await act(async () => consumers[1].closeLeftPanel());
    await render({}, true);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(consumers.every((ui) => !ui.isOpen && !ui.showAttentionDot)).toBe(true);
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
  });
});
