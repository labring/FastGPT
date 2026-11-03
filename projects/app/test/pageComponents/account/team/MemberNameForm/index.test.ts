import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateName: vi.fn(),
  markInteracted: vi.fn(),
  loading: false,
  nameError: ''
}));

vi.mock('@chakra-ui/react', () => ({
  Box: 'box',
  Button: 'button',
  FormControl: 'form-control',
  FormErrorMessage: 'form-error',
  Input: 'input'
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({ default: 'modal' }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: mocks.updateName, loading: mocks.loading })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ initUserInfo: vi.fn() })
}));
vi.mock('@/web/support/user/team/api', () => ({ putUpdateMemberName: vi.fn() }));
vi.mock('@/pageComponents/account/team/MemberNameForm/useMemberNameForm', () => ({
  useMemberNameForm: () => ({
    memberName: '张三',
    nameError: mocks.nameError,
    showNameError: !!mocks.nameError,
    markInteracted: mocks.markInteracted,
    onNameChange: vi.fn(),
    parseMemberName: () => '张三'
  })
}));

vi.stubGlobal('React', await import('react'));
const MemberNameForm = (await import('@/pageComponents/account/team/MemberNameForm')).default;

const findInput = (node: ReactNode): ReactElement => {
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element?.type === 'input') return element;

  const children = Array.isArray(element?.props?.children)
    ? element.props.children
    : [element?.props?.children];
  for (const child of children) {
    if (!child) continue;
    try {
      return findInput(child);
    } catch {}
  }
  throw new Error('Unable to find member name input');
};

describe.each([true, false])('MemberNameForm dismissible=%s Enter submission', (dismissible) => {
  const getKeyDownHandler = () =>
    findInput(MemberNameForm({ defaultName: '张三', dismissible, onSubmitted: vi.fn() })).props
      .onKeyDown;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loading = false;
    mocks.nameError = '';
  });

  it.each([
    ['IME composition', { key: 'Enter', keyCode: 13, isComposing: true }],
    ['IME fallback key code', { key: 'Enter', keyCode: 229, isComposing: false }],
    ['another key', { key: 'a', keyCode: 65, isComposing: false }]
  ])('preserves default input behavior without submitting for %s', (_case, event) => {
    const preventDefault = vi.fn();
    getKeyDownHandler()({
      key: event.key,
      keyCode: event.keyCode,
      nativeEvent: { isComposing: event.isComposing },
      preventDefault
    });

    expect(mocks.updateName).not.toHaveBeenCalled();
    expect(mocks.markInteracted).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('submits once when Enter is pressed again after confirming the IME candidate', () => {
    const onKeyDown = getKeyDownHandler();
    const preventDefault = vi.fn();
    onKeyDown({
      key: 'Enter',
      keyCode: 229,
      nativeEvent: { isComposing: true },
      preventDefault
    });
    onKeyDown({
      key: 'Enter',
      keyCode: 13,
      nativeEvent: { isComposing: false },
      preventDefault
    });

    expect(mocks.updateName).toHaveBeenCalledTimes(1);
    expect(mocks.markInteracted).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each(['loading', 'invalid name'])('does not submit with %s', (state) => {
    mocks.loading = state === 'loading';
    mocks.nameError = state === 'invalid name' ? 'Name required' : '';
    getKeyDownHandler()({
      key: 'Enter',
      keyCode: 13,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn()
    });
    expect(mocks.updateName).not.toHaveBeenCalled();
  });
});
