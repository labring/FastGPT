import http from 'http';
import https from 'https';
import { ProxyAgent } from 'proxy-agent';

const agent = new ProxyAgent();

https.globalAgent = agent;
http.globalAgent = agent;

console.info('NO_PROXY: %s', process.env.NO_PROXY);
console.info('ALL_PROXY: %s', process.env.ALL_PROXY);
console.info('HTTP_PROXY: %s', process.env.HTTP_PROXY);
console.info('HTTPS_PROXY: %s', process.env.HTTPS_PROXY);
