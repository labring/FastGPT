import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import axios from 'axios';
import { ProxyAgent } from 'proxy-agent';

const fetchProxyAgent = new EnvHttpProxyAgent();
setGlobalDispatcher(fetchProxyAgent);

/** @see https://github.com/axios/axios/issues/4531 */
axios.defaults.proxy = false;
axios.defaults.httpAgent = new ProxyAgent();
axios.defaults.httpsAgent = new ProxyAgent();

console.info('HTTP_PROXY: %s', process.env.HTTP_PROXY);
console.info('HTTPS_PROXY: %s', process.env.HTTPS_PROXY);
console.info('NO_PROXY: %s', process.env.NO_PROXY);
console.info('ALL_PROXY: %s', process.env.ALL_PROXY);
