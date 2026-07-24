import { describe, expect, it } from 'vitest';
import { getRandomUserAvatar, hasStoredPassword } from '@fastgpt/global/support/user/utils';

describe('getRandomUserAvatar', () => {
  const defaultAvatars = [
    '/imgs/avatar/RoyalBlueAvatar.svg',
    '/imgs/avatar/PurpleAvatar.svg',
    '/imgs/avatar/AdoraAvatar.svg',
    '/imgs/avatar/OrangeAvatar.svg',
    '/imgs/avatar/RedAvatar.svg',
    '/imgs/avatar/GrayModernAvatar.svg',
    '/imgs/avatar/TealAvatar.svg',
    '/imgs/avatar/GreenAvatar.svg',
    '/imgs/avatar/BrightBlueAvatar.svg',
    '/imgs/avatar/BlueAvatar.svg'
  ];

  it('returns one of the default avatars', () => {
    expect(defaultAvatars).toContain(getRandomUserAvatar());
  });

  it('returns a string', () => {
    expect(typeof getRandomUserAvatar()).toBe('string');
  });

  it('returns a valid avatar path', () => {
    expect(getRandomUserAvatar()).toMatch(/^\/imgs\/avatar\/\w+Avatar\.svg$/);
  });
});

describe('hasStoredPassword', () => {
  it.each([undefined, null, '', 0, false])('treats %j as no stored password', (password) => {
    expect(hasStoredPassword(password)).toBe(false);
  });

  it.each(['digest', ' '])('treats a non-empty string as a stored password', (password) => {
    expect(hasStoredPassword(password)).toBe(true);
  });
});
