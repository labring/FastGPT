import { Page } from 'puppeteer';
import randomUseragent from 'random-useragent';
import dotenv from 'dotenv';

dotenv.config();
const getRandomUserAgent = () => {
  return randomUseragent.getRandom();
};

const getRandomPlatform = () => {
  const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
  return platforms[Math.floor(Math.random() * platforms.length)];
};

//代理池
const validateproxy = process.env.VALIDATE_PROXY ? JSON.parse(process.env.VALIDATE_PROXY) : [];

const getRandomProxy = () => {
  return validateproxy.length > 0
    ? validateproxy[Math.floor(Math.random() * validateproxy.length)]
    : null;
};

const getRandomLanguages = () => {
  const languages = [
    ['zh-CN', 'zh', 'en'],
    ['en-US', 'en', 'fr'],
    ['es-ES', 'es', 'en']
  ];
  return languages[Math.floor(Math.random() * languages.length)];
};

export const setupPage = async (page: Page): Promise<void> => {
  const proxy = getRandomProxy();
  if (proxy) {
    await page.authenticate({
      username: proxy.ip,
      password: proxy.port.toString()
    });
  }

  await page.evaluateOnNewDocument(() => {
    const newProto = (navigator as any).__proto__;
    delete newProto.webdriver;
    (navigator as any).__proto__ = newProto;
    (window as any).chrome = {};
    (window as any).chrome.app = {
      InstallState: 'testt',
      RunningState: 'estt',
      getDetails: 'stte',
      getIsInstalled: 'ttes'
    };
    (window as any).chrome.csi = function () {};
    (window as any).chrome.loadTimes = function () {};
    (window as any).chrome.runtime = function () {};
    Object.defineProperty(navigator, 'userAgent', {
      get: () => getRandomUserAgent()
    });
    Object.defineProperty(navigator, 'platform', {
      get: () => getRandomPlatform()
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          description: 'Shockwave Flash',
          filename: 'pepflashplayer.dll',
          length: 1,
          name: 'Shockwave Flash'
        }
      ]
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => getRandomLanguages()
    });
    const originalQuery = (window.navigator.permissions as any).query;
    (window.navigator.permissions as any).query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });
};
