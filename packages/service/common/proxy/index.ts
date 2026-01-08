import http from 'http';
import https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  const httpProxy = process.env.HTTP_PROXY;
  const httpsProxy = process.env.HTTPS_PROXY;
  if (httpProxy) {
    http.globalAgent = new HttpProxyAgent(httpProxy);
  }
  if (httpsProxy) {
    https.globalAgent = new HttpsProxyAgent(httpsProxy);
  }

  console.info(`Global Proxy enabled: ${httpProxy}, ${httpsProxy}`);
} else {
  console.info('Global Proxy disabled');
}
