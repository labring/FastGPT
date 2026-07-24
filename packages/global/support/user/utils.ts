export const getRandomUserAvatar = () => {
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

  return defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
};

/** 统一判断持久化密码是否存在；历史缺失、null 和空字符串都按未设置处理。 */
export const hasStoredPassword = (password: unknown): password is string =>
  typeof password === 'string' && password.length > 0;
