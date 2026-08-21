import type { ReactElement } from 'react';
import { Box } from '@chakra-ui/react';
import Avatar from '../../../components/common/Avatar';
import MyIcon from '../../../components/common/Icon';
import MyImage from '../../../components/common/Image/MyImage';
import { describe, expect, it } from 'vitest';

type AvatarView = ReactElement<Record<string, unknown>>;

const renderAvatar = (props: Record<string, unknown>) =>
  (Avatar as unknown as { type: (props: Record<string, unknown>) => AvatarView }).type(props);

describe('Avatar', () => {
  it('recognizes built-in icons with a leading slash', () => {
    const view = renderAvatar({ src: '/core/app/type/simpleFill', w: '20px' });
    const icon = view.props.children as ReactElement<Record<string, unknown>>;

    expect(view.type).toBe(Box);
    expect(icon.type).toBe(MyIcon);
    expect(icon.props.name).toBe('core/app/type/simpleFill');
  });

  it('keeps regular avatar paths as images', () => {
    const view = renderAvatar({ src: '/imgs/avatar.png', w: '20px' });

    expect(view.type).toBe(MyImage);
    expect(view.props.src).toBe('/imgs/avatar.png');
  });
});
