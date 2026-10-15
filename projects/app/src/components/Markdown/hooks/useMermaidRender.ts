import { useEffect, useId, useRef, useState } from 'react';
import type { Mermaid } from 'mermaid';

const punctuationMap: Record<string, string> = {
  '，': ',',
  '；': ';',
  '。': '.',
  '：': ':',
  '！': '!',
  '？': '?',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '【': '[',
  '】': ']',
  '（': '(',
  '）': ')',
  '《': '<',
  '》': '>',
  '、': ','
};
const punctuationPattern = new RegExp(`[${Object.keys(punctuationMap).join('')}]`, 'g');

/**
 * 按需加载 Mermaid 并渲染代码，兼容模型输出的全角标点。
 * 流式更新防抖 200ms，半截语法失败时保留最近一次成功图表；结束后立即渲染并报告错误。
 * 每次更新和卸载都会使旧请求失效，避免较慢的旧图覆盖新图。
 */
export const useMermaidRender = (code: string, isStreaming = false) => {
  const instanceId = useId().replace(/:/g, '');
  const renderSequenceRef = useRef(0);
  const [mermaid, setMermaid] = useState<Mermaid>();
  const [svg, setSvg] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 清空输入时同步重置图表，避免新一轮流式输出沿用上次结果。
  if (!code.trim() && (svg || hasError)) {
    setSvg('');
    setHasError(false);
  }

  useEffect(() => {
    let mounted = true;

    import('mermaid')
      .then(({ default: mermaidInstance }) => {
        if (!mounted) return;

        mermaidInstance.mermaidAPI.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: 'base',
          flowchart: {
            useMaxWidth: false
          },
          themeVariables: {
            fontSize: '14px',
            primaryColor: '#d6e8ff',
            primaryTextColor: '#485058',
            primaryBorderColor: '#fff',
            lineColor: '#5A646E',
            secondaryColor: '#B5E9E5',
            tertiaryColor: '#485058'
          }
        });

        setMermaid(mermaidInstance);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;

        console.error('Failed to load mermaid:', error);
        setHasError(true);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!code.trim() || !mermaid) return;

    let mounted = true;
    const render = async () => {
      try {
        const formattedCode = code.replace(punctuationPattern, (match) => punctuationMap[match]);
        const { svg } = await mermaid.render(
          `mermaid-${instanceId}-${++renderSequenceRef.current}`,
          formattedCode
        );
        if (!mounted) return;

        setSvg(svg);
        setHasError(false);
      } catch {
        // 流式阶段语法尚未闭合是正常过程，不清空旧图，也不显示错误。
        if (mounted && !isStreaming) setHasError(true);
      }
    };

    const timer = isStreaming ? setTimeout(render, 200) : undefined;
    if (!isStreaming) void render();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [code, instanceId, isStreaming, mermaid]);

  return { svg, isLoading, hasError: hasError && !isStreaming };
};
