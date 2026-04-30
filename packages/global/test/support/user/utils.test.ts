import { describe, it, expect } from 'vitest';
import { getRandomUserAvatar } from '@fastgpt/global/support/user/utils';

describe('user/utils', () => {
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

    it('should return one of the default avatars', () => {
      const avatar = getRandomUserAvatar();
      expect(defaultAvatars).toContain(avatar);
    });

    it('should return a string', () => {
      const avatar = getRandomUserAvatar();
      expect(typeof avatar).toBe('string');
    });

    it('should return different avatars on multiple calls (probabilistic)', () => {
      const results = new Set<string>();
      // Call 50 times to get different avatars
      for (let i = 0; i < 50; i++) {
        results.add(getRandomUserAvatar());
      }
      // With 10 avatars and 50 calls, we should get at least 5 different ones
      expect(results.size).toBeGreaterThanOrEqual(5);
    });

    it('should always return valid avatar path', () => {
      for (let i = 0; i < 20; i++) {
        const avatar = getRandomUserAvatar();
        expect(avatar).toMatch(/^\/imgs\/avatar\/\w+Avatar\.svg$/);
      }
    });
  });
});
