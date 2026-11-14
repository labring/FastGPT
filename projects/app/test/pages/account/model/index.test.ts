import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

const state = vi.hoisted(() => ({ username: 'member', role: '', isOwner: false }));
vi.stubGlobal('React', React);
vi.mock('next/router', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ initd: true, feConfigs: { isPlus: true, enable_team_model: false } })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: {
      username: state.username,
      team: { role: state.role, permission: { isOwner: state.isOwner } }
    }
  })
}));
vi.mock('@/pageComponents/account/AccountContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children)
}));
vi.mock('@/components/core/ai/ModelTable', () => ({
  default: ({ onReplaceInvalidModels }: { onReplaceInvalidModels?: () => void }) =>
    onReplaceInvalidModels
      ? React.createElement(
          'button',
          { onClick: onReplaceInvalidModels },
          'config_model:replace_invalid_title'
        )
      : null
}));
vi.mock('@/pageComponents/model/ModelManagementContainer', () => ({ default: () => null }));
vi.mock('@/pageComponents/model/ReplaceInvalidModelsModal', () => ({ default: () => null }));

import ModelProvider from '@/pages/account/model';

describe('model account replacement entry', () => {
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ChakraProvider, null, React.createElement(ModelProvider))
    );

  it('shows the replacement entry to the actual team owner', () => {
    state.username = 'member';
    state.role = TeamMemberRoleEnum.owner;
    state.isOwner = true;
    expect(render()).toContain('config_model:replace_invalid_title');
  });

  it('shows the replacement entry to root in a managed foreign team where role is empty', () => {
    state.username = 'root';
    state.role = '';
    state.isOwner = true;
    expect(render()).toContain('config_model:replace_invalid_title');
  });

  it('hides the replacement entry from other members', () => {
    state.username = 'member';
    state.role = '';
    state.isOwner = false;
    expect(render()).not.toContain('config_model:replace_invalid_title');
  });
});
