import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const fetchProxyAgent = new EnvHttpProxyAgent();
setGlobalDispatcher(fetchProxyAgent);

console.info('HTTP_PROXY: %s', process.env.HTTP_PROXY);
console.info('HTTPS_PROXY: %s', process.env.HTTPS_PROXY);
console.info('NO_PROXY: %s', process.env.NO_PROXY);
console.info('ALL_PROXY: %s', process.env.ALL_PROXY);
