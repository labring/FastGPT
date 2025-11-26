import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { InputTypeEnum } from './constant';
import type { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { UseFormReturn } from 'react-hook-form';
import type { BoxProps } from '@chakra-ui/react';
import type { EditorProps } from '@fastgpt/web/components/common/Textarea/PromptEditor/Editor';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

type CommonRenderProps = {
  placeholder?: string;
  value: any;
  onChange: (value: any) => void;

  isDisabled?: boolean;
  isInvalid?: boolean;

  customRender?: (props: any) => React.ReactNode;
} & Omit<BoxProps, 'onChange' | 'list' | 'value'>;

type SpecificProps = {
  inputType: InputTypeEnum;

  // input & textarea
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  title?: string;
  maxLength?: number;
  isRichText?: boolean;
  ExtensionPopover?: EditorProps['ExtensionPopover'];

  // password
  minLength?: number;

  // numberInput
  min?: number;
  max?: number;

  // switch - no extra props

  // select & multipleSelect
  list?: { label: string; value: string }[];
  enums?: { value: string }[]; // old version

  // selectDataset
  datasetOptions?: SelectedDatasetType[];

  // JSONEditor - no extra props

  // selectLLMModel
  modelList?: { model: string; name: string }[];

  // fileSelect
  form?: UseFormReturn<any>;
  fieldName?: string;
  canLocalUpload?: boolean;
  canUrlUpload?: boolean;
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  canSelectVideo?: boolean;
  canSelectAudio?: boolean;
  canSelectCustomFileExtension?: boolean;
  customFileExtensionList?: string[];
  maxFiles?: number;

  // timePointSelect & timeRangeSelect
  timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
  timeRangeStart?: string;
  timeRangeEnd?: string;
  defaultValue?: string | [string?, string?];
};

export type InputRenderProps = CommonRenderProps & SpecificProps;
