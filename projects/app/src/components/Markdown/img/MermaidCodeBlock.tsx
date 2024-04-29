import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
import mermaid from 'mermaid';
import MyIcon from '@fastgpt/web/components/common/Icon';

const mermaidAPI = mermaid.mermaidAPI;
mermaidAPI.initialize({
  startOnLoad: true,
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

const MermaidBlock = ({ code }: { code: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    (async () => {
      if (!code) return;
      try {
        const formatCode = code.replace(
          new RegExp(`[${Object.keys(punctuationMap).join('')}]`, 'g'),
          (match) => punctuationMap[match]
        );
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, formatCode);
        setSvg(svg);
      } catch (e: any) {
        // console.log('[Mermaid] ', e?.message);
      }
    })();
  }, [code]);

  const onclickExport = useCallback(() => {
    const svg = ref.current?.children[0];
    if (!svg) return;

    const rate = svg.clientHeight / svg.clientWidth;
    const w = 3000;
    const h = rate * w;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 绘制白色背景
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ref.current?.innerHTML)}`;

    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 1);
      const a = document.createElement('a');
      a.href = jpgDataUrl;
      a.download = 'mermaid.jpg';
      document.body.appendChild(a);
      a.click();
      document.body?.removeChild(a);
    };
    img.onerror = (e) => {
      console.log(e);
    };
  }, []);

  return (
    <Box
      position={'relative'}
      _hover={{
        '& > .export': {
          display: 'block'
        }
      }}
    >
      <Box
        overflowX={'auto'}
        ref={ref}
        minW={'100px'}
        minH={'50px'}
        py={4}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <MyIcon
        className="export"
        display={'none'}
        name={'export'}
        w={'20px'}
        position={'absolute'}
        color={'myGray.600'}
        _hover={{
          color: 'primary.600'
        }}
        right={0}
        top={0}
        cursor={'pointer'}
        onClick={onclickExport}
      />
    </Box>
  );
};

export default MermaidBlock;
