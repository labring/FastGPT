import { Box } from '@chakra-ui/react';
import React, { useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import AIResponseBox from '../../../../components/AIResponseBox';
import RenderProcessingCollapse from '../../../../components/AIResponseBox/RenderProcessingCollapse';
import RenderProcessingPreview, {
  getProcessingPreviewLabel,
  getProcessingPreviewTarget,
  type ProcessingPreviewTarget
} from '../../../../components/AIResponseBox/RenderProcessingPreview';
import type { AIChatBubbleContentProps, IndexedAIChatValue } from './type';

/**
 * 展示一组连续的思考与工具调用，分组和运行状态由上层决定。
 * 点击运行预览时展开对应详情；正文、交互及版本卡片由各场景的内容组件单独展示。
 */
const ProcessingGroup = ({
  items,
  isProcessing,
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  allowedCitationIds,
  onOpenCiteModal
}: AIChatBubbleContentProps & {
  items: IndexedAIChatValue[];
  isProcessing: boolean;
}) => {
  const { t } = useSafeTranslation();
  const [expandedPreview, setExpandedPreview] = useState<{
    valueIndex: number;
    target: ProcessingPreviewTarget;
  }>();
  const previewItem = items.at(-1);
  if (!previewItem) return null;

  const previewTarget = getProcessingPreviewTarget(previewItem.value);

  return (
    <Box>
      <RenderProcessingCollapse
        isProcessing={isProcessing}
        label={getProcessingPreviewLabel(previewItem.value, t)}
        preview={<RenderProcessingPreview value={previewItem.value} showAnimation={isProcessing} />}
        onPreviewOpen={
          previewTarget
            ? () => setExpandedPreview({ valueIndex: previewItem.index, target: previewTarget })
            : undefined
        }
      >
        {items.map(({ value, index }) => (
          <Box key={`${dataId}-ai-${index}`}>
            <AIResponseBox
              chatItemDataId={dataId}
              value={value}
              responseData={responseData}
              isLastResponseValue={isLastChild && index === chatValue.length - 1}
              isLastChild={isLastChild}
              isChatting={isChatting}
              onOpenCiteModal={onOpenCiteModal}
              allowedCitationIds={allowedCitationIds}
              wrapProcessing={false}
              showAnswer={false}
              showInteractive={false}
              showWorkflowBuilderVersion={false}
              showStandaloneProcessing={false}
              defaultExpandProcessing={false}
              defaultExpandedProcessingTarget={
                expandedPreview?.valueIndex === index ? expandedPreview.target : undefined
              }
            />
          </Box>
        ))}
      </RenderProcessingCollapse>
    </Box>
  );
};

export default React.memo(ProcessingGroup);
