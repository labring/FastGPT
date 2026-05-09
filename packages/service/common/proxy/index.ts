import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// setup proxy for fetch client
const fetchProxyAgent = new EnvHttpProxyAgent();
setGlobalDispatcher(fetchProxyAgent);

const formatProxyForLog = (value?: string) => {
  if (!value) return 'disabled';
  try {
    const url = new URL(value);
    url.username = url.username ? '***' : '';
    url.password = url.password ? '***' : '';
    return url.toString();
  } catch {
    return 'enabled';
  }
};

console.info('HTTP_PROXY: %s', formatProxyForLog(process.env.HTTP_PROXY));
console.info('HTTPS_PROXY: %s', formatProxyForLog(process.env.HTTPS_PROXY));
console.info('NO_PROXY: %s', process.env.NO_PROXY ? 'configured' : 'disabled');
console.info('ALL_PROXY: %s', formatProxyForLog(process.env.ALL_PROXY));
