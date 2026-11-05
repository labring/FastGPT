import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSkillSelect } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentSkillSelect';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  disclosures: [] as { onOpen: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> }[],
  toast: vi.fn(),
  confirm: vi.fn(),
  confirmAction: vi.fn(),
  isTeamAdmin: true
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('@chakra-ui/react', () => ({
  useDisclosure: () => {
    const state = { isOpen: false, onOpen: vi.fn(), onClose: vi.fn() };
    mocks.disclosures.push(state);
    return state;
  }
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: mocks.confirm, ConfirmModal: () => null })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ isTeamAdmin: mocks.isTeamAdmin })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const skill = { skillId: 'skill-1', name: 'Skill', description: '' };
const render = (overrides: Partial<Parameters<typeof useAgentSkillSelect>[0]> = {}) => {
  const props = {
    selectedAgentSkills: [],
    useAgentSandbox: false,
    showSandbox: true,
    enableSandbox: true,
    onUpdateSkills: vi.fn(),
    onUpdateSandbox: vi.fn(),
    ...overrides
  };
  return { props, hook: useAgentSkillSelect(props) };
};

describe('useAgentSkillSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
    mocks.disclosures = [];
    mocks.isTeamAdmin = true;
    mocks.confirm.mockReturnValue(mocks.confirmAction);
  });

  it('uses one availability guard for opening and adding skills', () => {
    const { props, hook } = render({ showSandbox: false });
    hook.openSkillSelect();
    expect(hook.onAddAgentSkill(skill)).toBe(false);
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.disclosures[1].onOpen).not.toHaveBeenCalled();
    expect(props.onUpdateSkills).not.toHaveBeenCalled();
    hook.onChangeAgentSandbox(true);
    expect(props.onUpdateSandbox).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves the upgrade prompt for team admin=%s', (isTeamAdmin) => {
    mocks.isTeamAdmin = isTeamAdmin;
    const { props, hook } = render({ enableSandbox: false });
    hook.openSkillSelect();
    expect(hook.onAddAgentSkill(skill)).toBe(false);
    expect(mocks.confirmAction).toHaveBeenCalledTimes(2);
    expect(mocks.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onConfirm: isTeamAdmin ? mocks.disclosures[0].onOpen : undefined,
        showCancel: isTeamAdmin
      })
    );
    hook.onChangeAgentSandbox(true);
    expect(props.onUpdateSkills).not.toHaveBeenCalled();
    expect(props.onUpdateSandbox).not.toHaveBeenCalled();
  });

  it('adds a skill once and enables sandbox in the same update', () => {
    const { props, hook } = render({ selectedAgentSkills: [skill] });
    hook.openSkillSelect();
    expect(mocks.disclosures[1].onOpen).toHaveBeenCalledOnce();
    expect(hook.onAddAgentSkill({ ...skill, name: 'Updated' })).toBe(true);
    expect(props.onUpdateSkills).toHaveBeenCalledWith(expect.any(Function), true);
    const concurrentSkill = { ...skill, skillId: 'concurrent' };
    const add = props.onUpdateSkills.mock.calls[0][0];
    expect(add([concurrentSkill, skill])).toEqual([{ ...skill, name: 'Updated' }, concurrentSkill]);
    hook.onRemoveAgentSkill(skill.skillId);
    const remove = props.onUpdateSkills.mock.calls[1][0];
    expect(remove([skill, concurrentSkill])).toEqual([concurrentSkill]);
  });

  it('keeps sandbox enabled while selected skills depend on it', () => {
    const { props, hook } = render({ selectedAgentSkills: [skill] });
    expect(hook.isAgentSkillSandboxUnavailable).toBe(true);
    mocks.effects.forEach((effect) => effect());
    expect(props.onUpdateSandbox).toHaveBeenCalledWith(true);
    props.onUpdateSandbox.mockClear();
    hook.onChangeAgentSandbox(false);
    expect(props.onUpdateSandbox).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'skill:sandbox_disable_blocked_toast' })
    );
  });

  it.each([{ showSandbox: false }, { enableSandbox: false }])(
    'lets users disable an unavailable historical sandbox: %j',
    (availability) => {
      const { props, hook } = render({
        selectedAgentSkills: [skill],
        useAgentSandbox: true,
        ...availability
      });
      expect(hook.isAgentSkillSandboxUnavailable).toBe(true);
      mocks.effects.forEach((effect) => effect());
      expect(props.onUpdateSandbox).not.toHaveBeenCalled();
      hook.onChangeAgentSandbox(false);
      expect(props.onUpdateSandbox).toHaveBeenCalledWith(false);
    }
  );

  it('allows sandbox changes without skills and skips automatic updates for an enabled sandbox', () => {
    const { props, hook } = render({ useAgentSandbox: true });
    mocks.effects.forEach((effect) => effect());
    expect(props.onUpdateSandbox).not.toHaveBeenCalled();
    hook.onChangeAgentSandbox(false);
    hook.onChangeAgentSandbox(true);
    expect(props.onUpdateSandbox.mock.calls).toEqual([[false], [true]]);
    hook.onAddAgentSkill(skill);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each([{ showSandbox: false }, { enableSandbox: false }])(
    'does not show a skill error for an unavailable sandbox without skills: %j',
    (availability) => {
      const { hook } = render({ useAgentSandbox: true, ...availability });
      expect(hook.isAgentSkillSandboxUnavailable).toBe(false);
    }
  );
});
