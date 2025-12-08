import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

if (proxy) {
  const agent = new HttpsProxyAgent(proxy);
  http.globalAgent = agent;
  https.globalAgent = agent;

  console.info(`Global Proxy enabled: ${proxy}`);
} else {
  console.info('Global Proxy disabled');
}
