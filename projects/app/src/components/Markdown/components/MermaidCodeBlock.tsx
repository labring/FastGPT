import React, { useEffect, useCallback, useState, useMemo, useContext } from 'react';
import { Box, HStack, IconButton, Spinner, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPhotoView, { MyPhotoSlider } from '@fastgpt/web/components/common/Image/PhotoView';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { MarkdownRendererRuntimeContext } from '../utils/runtimeContext';
import CodeBlockErrorCard from './CodeBlockErrorCard';

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
 * 1. 流式输出防抖与静默：打字流式阶段半截未闭合语法不显示红色错误框，已有有效图则保持展示，无图展示就绪占位；
 * 2. 结束态错误提示：仅在整句流式输出结束后依然报错时，才展示统一错误卡片（此时不显示下载与全屏）；
 * 3. 正常完成态：展示全功能悬浮操作栏（复制代码、导出 SVG、导出 PNG、全屏图片级缩放灯箱）。
 */
const MermaidBlock = ({ code }: { code: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { showAnimation } = useContext(MarkdownRendererRuntimeContext);
  const [svg, setSvg] = useState('');
  const [mermaid, setMermaid] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
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
        setHasError(false);
      } catch {
        // 流式打字期间半截语法解析失败属于正常过程态，静默处理，避免闪烁和红框抖动
        if (showAnimation) {
          return;
        }
        // 只有输出彻底结束后，如果依然有语法错误，才标记错误
        setHasError(true);
      }
    })();
  }, [code, isLoading, mermaid, showAnimation]);

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

  // 模块加载中
  if (isLoading) {
    return (
      <Box
        minW={'100px'}
        minH={'60px'}
        my={3}
        borderRadius={'md'}
        bg={'myGray.50'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
      >
        <HStack spacing={2} color={'myGray.500'}>
          <Spinner size={'xs'} color={'primary.500'} />
          <Text fontSize={'xs'}>{t('common:diagram_preparing')}</Text>
        </HStack>
      </Box>
    );
  }

  // 流式已结束且确实存在语法错误：复用统一错误卡片展示，不展示下载和全屏
  if (hasError && !showAnimation && !svg) {
    return <CodeBlockErrorCard title={t('common:mermaid_syntax_error')} code={code} />;
  }

  // 流式打字期间且尚未生成出首个完整 SVG：展示轻量就绪占位，杜绝红框报错和剧烈抖动
  if (showAnimation && !svg) {
    return (
      <Box
        minW={'100px'}
        minH={'60px'}
        my={3}
        borderRadius={'md'}
        bg={'myGray.50'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
      >
        <HStack spacing={2} color={'myGray.500'}>
          <Spinner size={'xs'} color={'primary.500'} />
          <Text fontSize={'xs'}>{t('common:diagram_preparing')}</Text>
        </HStack>
      </Box>
    );
  }

  // 正常完成态（或流式中已稳定生成 SVG）：展示图表与全功能操作栏
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
