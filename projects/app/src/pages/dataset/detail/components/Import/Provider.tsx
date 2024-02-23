import React, { useContext, useCallback, createContext, useState, useMemo, useEffect } from 'react';

import { formatModelPrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { Prompt_AgentQA } from '@/global/core/prompt/agent';
import { UseFormReturn, useForm } from 'react-hook-form';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import { ImportSourceItemType } from '@/web/core/dataset/type';

type ChunkSizeFieldType = 'embeddingChunkSize';
export type FormType = {
  mode: `${TrainingModeEnum}`;
  way: `${ImportProcessWayEnum}`;
  embeddingChunkSize: number;
  customSplitChar: string;
  qaPrompt: string;
  webSelector: string;
};

type useImportStoreType = {
  parentId?: string;
  processParamsForm: UseFormReturn<FormType, any>;
  chunkSizeField?: ChunkSizeFieldType;
  maxChunkSize: number;
  minChunkSize: number;
  showChunkInput: boolean;
  showPromptInput: boolean;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
  showRePreview: boolean;
  totalChunkChars: number;
  totalChunks: number;
  chunkSize: number;
  predictPrice: number;
  priceTip: string;
  uploadRate: number;
  splitSources2Chunks: () => void;
};
const StateContext = createContext<useImportStoreType>({
  processParamsForm: {} as any,
  sources: [],
  setSources: function (value: React.SetStateAction<ImportSourceItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  maxChunkSize: 0,
  minChunkSize: 0,
  showChunkInput: false,
  showPromptInput: false,
  chunkSizeField: 'embeddingChunkSize',
  showRePreview: false,
  totalChunkChars: 0,
  totalChunks: 0,
  chunkSize: 0,
  predictPrice: 0,
  priceTip: '',
  uploadRate: 50,
  splitSources2Chunks: () => {}
});

export const useImportStore = () => useContext(StateContext);

const Provider = ({
  dataset,
  parentId,
  children
}: {
  dataset: DatasetItemType;
  parentId?: string;
  children: React.ReactNode;
}) => {
  const vectorModel = dataset.vectorModel;
  const agentModel = dataset.agentModel;

  const processParamsForm = useForm<FormType>({
    defaultValues: {
      mode: TrainingModeEnum.chunk,
      way: ImportProcessWayEnum.auto,
      embeddingChunkSize: vectorModel?.defaultToken || 512,
      customSplitChar: '',
      qaPrompt: Prompt_AgentQA.description,
      webSelector: ''
    }
  });

  const { t } = useTranslation();
  const [sources, setSources] = useState<ImportSourceItemType[]>([]);
  const [showRePreview, setShowRePreview] = useState(false);

  // watch form
  const mode = processParamsForm.watch('mode');
  const way = processParamsForm.watch('way');
  const embeddingChunkSize = processParamsForm.watch('embeddingChunkSize');
  const customSplitChar = processParamsForm.watch('customSplitChar');

  const modeStaticParams = {
    [TrainingModeEnum.chunk]: {
      chunkSizeField: 'embeddingChunkSize' as ChunkSizeFieldType,
      chunkOverlapRatio: 0.2,
      maxChunkSize: vectorModel?.maxToken || 512,
      minChunkSize: 100,
      autoChunkSize: vectorModel?.defaultToken || 512,
      chunkSize: embeddingChunkSize,
      showChunkInput: true,
      showPromptInput: false,
      inputPrice: vectorModel.inputPrice,
      outputPrice: 0,
      priceTip: t('core.dataset.import.Embedding Estimated Price Tips', {
        price: vectorModel.inputPrice
      }),
      uploadRate: 150
    },
    [TrainingModeEnum.qa]: {
      chunkOverlapRatio: 0,
      maxChunkSize: 8000,
      minChunkSize: 3000,
      autoChunkSize: agentModel.maxContext * 0.55 || 6000,
      chunkSize: agentModel.maxContext * 0.55 || 6000,
      showChunkInput: false,
      showPromptInput: true,
      inputPrice: agentModel.inputPrice,
      outputPrice: agentModel.outputPrice,
      priceTip: t('core.dataset.import.QA Estimated Price Tips', {
        price: agentModel?.inputPrice
      }),
      uploadRate: 30
    }
  };
  const selectModelStaticParam = useMemo(() => modeStaticParams[mode], [mode]);

  const wayStaticPrams = {
    [ImportProcessWayEnum.auto]: {
      chunkSize: selectModelStaticParam.autoChunkSize,
      customSplitChar: ''
    },
    [ImportProcessWayEnum.custom]: {
      chunkSize: modeStaticParams[mode].chunkSize,
      customSplitChar
    }
  };

  const chunkSize = wayStaticPrams[way].chunkSize;

  useEffect(() => {
    setShowRePreview(true);
  }, [mode, way, chunkSize, customSplitChar]);

  const totalChunkChars = useMemo(
    () => sources.reduce((sum, file) => sum + file.chunkChars, 0),
    [sources]
  );
  const predictPrice = useMemo(() => {
    if (mode === TrainingModeEnum.qa) {
      const inputTotal = totalChunkChars * selectModelStaticParam.inputPrice;
      const outputTotal = totalChunkChars * 0.5 * selectModelStaticParam.inputPrice;

      return formatModelPrice2Read(inputTotal + outputTotal);
    }
    return formatModelPrice2Read(totalChunkChars * selectModelStaticParam.inputPrice);
  }, [mode, selectModelStaticParam.inputPrice, totalChunkChars]);
  const totalChunks = useMemo(
    () => sources.reduce((sum, file) => sum + file.chunks.length, 0),
    [sources]
  );

  const splitSources2Chunks = useCallback(() => {
    setSources((state) =>
      state.map((file) => {
        const { chunks, chars } = splitText2Chunks({
          text: file.rawText,
          chunkLen: chunkSize,
          overlapRatio: selectModelStaticParam.chunkOverlapRatio,
          customReg: customSplitChar ? [customSplitChar] : []
        });

        return {
          ...file,
          chunkChars: chars,
          chunks: chunks.map((chunk) => ({
            q: chunk,
            a: ''
          }))
        };
      })
    );
    setShowRePreview(false);
  }, [chunkSize, customSplitChar, selectModelStaticParam.chunkOverlapRatio]);

  const value = {
    parentId,
    processParamsForm,
    ...selectModelStaticParam,
    sources,
    setSources,
    showRePreview,
    totalChunkChars,
    totalChunks,
    chunkSize,
    predictPrice,
    splitSources2Chunks
  };
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
};

export default React.memo(Provider);
