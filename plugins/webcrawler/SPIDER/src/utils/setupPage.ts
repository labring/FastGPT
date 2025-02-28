import { Page } from 'puppeteer';
import randomUseragent from 'random-useragent';

const getRandomUserAgent = () => {
  return randomUseragent.getRandom();
};

const getRandomPlatform = () => {
  const platforms = ["Win32", "MacIntel", "Linux x86_64"];
  return platforms[Math.floor(Math.random() * platforms.length)];
};

//代理池
const validateproxy = [
  { ip: "39.102.210.222", port: 8080 },
  { ip: "8.130.71.75", port: 8080 },
  { ip: "39.102.214.208", port: 9999 },
  { ip: "39.104.59.56", port: 8080 },
  { ip: "8.130.37.235", port: 3128 },
  { ip: "8.138.131.110", port: 8080 },
  { ip: "8.140.105.75", port: 8009 },
  { ip: "114.80.38.120", port: 3081 },
  { ip: "8.148.23.165", port: 8081 },
  { ip: "119.96.72.199", port: 59394 },
  { ip: "120.55.14.137", port: 80 },
  { ip: "47.116.181.146", port: 5060 },
  { ip: "39.102.214.199", port: 3128 },
  { ip: "47.121.183.107", port: 8080 },
  { ip: "39.104.16.201", port: 8080 },
  { ip: "39.102.209.163", port: 10002 },
  { ip: "101.201.76.157", port: 9090 },
  { ip: "122.224.124.26", port: 12080 },
  { ip: "180.105.244.199", port: 1080 },
  { ip: "119.3.113.150", port: 9094 }
];

const getRandomProxy = () => {
  return validateproxy[Math.floor(Math.random() * validateproxy.length)];
};

const getRandomLanguages = () => {
  const languages = [
    ["zh-CN", "zh", "en"],
    ["en-US", "en", "fr"],
    ["es-ES", "es", "en"]
  ];
  return languages[Math.floor(Math.random() * languages.length)];
};

export const setupPage = async (page: Page): Promise<void> => {
  const proxy = getRandomProxy();
  await page.authenticate({
    username: proxy.ip,
    password: proxy.port.toString()
  });

  await page.evaluateOnNewDocument(() => {
    const newProto = (navigator as any).__proto__;
    delete newProto.webdriver;
    (navigator as any).__proto__ = newProto;
    (window as any).chrome = {};
    (window as any).chrome.app = {"InstallState":"testt", "RunningState":"estt", "getDetails":"stte", "getIsInstalled":"ttes"};
    (window as any).chrome.csi = function(){};
    (window as any).chrome.loadTimes = function(){};
    (window as any).chrome.runtime = function(){};
    Object.defineProperty(navigator, 'userAgent', {
      get: () => getRandomUserAgent(),
    });
    Object.defineProperty(navigator, 'platform', {
      get: () => getRandomPlatform(),
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [{"description": "Shockwave Flash",
                  "filename": "pepflashplayer.dll",
                  "length": 1,
                  "name": "Shockwave Flash"}]
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => getRandomLanguages(),
    });
    const originalQuery = (window.navigator.permissions as any).query;
    (window.navigator.permissions as any).query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission } as PermissionStatus) :
        originalQuery(parameters)
    );
  });
};