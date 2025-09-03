import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { InputTypeEnum } from './constant';
import type { UseFormReturn } from 'react-hook-form';
import type { BoxProps } from '@chakra-ui/react';
import type { EditorProps } from '@fastgpt/web/components/common/Textarea/PromptEditor/Editor';

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
    } & {
      ExtensionPopover?: EditorProps['ExtensionPopover'];
    })
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
      // JSONEditor
      inputType: InputTypeEnum.JSONEditor;
    }
  | {
      // selectLLMModel
      inputType: InputTypeEnum.selectLLMModel;
      modelList?: { model: string; name: string }[];
    }
  | {
      // fileSelect
      inputType: InputTypeEnum.fileSelect;
      canSelectFile?: boolean;
      canSelectImg?: boolean;
      maxFiles?: number;
      setUploading?: React.Dispatch<React.SetStateAction<boolean>>;

      form?: UseFormReturn<any>;
      fieldName?: string;
    };

export type InputRenderProps = CommonRenderProps & SpecificProps;
