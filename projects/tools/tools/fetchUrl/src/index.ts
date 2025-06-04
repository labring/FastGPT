import { defineInputSchema } from '@/type';
import { isIPv6 } from 'net';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { getNanoid } from '@/utils/string';
export const matchMdImg = (text: string) => {
  const base64Regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64[^)]+)\)/g;
  const imageList: ImageType[] = [];

  text = text.replace(base64Regex, (match, altText, base64Url) => {
    const uuid = `IMAGE_${getNanoid(12)}_IMAGE`;
    const mime = base64Url.split(';')[0].split(':')[1];
    const base64 = base64Url.split(',')[1];

    imageList.push({
      uuid,
      base64,
      mime
    });

    // 保持原有的 alt 文本，只替换 base64 部分
    return `![${altText}](${uuid})`;
  });

  return {
    text,
    imageList
  };
};
export type ImageType = {
  uuid: string;
  base64: string;
  mime: string;
};

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;

export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

export const simpleText = (text = '') => {
  text = text.trim();
  text = text.replace(/([\u4e00-\u9fa5])[\s&&[^\n]]+([\u4e00-\u9fa5])/g, '$1$2');
  text = text.replace(/\r\n|\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[\s&&[^\n]]{2,}/g, ' ');
  text = text.replace(/[\x00-\x08]/g, ' ');

  return text;
};
export const simpleMarkdownText = (rawText: string) => {
  rawText = simpleText(rawText);

  // Remove a line feed from a hyperlink or picture
  rawText = rawText.replace(/\[([^\]]+)\]\((.+?)\)/g, (match, linkText, url) => {
    const cleanedLinkText = linkText.replace(/\n/g, ' ').trim();

    if (!url) {
      return '';
    }

    return `[${cleanedLinkText}](${url})`;
  });

  // replace special #\.* ……
  const reg1 = /\\([#`!*()+-_\[\]{}\\.])/g;
  if (reg1.test(rawText)) {
    rawText = rawText.replace(reg1, '$1');
  }

  // replace \\n
  rawText = rawText.replace(/\\\\n/g, '\\n');

  // Remove headings and code blocks front spaces
  ['####', '###', '##', '#', '```', '~~~'].forEach((item, i) => {
    const reg = new RegExp(`\\n\\s*${item}`, 'g');
    if (reg.test(rawText)) {
      rawText = rawText.replace(new RegExp(`(\\n)( *)(${item})`, 'g'), '$1$3');
    }
  });

  return rawText.trim();
};

export const isInternalAddress = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const fullUrl = parsedUrl.toString();

    // Check for localhost and common internal domains
    if (hostname === SERVICE_LOCAL_HOST) {
      return true;
    }

    // Metadata endpoints whitelist
    const metadataEndpoints = [
      // AWS
      'http://169.254.169.254/latest/meta-data/',
      // Azure
      'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
      // GCP
      'http://metadata.google.internal/computeMetadata/v1/',
      // Alibaba Cloud
      'http://100.100.100.200/latest/meta-data/',
      // Tencent Cloud
      'http://metadata.tencentyun.com/latest/meta-data/',
      // Huawei Cloud
      'http://169.254.169.254/latest/meta-data/'
    ];
    if (metadataEndpoints.some((endpoint) => fullUrl.startsWith(endpoint))) {
      return true;
    }

    if (process.env.CHECK_INTERNAL_IP !== 'true') return false;

    // For IP addresses, check if they are internal
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Pattern.test(hostname)) {
      return false; // Not an IP address, so it's a domain name - consider it external by default
    }

    // ... existing IP validation code ...
    const parts = hostname.split('.').map(Number);

    if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) {
      return false;
    }

    // Only allow public IP ranges
    return (
      parts[0] !== 0 &&
      parts[0] !== 10 &&
      parts[0] !== 127 &&
      !(parts[0] === 169 && parts[1] === 254) &&
      !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) &&
      !(parts[0] === 192 && parts[1] === 168) &&
      !(parts[0] >= 224 && parts[0] <= 239) &&
      !(parts[0] >= 240 && parts[0] <= 255) &&
      !(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) &&
      !(parts[0] === 9 && parts[1] === 0) &&
      !(parts[0] === 11 && parts[1] === 0)
    );
  } catch {
    return false; // If URL parsing fails, reject it as potentially unsafe
  }
};

export type UrlFetchParams = {
  urlList: string[];
  selector?: string;
};

export type UrlFetchResponse = {
  url: string;
  title: string;
  content: string;
  selector?: string;
}[];

export const cheerioToHtml = ({
  fetchUrl,
  $,
  selector
}: {
  fetchUrl: string;
  $: cheerio.CheerioAPI;
  selector?: string;
}) => {
  // get origin url
  const originUrl = new URL(fetchUrl).origin;
  const protocol = new URL(fetchUrl).protocol; // http: or https:

  const usedSelector = selector || 'body';
  const selectDom = $(usedSelector);

  // remove i element
  selectDom.find('i,script,style').remove();

  // remove empty a element
  selectDom
    .find('a')
    .filter((i, el) => {
      return $(el).text().trim() === '' && $(el).children().length === 0;
    })
    .remove();

  // if link,img startWith /, add origin url
  selectDom.find('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      if (href.startsWith('//')) {
        $(el).attr('href', protocol + href);
      } else if (href.startsWith('/')) {
        $(el).attr('href', originUrl + href);
      }
    }
  });
  selectDom.find('img, video, source, audio, iframe').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      if (src.startsWith('//')) {
        $(el).attr('src', protocol + src);
      } else if (src.startsWith('/')) {
        $(el).attr('src', originUrl + src);
      }
    }
  });

  const html = selectDom
    .map((item, dom) => {
      return $(dom).html();
    })
    .get()
    .join('\n');

  const title = $('head title').text() || $('h1:first').text() || fetchUrl;

  return {
    html,
    title,
    usedSelector
  };
};

export const urlsFetch = async ({
  urlList,
  selector
}: UrlFetchParams): Promise<UrlFetchResponse> => {
  urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

  const response = await Promise.all(
    urlList.map(async (url) => {
      const isInternal = isInternalAddress(url);
      if (isInternal) {
        return {
          url,
          title: '',
          content: 'Cannot fetch internal url',
          selector: ''
        };
      }

      try {
        const fetchRes = await axios.get(url, {
          timeout: 30000
        });

        const $ = cheerio.load(fetchRes.data);
        const { title, html, usedSelector } = cheerioToHtml({
          fetchUrl: url,
          $,
          selector
        });

        const md = simpleMarkdownText(html);

        return {
          url,
          title,
          content: md,
          selector: usedSelector
        };
      } catch (error) {
        console.log(error, 'fetch error');

        return {
          url,
          title: '',
          content: '',
          selector: ''
        };
      }
    })
  );

  return response;
};

export const InputType = defineInputSchema(
  z.object({
    url: z.string()
  })
);

export const OutputType = z.object({
  result: z.string()
});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const [{ content: result }] = await urlsFetch({
    urlList: [props.url],
    selector: 'body'
  });
  return {
    result
  };
}
