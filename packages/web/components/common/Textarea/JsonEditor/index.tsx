import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import Editor, { type Monaco, loader, useMonaco } from '@monaco-editor/react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyIcon from '../../Icon';
import { useToast } from '../../../../hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getWebReqUrl } from '../../../../common/system/utils';
import {
  registerJsonEditorContext,
  registerJsonEditorLanguage,
  type EditorVariablePickerType
} from '../monacoLanguageRegistry';
import { registerWorkflowMonacoModel } from '../monacoModelRegistry';

loader.config({
  paths: { vs: getWebReqUrl('/js/monaco-editor.0.45.0/vs') }
});

type Props = Omit<BoxProps, 'resize' | 'onChange'> & {
  height?: number;
  resize?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (e: string) => void;
  variables?: EditorVariablePickerType[];
  defaultHeight?: number;
  path?: string;
  placeholder?: string;
  isDisabled?: boolean;
  readOnly?: boolean;
  isInvalid?: boolean;
  /** 提交入口统一展示校验错误时可关闭失焦提示，避免同一次提交产生重复 Toast。 */
  validateOnBlur?: boolean;
};

const options = {
  lineNumbers: 'off',
  guides: {
    indentation: false
  },
  automaticLayout: true,
  minimap: {
    enabled: false
  },
  scrollbar: {
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 8,
    alwaysConsumeMouseWheel: false
  },
  lineNumbersMinChars: 0,
  fontSize: 12,
  scrollBeyondLastLine: false,
  folding: false,
  overviewRulerBorder: false,
  tabSize: 2,
  padding: {
    top: 8,
    bottom: 8
  }
};

const JSONEditor = ({
  value,
  onChange,
  resize,
  variables = [],
  path,
  placeholder,
  defaultHeight = 100,
  isDisabled = false,
  readOnly = false,
  isInvalid = false,
  validateOnBlur = true,
  ...props
}: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [height, setHeight] = useState(defaultHeight);
  const [placeholderDisplay, setPlaceholderDisplay] = useState('block');
  const initialY = useRef(0);
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco || !path) return;
    const model = monaco.editor.getModel(monaco.Uri.parse(path));
    if (model) {
      registerJsonEditorContext(model, variables);
    }
  }, [monaco, path, variables]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      setHeight((prevHeight) => (prevHeight + deltaY < 100 ? 100 : prevHeight + deltaY));
      initialY.current = e.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const formatedValue = useMemo(() => {
    if (typeof value === 'string') {
      return value;
    }

    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }, [value]);

  const onBlur = useCallback(() => {
    if (!validateOnBlur || !formatedValue) return;
    // replace {{xx}} to true
    const replaceValue = formatedValue?.replace(/{{(.*?)}}/g, 'true');
    try {
      JSON.parse(replaceValue);
    } catch {
      toast({
        status: 'warning',
        title: t('common:json_parse_error')
      });
    }
  }, [formatedValue, toast, t, validateOnBlur]);

  const beforeMount = useCallback((monaco: Monaco) => {
    registerJsonEditorLanguage(monaco);

    // 定义自定义主题
    monaco.editor.defineTheme('JSONEditorTheme', {
      base: 'vs', // 可以基于已有的主题进行定制
      inherit: true, // 继承基础主题的设置
      rules: [{ token: 'variable', foreground: '2B5FD9' }],
      colors: {
        'editor.background': '#ffffff00',
        'editorLineNumber.foreground': '#aaa',
        'editorOverviewRuler.border': '#ffffff00',
        'editor.lineHighlightBackground': '#F7F8FA',
        'scrollbarSlider.background': '#E8EAEC',
        'editorIndentGuide.activeBackground': '#ddd',
        'editorIndentGuide.background': '#eee'
      }
    });
  }, []);

  return (
    <Box
      borderWidth={'1px'}
      borderRadius={'sm'}
      borderColor={isInvalid ? 'red.500' : 'myGray.200'}
      height={height}
      position={'relative'}
      transition={'border-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out'}
      _focusWithin={
        isInvalid
          ? {
              borderColor: 'red.500',
              boxShadow: '0px 0px 0px 2.4px rgba(244, 69, 46, 0.15)'
            }
          : {
              borderColor: 'primary.600',
              boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
              bg: 'white'
            }
      }
      {...props}
    >
      {resize && (
        <Box
          position={'absolute'}
          right={'-2'}
          bottom={'-3'}
          zIndex={10}
          cursor={'ns-resize'}
          px={'4px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'16px'} height={'16px'} />
        </Box>
      )}
      <Editor
        height={'100%'}
        defaultLanguage="json"
        options={{ ...options, readOnly } as any}
        theme="JSONEditorTheme"
        beforeMount={beforeMount}
        path={path}
        keepCurrentModel={Boolean(path)}
        saveViewState={path ? true : undefined}
        value={formatedValue}
        onChange={(e) => {
          onChange?.(e || '');
          if (!e) {
            setPlaceholderDisplay('block');
          } else {
            setPlaceholderDisplay('none');
          }
        }}
        wrapperProps={{
          onBlur
        }}
        onMount={(editor) => {
          if (path) {
            const model = editor.getModel();
            if (model) {
              registerWorkflowMonacoModel(model);
              registerJsonEditorContext(model, variables);
            }
          }

          if (!value) {
            setPlaceholderDisplay('block');
          } else {
            setPlaceholderDisplay('none');
          }

          // Prevent browser autofill from causing getModifierState errors
          const editorDom = editor.getDomNode();
          if (editorDom) {
            const textarea = editorDom.querySelector('textarea');
            if (textarea) {
              textarea.setAttribute('autocomplete', 'off');
              textarea.setAttribute('autocorrect', 'off');
              textarea.setAttribute('autocapitalize', 'off');
              textarea.setAttribute('spellcheck', 'false');
            }
          }
        }}
      />
      <Box
        className="monaco-placeholder"
        position={'absolute'}
        top={2}
        left={4}
        fontSize={'xs'}
        color={'myGray.500'}
        display={placeholderDisplay}
        whiteSpace={'pre-wrap'}
        pointerEvents={'none'}
        userSelect={'none'}
      >
        {placeholder}
      </Box>
      {isDisabled && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="rgba(255, 255, 255, 0.4)"
          borderRadius="sm"
          zIndex={1}
          cursor="not-allowed"
        />
      )}
    </Box>
  );
};

export default React.memo(JSONEditor);
