import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

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
  const [mermaid, setMermaid] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    import('mermaid')
      .then((module) => {
        if (!mounted) return;

        const mermaidInstance = module.default;
        mermaidInstance.mermaidAPI.initialize({
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

        setMermaid(mermaidInstance);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load mermaid:', error);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!code || !mermaid || isLoading) return;

      try {
        const formatCode = code.replace(
          new RegExp(`[${Object.keys(punctuationMap).join('')}]`, 'g'),
          (match) => punctuationMap[match]
        );
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, formatCode);
        setSvg(svg);
      } catch (e: any) {
        console.log('[Mermaid] ', e?.message);
      }
    })();
  }, [code, isLoading, mermaid]);

  const onclickExport = useCallback(() => {
    const svgElement = ref.current?.children[0];
    if (!svgElement) return;

    const rate = svgElement.clientHeight / svgElement.clientWidth;
    const w = 3000;
    const h = rate * w;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const img = new Image();
    const innerHTML = ref.current?.innerHTML || '';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(innerHTML);

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

  if (isLoading) {
    return (
      <Box
        minW={'100px'}
        minH={'50px'}
        py={4}
        bg={'gray.50'}
        borderRadius={'md'}
        textAlign={'center'}
      >
        Loading...
      </Box>
    );
  }

  if (error) {
    return (
      <Box minW={'100px'} minH={'50px'} py={4} bg={'red.50'} borderRadius={'md'} p={3}>
        <Box color={'red.600'} fontSize={'sm'}>
          {error}
        </Box>
      </Box>
    );
  }

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
