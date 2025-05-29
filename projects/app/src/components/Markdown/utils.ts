export enum CodeClassNameEnum {
  guide = 'guide',
  questionguide = 'questionguide',
  mermaid = 'mermaid',
  echarts = 'echarts',
  quote = 'quote',
  files = 'files',
  latex = 'latex',
  iframe = 'iframe',
  html = 'html',
  svg = 'svg',
  video = 'video',
  audio = 'audio'
}

export const mdTextFormat = (text: string) => {
  // NextChat function - Format latex to $$
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g;
  text = text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock;
    } else if (squareBracket) {
      return `$$${squareBracket}$$`;
    } else if (roundBracket) {
      return `$${roundBracket}$`;
    }
    return match;
  });

  // 处理 [quote:id] 格式引用，将 [quote:675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](CITE)
  text = text
    // .replace(
    //   /([\u4e00-\u9fa5\u3000-\u303f])([a-zA-Z0-9])|([a-zA-Z0-9])([\u4e00-\u9fa5\u3000-\u303f])/g,
    //   '$1$3 $2$4'
    // )
    // 处理 格式引用，将 [675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](CITE)
    .replace(/\[([a-f0-9]{24})\](?!\()/g, '[$1](CITE)');

  // 处理链接后的中文标点符号，增加空格
  text = text.replace(/(https?:\/\/[^\s，。！？；：、]+)([，。！？；：、])/g, '$1 $2');

  return text;
};

/**
 * general safe attribute filter
 * @param props input props object
 * @param allowedAttrs allowed attribute name Set
 */
export function filterSafeProps(props: Record<string, any>, allowedAttrs: Set<string>) {
  // dangerous protocols
  const DANGEROUS_PROTOCOLS =
    /^(?:\s|&nbsp;|&#160;)*(?:javascript|vbscript|data(?!:(?:image|audio|video)))/i;

  // dangerous event properties (including various possible ways)
  const DANGEROUS_EVENTS =
    /^(?:\s|&nbsp;|&#160;)*(?:on|formaction|data-|\[\[|\{\{|xlink:|href|src|action)/i;

  // 可疑内容模式
  const SUSPICIOUS_CONTENT = {
    javascript: /javascript:/i,
    alert: /alert\s*\(/i,
    eval: /eval\s*\(/i,
    function: /Function\s*\(/i,
    executable: /[\(\)\[\]\{\}]/
  };

  // complete decode function
  function fullDecode(input: string): string {
    if (!input) return '';

    let result = input;
    let lastResult = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5; // 防止无限循环

    // continue decoding until no more decoding can be done or max iterations reached
    while (result !== lastResult && iterations < MAX_ITERATIONS) {
      lastResult = result;
      iterations++;
      try {
        // HTML entity decode
        result = result.replace(/&(#?[\w\d]+);/g, (_, entity) => {
          try {
            const txt = document.createElement('textarea');
            txt.innerHTML = `&${entity};`;
            return txt.value;
          } catch {
            return '';
          }
        });

        // Unicode decode (\u0061 format)
        result = result.replace(/(?:\\|%5C|%5c)u([0-9a-f]{4})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // URL encode decode
        result = result.replace(/%([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // octal decode
        result = result.replace(/\\([0-7]{3})/gi, (_, oct) =>
          String.fromCharCode(parseInt(oct, 8))
        );

        // hexadecimal decode (\x61 format)
        result = result.replace(/(?:\\|%5C|%5c)x([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // handle whitespace and comments
        result = result.replace(/(?:\s|\/\*.*?\*\/|<!--.*?-->)+/g, '');
      } catch {
        break;
      }
    }

    return result.toLowerCase();
  }

  // check if it contains dangerous content
  function containsDangerousContent(value: string): boolean {
    if (!value) return false;

    const decoded = fullDecode(value);

    return (
      // check dangerous protocol
      DANGEROUS_PROTOCOLS.test(decoded) ||
      // check dangerous event
      DANGEROUS_EVENTS.test(decoded) ||
      // check inline event
      /on\w+\s*=/.test(decoded) ||
      // check javascript: link
      SUSPICIOUS_CONTENT.javascript.test(decoded) ||
      // check alert
      SUSPICIOUS_CONTENT.alert.test(decoded) ||
      // check eval
      SUSPICIOUS_CONTENT.eval.test(decoded) ||
      // check Function constructor
      SUSPICIOUS_CONTENT.function.test(decoded) ||
      // check other possible injections
      /<\w+/i.test(decoded) ||
      /\(\s*\)/i.test(decoded) ||
      /\[\s*\]/i.test(decoded) ||
      /\{\s*\}/i.test(decoded)
    );
  }

  // filter props
  const filteredProps = { ...props };

  // 1. filter out all properties not in the whitelist
  Object.keys(filteredProps).forEach((key) => {
    // properties not in the whitelist are deleted directly
    if (!allowedAttrs.has(key)) {
      delete filteredProps[key];
      return;
    }

    // check if the property name has danger
    const keyLower = key.toLowerCase();
    const decodedKey = fullDecode(key);

    // 过滤所有事件处理属性 (on开头)，不再保留onClick
    if (keyLower.startsWith('on')) {
      delete filteredProps[key];
      return;
    }

    // 危险的事件属性
    if (DANGEROUS_EVENTS.test(decodedKey)) {
      delete filteredProps[key];
      return;
    }

    // 检查属性值
    const value = filteredProps[key];

    // 字符串类型值检查
    if (typeof value === 'string') {
      if (containsDangerousContent(value)) {
        delete filteredProps[key];
        return;
      }
    }
    // 对象类型值检查
    else if (typeof value === 'object' && value !== null) {
      // 只允许style对象
      if (key !== 'style') {
        delete filteredProps[key];
        return;
      }

      // 检查style对象的所有值
      const styleProps = { ...value };
      let hasDangerousStyle = false;

      Object.keys(styleProps).forEach((styleKey) => {
        const styleValue = String(styleProps[styleKey]);
        if (containsDangerousContent(styleValue)) {
          hasDangerousStyle = true;
        }
      });

      if (hasDangerousStyle) {
        delete filteredProps[key];
        return;
      }
    }
  });

  return filteredProps;
}
