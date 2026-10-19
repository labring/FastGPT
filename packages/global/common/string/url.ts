/**
 * 判断字符串是否为以 http:// 或 https:// 开头的网络链接
 */
export const isHttpUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
};

/**
 * 判断字符串是否为完整、可解析的 http/https 地址（必须显式带协议）。
 *
 * 与 `isHttpUrl` 的区别：后者只检查前缀，本函数还会用 `URL` 解析，
 * 以拦截 `https://` 这类缺少 host 的输入。用于保存前的严格校验。
 */
export const isValidHttpUrl = (url?: string): boolean => {
  const trimmed = url?.trim();
  if (!trimmed || !isHttpUrl(trimmed)) return false;

  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};

/**
 * 为缺少协议头的地址补全 `https://`，仅用于兼容历史数据。
 *
 * 新保存的 API 数据集地址已在请求入参 schema 中强制要求完整的 http(s) 地址；
 * 这里只兜底历史记录，避免 axios / `new URL()` 抛 `ERR_INVALID_URL`。
 * 已带任意显式协议的地址原样返回（避免把 `ftp://x` 拼成 `https://ftp://x`），
 * 协议相对地址 `//host` 按 https 处理。
 */
export const ensureHttpProtocol = (url?: string): string => {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
};

export const stripUrlTrailingSlash = (value?: string) => value?.replace(/\/+$/, '') || '';

const ALLOWED_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel', 'cite', 'quote']);

/**
 * 校验 Markdown 中的链接 href 是否安全
 * 防止 javascript:、vbscript:、data: 等伪协议导致的 XSS 或恶意跳转
 */
export const isSafeHref = (href?: string): boolean => {
  if (!href || typeof href !== 'string') return false;

  const trimmed = href.trim();
  if (!trimmed) return false;

  const checkProtocol = (str: string) => {
    // 仅当包含 & 时才解析可能存在的 HTML 实体，避免常规链接额外正则开销
    let decodedHtml = str;
    if (str.includes('&')) {
      decodedHtml = str
        .replace(/&colon;?/gi, ':')
        .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex, dec) => {
          const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
          return String.fromCharCode(code);
        });
    }

    // 移除空白符和所有控制字符（WHATWG URL 标准规定协议中出现的空白与 C0 控制符会被浏览器忽略）
    const stripped = decodedHtml.replace(/[\u0000-\u0020\u007F-\u009F\s]+/g, '');

    const colonIndex = stripped.indexOf(':');
    const questionMarkIndex = stripped.indexOf('?');
    const hashIndex = stripped.indexOf('#');
    const slashIndex = stripped.indexOf('/');

    // 若无冒号，或冒号出现在斜杠、问号、井号之后，则属于相对路径、参数或锚点，而非协议
    const isRelative =
      colonIndex === -1 ||
      (slashIndex !== -1 && colonIndex > slashIndex) ||
      (questionMarkIndex !== -1 && colonIndex > questionMarkIndex) ||
      (hashIndex !== -1 && colonIndex > hashIndex);

    if (isRelative) return true;

    const protocol = stripped.slice(0, colonIndex).toLowerCase();
    return ALLOWED_PROTOCOLS.has(protocol);
  };

  if (!checkProtocol(trimmed)) return false;

  // 仅当包含 % 时，针对 URL 编码绕过（如 javascript%3A 或 %6a%61%76%61...）进行二次解码校验
  if (trimmed.includes('%')) {
    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded !== trimmed && !checkProtocol(decoded)) {
        return false;
      }
    } catch {
      // 非 UTF-8 的百分号编码（如 GBK 编码的中文查询参数 %D6%D0%CE%C4）是合法链接，
      // 只是 decodeURIComponent 解不出来。协议名、冒号和空白都是 ASCII，
      // 这里只解码 %00-%7F 后再校验一次，编码混淆的伪协议仍会被拦下。
      const asciiDecoded = trimmed.replace(/%([0-7][0-9a-f])/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      if (!checkProtocol(asciiDecoded)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * 校验 Markdown 中的图片 src 是否安全
 * 允许 http/https、相对路径、以及用于预览的合法图片 data URI
 */
export const isSafeImgSrc = (src?: string): boolean => {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;

  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(trimmed)) {
    return true;
  }

  return isSafeHref(trimmed);
};
