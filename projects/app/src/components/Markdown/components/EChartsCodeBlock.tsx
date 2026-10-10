import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useContext
} from 'react';
import type { ECharts } from 'echarts';
import { Box, HStack, IconButton, Skeleton } from '@chakra-ui/react';
import json5 from 'json5';
import { useMount } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useScreen } from '@fastgpt/web/hooks/useScreen';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { MarkdownRendererRuntimeContext } from '../utils/runtimeContext';
import CodeBlockErrorCard from './CodeBlockErrorCard';

const EChartsCodeBlock = ({ code }: { code: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { showAnimation } = useContext(MarkdownRendererRuntimeContext);
  const chartRef = useRef<HTMLDivElement>(null);
  const eChart = useRef<ECharts>();
  const { isPc } = useSystem();
  const [width, setWidth] = useState(400);

  const findMarkdownDom = useCallback(() => {
    if (!chartRef.current) return;

    // 一直找到 parent = markdown 的元素
    let parent = chartRef.current?.parentElement;
    while (parent && !parent.className.includes('chat-box-card')) {
      parent = parent.parentElement;
    }

    const ChatItemDom = parent?.parentElement;
    const clientWidth = ChatItemDom?.clientWidth ? ChatItemDom.clientWidth - (isPc ? 90 : 60) : 500;
    setWidth(clientWidth);
    return parent?.parentElement;
  }, [isPc]);

  useMount(() => {
    // @ts-ignore
    import('echarts-gl');
  });

  const parsedOption = useMemo(() => {
    const trimmed = (code || '').trim();
    // 快速边界检查：在大模型流式打字输出期间，如果首尾大括号尚未闭合，直接视为未就绪，避免抛出 JSON5 语法错误
    if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }

    try {
      const userOption = json5.parse(trimmed);
      if (!userOption || typeof userOption !== 'object') {
        return null;
      }
      // 关闭 ECharts 内部自带的 toolbox 工具栏，由外部统一 Chakra UI 操作栏接管
      return {
        ...userOption,
        toolbox: {
          show: false
        }
      };
    } catch {
      // 流式输出期间中间语法不完整属于正常现象，静默返回 null 进入占位态，避免触发控制台或 Dev Overlay 报错
      return null;
    }
  }, [code]);

  useLayoutEffect(() => {
    if (!parsedOption || !chartRef.current) return;

    try {
      import('echarts').then((module) => {
        if (!chartRef.current) return;
        eChart.current = module.init(chartRef.current);
        eChart.current.setOption(parsedOption);
      });
    } catch {
      // 图表内部渲染异常静默处理
    }

    findMarkdownDom();

    return () => {
      if (eChart.current) {
        eChart.current.dispose();
      }
    };
  }, [parsedOption, findMarkdownDom]);

  const { screenWidth } = useScreen();
  useEffect(() => {
    findMarkdownDom();
  }, [screenWidth, findMarkdownDom]);

  useEffect(() => {
    eChart.current?.resize();
  }, [width]);

  // 复制图表配置 JSON
  const handleCopyCode = useCallback(() => {
    copyData(code);
  }, [code, copyData]);

  // 导出 2 倍高清 PNG 图片并自动下载
  const handleExportPng = useCallback(() => {
    if (!eChart.current) return;

    try {
      const dataUrl = eChart.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff'
      });

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `echarts-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // 导出异常处理
    }
  }, []);

  // 1. 流式打字生成中且图表未闭合就绪：骨架屏完全拉满卡片，静默防抖，杜绝红框报错和尺寸抖动
  if (showAnimation && !parsedOption) {
    return (
      <Box
        my={3}
        h={'400px'}
        w={'100%'}
        borderRadius={'md'}
        overflow={'hidden'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        bg={'white'}
      >
        <Skeleton isLoaded={false} h={'100%'} w={'100%'} borderRadius={'md'} />
      </Box>
    );
  }

  // 2. 流式已结束且配置 JSON 依然存在语法错误：展示统一错误卡片（此时无下载图片，仅提供复制代码按钮）
  if (!showAnimation && !parsedOption) {
    return <CodeBlockErrorCard title={t('common:echarts_syntax_error')} code={code} />;
  }

  // 3. 正常完成态：展示图表与全功能悬浮操作栏
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
        '.echarts-action-bar': {
          opacity: 1,
          pointerEvents: 'auto'
        }
      }}
    >
      {/* 悬浮操作栏 */}
      <HStack
        className="echarts-action-bar"
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
        <MyTooltip label={t('common:download_image')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="image" w={'14px'} h={'14px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleExportPng}
            aria-label={t('common:download_image')}
          />
        </MyTooltip>
      </HStack>

      <Box overflowX={'auto'} p={2}>
        <Box h={'400px'} w={`${width}px`} ref={chartRef} />
      </Box>
    </Box>
  );
};

export default React.memo(EChartsCodeBlock);
