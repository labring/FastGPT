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

type CommonRenderProps = {
  placeholder?: string;
  value: any;
  onChange: (value: any) => void;

  isDisabled?: boolean;
  isInvalid?: boolean;

  customRender?: (props: any) => React.ReactNode;
} & Omit<BoxProps, 'onChange' | 'list' | 'value'>;

type SpecificProps =
  | ({
      // input & textarea
      inputType: InputTypeEnum.input | InputTypeEnum.textarea;
      variables?: EditorVariablePickerType[];
      variableLabels?: EditorVariableLabelPickerType[];
      title?: string;
      maxLength?: number;
      isRichText?: boolean;
    } & {
      ExtensionPopover?: EditorProps['ExtensionPopover'];
    })
  | {
      // password
      inputType: InputTypeEnum.password;
      minLength?: number;
    }
  | {
      // numberInput
      inputType: InputTypeEnum.numberInput;
      min?: number;
      max?: number;
    }
  | {
      // switch
      inputType: InputTypeEnum.switch;
    }
  | {
      // select & multipleSelect
      inputType: InputTypeEnum.select | InputTypeEnum.multipleSelect;
      list?: { label: string; value: string }[];

      // old version
      enums?: { value: string }[];
    }
  | {
      // selectDataset
      inputType: InputTypeEnum.selectDataset;
      list?: { label: string; value: string }[];
      dataset?: { name: string; datasetId: string; avatar: string }[];
    }
  | {
      // JSONEditor
      inputType: InputTypeEnum.JSONEditor;
    }
  | {
      // selectLLMModel
      inputType: InputTypeEnum.selectLLMModel;
      modelList?: { model: string; name: string }[];
    }
  | ({
      // fileSelect
      inputType: InputTypeEnum.fileSelect;
      setUploading?: React.Dispatch<React.SetStateAction<boolean>>;
      form?: UseFormReturn<any>;
      fieldName?: string;
      canLocalUpload?: boolean;
      canUrlUpload?: boolean;
    } & AppFileSelectConfigType)
  | {
      // timePointSelect
      inputType: InputTypeEnum.timePointSelect;
      timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
      timeRangeStart?: string;
      timeRangeEnd?: string;
    }
  | {
      // timeRangeSelect
      inputType: InputTypeEnum.timeRangeSelect;
      timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
      timeRangeStart?: string;
      timeRangeEnd?: string;
    };

export type InputRenderProps = CommonRenderProps & SpecificProps;
