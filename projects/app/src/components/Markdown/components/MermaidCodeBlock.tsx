import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Box, HStack, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPhotoView, { MyPhotoSlider } from '@fastgpt/web/components/common/Image/PhotoView';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
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

/**
 * 处理 Mermaid SVG：
 * 1. 确保包含标准 xmlns 命名空间；
 * 2. 注入纯白背景矩形，避免大图预览、全屏灯箱暗黑遮罩或导出时呈现透明底色。
 */
const prepareMermaidSvgForView = (rawSvg: string) => {
  let processed = rawSvg.trim();
  if (!processed) return '';

  if (!processed.includes('xmlns=')) {
    processed = processed.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  if (!processed.includes('id="mermaid-bg-rect"')) {
    processed = processed.replace(
      /(<svg[^>]*>)/i,
      '$1<rect id="mermaid-bg-rect" width="100%" height="100%" fill="#ffffff"/>'
    );
  }

  return processed;
};

/**
 * 增强型 Mermaid 图表组件：
 * 1. 采用与 Markdown Image 统一的 MyPhotoView / MyPhotoSlider 进行图片级平滑放大、手势缩放和平移；
 * 2. 右上角悬浮操作栏：复制代码、导出 SVG 矢量图、导出高清图片、全屏大图预览；
 * 3. 彻底移除冗余的大型自定义 Modal，交互与视觉完全统一。
 */
const MermaidBlock = ({ code }: { code: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const [svg, setSvg] = useState('');
  const [mermaid, setMermaid] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [sliderVisible, setSliderVisible] = useState(false);

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
      .catch((err) => {
        console.error('Failed to load mermaid:', err);
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
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${Date.now()}`, formatCode);
        setSvg(renderedSvg);
        setError('');
      } catch (e: any) {
        console.log('[Mermaid] ', e?.message);
        setError(e?.message || 'Failed to render diagram');
      }
    })();
  }, [code, isLoading, mermaid]);

  // 将 SVG 包装为无损 Data URL
  const svgDataUrl = useMemo(() => {
    if (!svg) return '';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(prepareMermaidSvgForView(svg));
  }, [svg]);

  // 复制代码
  const handleCopyCode = useCallback(() => {
    copyData(code);
  }, [code, copyData]);

  // 导出 SVG 矢量图
  const handleExportSvg = useCallback(() => {
    if (!svg) return;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const blob = new Blob([prepareMermaidSvgForView(svg)], {
      type: 'image/svg+xml;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-${timestamp}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [svg]);

  // 导出 PNG 图片
  const handleExportPng = useCallback(() => {
    if (!svgDataUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = svgDataUrl;

    img.onload = () => {
      const w = Math.max(img.naturalWidth || img.width || 1200, 1200);
      const rate =
        (img.naturalHeight || img.height || 600) / (img.naturalWidth || img.width || 1200);
      const h = Math.max(rate * w, 400);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const pngDataUrl = canvas.toDataURL('image/png', 1);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      a.href = pngDataUrl;
      a.download = `mermaid-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }, [svgDataUrl]);

  if (isLoading) {
    return (
      <Box
        minW={'100px'}
        minH={'50px'}
        py={4}
        bg={'myGray.50'}
        borderRadius={'md'}
        textAlign={'center'}
        color={'myGray.500'}
        fontSize={'xs'}
      >
        Loading diagram...
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
      my={3}
      borderRadius={'md'}
      overflow={'hidden'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      bg={'white'}
      _hover={{
        '.mermaid-action-bar': {
          opacity: 1,
          pointerEvents: 'auto'
        }
      }}
    >
      {/* 右上角悬浮操作栏 */}
      <HStack
        className="mermaid-action-bar"
        spacing={1}
        position={'absolute'}
        top={2}
        right={2}
        zIndex={2}
        opacity={0}
        pointerEvents={'none'}
        transition={'opacity 0.2s'}
        bg={'rgba(255, 255, 255, 0.9)'}
        _dark={{
          bg: 'rgba(30, 36, 46, 0.9)'
        }}
        backdropFilter={'blur(4px)'}
        p={1}
        borderRadius={'md'}
        boxShadow={'0 1px 3px rgba(0, 0, 0, 0.1)'}
        border={'1px solid'}
        borderColor={'myGray.200'}
      >
        <MyTooltip label={t('common:Copy')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="copy" w={'13px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleCopyCode}
            aria-label={t('common:Copy')}
          />
        </MyTooltip>
        <MyTooltip label={t('common:download_svg')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="export" w={'13px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleExportSvg}
            aria-label={t('common:download_svg')}
          />
        </MyTooltip>
        <MyTooltip label={t('common:download_png')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="image" w={'14px'} h={'14px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleExportPng}
            aria-label={t('common:download_png')}
          />
        </MyTooltip>
        <MyTooltip label={t('common:view_fullscreen')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="fullScreen" w={'13px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={() => setSliderVisible(true)}
            aria-label={t('common:view_fullscreen')}
          />
        </MyTooltip>
      </HStack>

      {/* 原生图片组件渲染：点击即可直接触发图片级灯箱放大/滚轮缩放/手势拖拽平移 */}
      <Box p={4} display={'flex'} justifyContent={'center'} overflowX={'auto'}>
        <MyPhotoView
          src={svgDataUrl}
          alt={'Mermaid Diagram'}
          cursor={'pointer'}
          maxH={'600px'}
          objectFit={'contain'}
        />
      </Box>

      {/* 配合右上角全屏按钮呼起的全屏灯箱 */}
      <MyPhotoSlider
        src={svgDataUrl}
        visible={sliderVisible}
        onClose={() => setSliderVisible(false)}
      />
    </Box>
  );
};

export default React.memo(MermaidBlock);
