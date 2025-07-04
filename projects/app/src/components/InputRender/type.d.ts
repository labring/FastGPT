import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { InputTypeEnum } from './constant';
import type { UseFormReturn } from 'react-hook-form';

type BaseInputRenderProps = {
  value: any;
  onChange: (value: any) => void;

  isDisabled?: boolean;
  isInvalid?: boolean;
  placeholder?: string;

  customRender?: (props: any) => React.ReactNode;
};

// 按 inputType 分类的特定属性
type InputSpecificProps =
  | {
      // input & textarea 类型
      inputType: InputTypeEnum.input | InputTypeEnum.textarea;
      variables?: EditorVariablePickerType[];
      variableLabels?: EditorVariableLabelPickerType[];
      title?: string;
      maxLength?: number;
    }
  | {
      // numberInput 类型
      inputType: InputTypeEnum.numberInput;
      min?: number;
      max?: number;
    }
  | {
      // switch 类型
      inputType: InputTypeEnum.switch;
      // switch 只需要基础属性
    }
  | {
      // select & multipleSelect 类型
      inputType: InputTypeEnum.select | InputTypeEnum.multipleSelect;
      list?: { label: string; value: string }[];
    }
  | {
      // JSONEditor 类型
      inputType: InputTypeEnum.JSONEditor;
      // JSONEditor 只需要基础属性
    }
  | {
      // selectLLMModel 类型
      inputType: InputTypeEnum.selectLLMModel;
      modelList?: { model: string; name: string }[];
    }
  | {
      // fileSelect 类型
      inputType: InputTypeEnum.fileSelect;
      canSelectFile?: boolean;
      canSelectImg?: boolean;
      maxFiles?: number;
      setUploading?: React.Dispatch<React.SetStateAction<boolean>>;

      form?: UseFormReturn<any>;
      fieldName?: string;
    };

export type InputRenderProps = BaseInputRenderProps & InputSpecificProps;
