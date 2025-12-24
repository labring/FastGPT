import http from 'http';
import https from 'https';
import { ProxyAgent } from 'proxy-agent';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const fetchProxyAgent = new EnvHttpProxyAgent();
setGlobalDispatcher(fetchProxyAgent);

const httpProxyAgent = new ProxyAgent();
http.globalAgent = httpProxyAgent;
https.globalAgent = httpProxyAgent;

console.info('HTTP_PROXY: %s', process.env.HTTP_PROXY);
console.info('HTTPS_PROXY: %s', process.env.HTTPS_PROXY);
console.info('NO_PROXY: %s', process.env.NO_PROXY);
console.info('ALL_PROXY: %s', process.env.ALL_PROXY);
