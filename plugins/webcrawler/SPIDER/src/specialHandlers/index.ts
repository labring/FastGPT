import { Page } from 'puppeteer';

export const handleSpecialWebsite = async (page: Page, url: string): Promise<string | null> => {
  if (url.includes('blog.csdn.net')) {
    await page.waitForSelector('article');
    const content = await page.$eval('article', el => el.innerHTML);
    return content;
  }
  if (url.includes('zhuanlan.zhihu.com')) {
    console.log('是知乎，需要点击按掉！');
    console.log(await page.content());
    if((await page.content()).includes('{"error":{"message":"您当前请求存在异常，暂时限制本次访问。如有疑问，您可以通过手机摇一摇或登录后私信知乎小管家反馈。","code":40362}}')) return null;
    await page.waitForSelector('button[aria-label="关闭"]');
    await page.click('button[aria-label="关闭"]'); // 使用 aria-label 选择按钮
    await page.waitForSelector('article');
    const content = await page.$eval('article', el => el.innerHTML);
    return content;
  }
  // 可以添加更多特殊网站的处理逻辑
  return null;
};