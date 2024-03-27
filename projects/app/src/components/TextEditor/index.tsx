import React, { forwardRef, useState } from 'react';
import { createReactEditorJS } from 'react-editor-js';
import { EDITOR_JS_TOOLS } from '@/constants/editorSetting';
import { UseFormRegister } from 'react-hook-form';

const EditorFormInput = (register: any, setValue: any, ref: React.Ref<unknown> | undefined) => {
  const ReactEditorJS = createReactEditorJS();
  const [outputData, setOutputData] = useState(null);
  const editorInstance = React.useRef(null);
  const handleInitialize = React.useCallback((instance: any) => {
    editorInstance.current = instance;
  }, []);
  return (
    <>
      <ReactEditorJS
        tools={EDITOR_JS_TOOLS}
        onChange={async () => {
          if (editorInstance.current) {
            const savedData = await editorInstance.current.save();
            setOutputData(savedData);
            console.log('Editor.js 保存的数据：', savedData);

            const { onChange, name, value, validate } = register;

            setValue(savedData);
            // 这里可以进一步以保存数据或执行其他操作
          }
        }}
        onInitialize={handleInitialize}
      />
    </>
  );
};

export default forwardRef(EditorFormInput);
