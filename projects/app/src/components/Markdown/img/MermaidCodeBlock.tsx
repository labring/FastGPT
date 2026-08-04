import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Flex, IconButton, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { MyPhotoSlider } from '@fastgpt/web/components/common/Image/PhotoView';
import { useTranslation } from 'next-i18next';

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

type MermaidPreview = {
  key: string;
  markup: string;
  width: number;
  height: number;
  initialScale: number;
};

const MermaidBlock = ({ code }: { code: string }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [mermaid, setMermaid] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [preview, setPreview] = useState<MermaidPreview>();
  const { isOpen, onOpen, onClose } = useDisclosure();

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

  const onOpenPreview = useCallback(() => {
    const svgElement = ref.current?.querySelector('svg');
    if (!svgElement) return;

    // 放大层直接渲染 SVG DOM，保持 foreignObject 内文字与行内 Mermaid 的布局一致。
    const previewSvg = svgElement.cloneNode(true) as SVGSVGElement;
    const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = previewSvg
      .getAttribute('viewBox')!
      .split(/\s+/);
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', viewBoxX);
    background.setAttribute('y', viewBoxY);
    background.setAttribute('width', viewBoxWidth);
    background.setAttribute('height', viewBoxHeight);
    background.setAttribute('fill', '#fff');
    previewSvg.insertBefore(background, previewSvg.firstChild);
    previewSvg.setAttribute('width', '100%');
    previewSvg.setAttribute('height', '100%');
    previewSvg.style.display = 'block';
    const { width, height } = svgElement.getBoundingClientRect();
    const fitScale = Math.min(1, window.innerWidth / width, window.innerHeight / height);
    setPreview({
      key: previewSvg.id,
      markup: previewSvg.outerHTML,
      width,
      height,
      initialScale: Math.max(1, 1 / fitScale)
    });
    onOpen();
  }, [onOpen]);

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
    <>
      <Box position={'relative'}>
        {!isOpen && (
          <Box
            overflowX={'auto'}
            ref={ref}
            minW={'100px'}
            minH={'50px'}
            py={4}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <Flex
          position={'absolute'}
          top={1}
          right={1}
          gap={1}
          p={1}
          bg={'white'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          boxShadow={'1'}
        >
          <MyTooltip label={t('common:FullScreenLight')}>
            <IconButton
              aria-label={t('common:FullScreenLight')}
              icon={<MyIcon name={'fullScreen'} w={'16px'} />}
              size={'xs'}
              variant={'ghost'}
              isDisabled={!svg}
              onClick={onOpenPreview}
            />
          </MyTooltip>
          <MyTooltip label={t('common:Export')}>
            <IconButton
              aria-label={t('common:Export')}
              icon={<MyIcon name={'export'} w={'16px'} />}
              size={'xs'}
              variant={'ghost'}
              isDisabled={!svg}
              onClick={onclickExport}
            />
          </MyTooltip>
        </Flex>
      </Box>

      <MyPhotoSlider
        visible={isOpen}
        onClose={onClose}
        imageKey={preview?.key}
        width={preview?.width}
        height={preview?.height}
        initialScale={preview?.initialScale}
        render={
          preview
            ? ({ attrs }) => <div {...attrs} dangerouslySetInnerHTML={{ __html: preview.markup }} />
            : undefined
        }
      />
    </>
  );
};

export default MermaidBlock;
