import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { memberManagerMocks as mocks, setupMemberManagerTest } from './memberManagerTestUtils';
import TeamMemberEditLoader from '@/pageComponents/account/team/TeamMemberEditLoader';

describe('TeamMemberEditLoader', () => {
  const harness = setupMemberManagerTest();
  const mounted = vi.fn();
  const Draft = () => {
    mounted();
    const [count, setCount] = useState(0);
    return React.createElement('button', { onClick: () => setCount(count + 1) }, `draft-${count}`);
  };
  const render = (id = 'group') =>
    harness.render(
      // render prop 是函数，React.createElement 的 children 参数只接受 ReactNode。
      // eslint-disable-next-line react/no-children-prop
      React.createElement(TeamMemberEditLoader, {
        key: id,
        params: { groupId: id },
        children: () => React.createElement(Draft)
      })
    );

  it('mounts the editor only after success, including an empty list', async () => {
    await render();
    expect(harness.container.querySelector('[data-loading=true]')).not.toBeNull();
    expect(mounted).not.toHaveBeenCalled();
    await harness.resolve(0, []);
    expect(harness.container.querySelector('[data-loading=true]')).toBeNull();
    expect(harness.button('draft-0')).toBeDefined();
  });

  it('shows an error instead of perpetual loading and restarts on explicit retry', async () => {
    await render();
    await harness.reject(0);
    expect(harness.container.querySelector('[role=alert]')).not.toBeNull();
    expect(harness.container.querySelector('[data-loading=true]')).toBeNull();
    expect(harness.button('draft-0')).toBeUndefined();
    expect(mocks.toast).not.toHaveBeenCalled();
    await harness.click('common:password_verification_retry');
    expect(mocks.loadMembers).toHaveBeenCalledTimes(2);
    expect(harness.pending[0].controller.signal.aborted).toBe(true);
    await harness.resolve(1, []);
    expect(harness.container.querySelector('[role=alert]')).toBeNull();
    expect(harness.button('draft-0')).toBeDefined();
  });

  it('preserves local edits across ordinary parent renders', async () => {
    await render();
    await harness.resolve(0, []);
    await harness.click('draft-0');
    await render();
    expect(harness.button('draft-1')).toBeDefined();
    expect(mocks.loadMembers).toHaveBeenCalledOnce();
  });

  it('clears the old draft immediately when switching resource keys', async () => {
    await render();
    await harness.resolve(0, []);
    await harness.click('draft-0');
    await render('new-group');
    expect(harness.button('draft-1')).toBeUndefined();
    expect(harness.pending[0].controller.signal.aborted).toBe(true);
    expect(mocks.loadMembers).toHaveBeenLastCalledWith(
      { groupId: 'new-group' },
      expect.any(AbortController)
    );
    await harness.resolve(1, []);
    expect(harness.button('draft-0')).toBeDefined();
  });

  it('ignores late responses after switching or closing', async () => {
    await render();
    await render('new-group');
    await harness.resolve(0, []);
    expect(harness.button('draft-0')).toBeUndefined();
    await harness.render(null);
    expect(harness.pending[1].controller.signal.aborted).toBe(true);
    await harness.resolve(1, []);
    expect(harness.container.innerHTML).toBe('');
  });

  it('replays mount effects safely in StrictMode', async () => {
    await harness.render(
      React.createElement(
        React.StrictMode,
        null,
        // eslint-disable-next-line react/no-children-prop
        React.createElement(TeamMemberEditLoader, {
          params: { groupId: 'group' },
          children: () => React.createElement(Draft)
        })
      )
    );
    expect(mocks.loadMembers).toHaveBeenCalledTimes(2);
    expect(harness.pending[0].controller.signal.aborted).toBe(true);
    await harness.resolve(0, []);
    expect(harness.button('draft-0')).toBeUndefined();
    await harness.resolve(1, []);
    expect(harness.button('draft-0')).toBeDefined();
  });
});
