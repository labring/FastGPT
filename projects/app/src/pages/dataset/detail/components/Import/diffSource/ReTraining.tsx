import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Flex,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { TrainingModeEnum, TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import Preview from '../components/Preview';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext, type ImportFormType } from '../Context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRouter } from 'next/router';
import { TabEnum } from '../../NavBar';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import dynamic from 'next/dynamic';
import DataProcess from '../commonProgress/DataProcess';

const Upload = dynamic(() => import('../commonProgress/Upload'));

const ReTraining = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <DataProcess showPreviewChunks={true} />}
      {activeStep === 1 && <Upload />}
    </>
  );
};

export default React.memo(ReTraining);
