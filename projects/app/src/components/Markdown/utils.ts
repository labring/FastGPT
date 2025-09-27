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
  // 处理 Windows 文件路径中的反斜杠，防止被 Markdown 转义：C:\path\file 或 c:\path\file
  text = text.replace(/([A-Za-z]:\\[^\s`\[\]()]*)/g, (match) => {
    return match.replace(/\\/g, '\\\\');
  });

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
    // 处理 格式引用，将 [675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](CITE)
    .replace(/\[([a-f0-9]{24})\](?!\()/g, '[$1](CITE)');
  // 将 "http://localhost:3000[675934a198f46329dfc6d05a](CITE)" -> "http://localhost:3000 [675934a198f46329dfc6d05a](CITE)"
  text = text.replace(
    /(https?:\/\/[^\s，。！？；：、\[\]]+?)(?=\[([a-f0-9]{24})\]\(CITE\))/g,
    '$1 '
  );

  // 处理链接后的中文标点符号，增加空格
  text = text.replace(/(https?:\/\/[^\s，。！？；：、]+)([，。！？；：、])/g, '$1 $2');

  return text;
};
