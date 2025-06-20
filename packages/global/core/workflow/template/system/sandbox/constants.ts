export const JS_TEMPLATE = `function main({data1, data2}){
    
  return {
      result: data1,
      data2
  }
}`;

export const PY_TEMPLATE = `def main(data1, data2):
    return {
        "result": data1,
        "data2": data2
    }
`;

export enum SandboxCodeTypeEnum {
  js = 'js',
  py = 'py'
}
export const SANDBOX_CODE_TEMPLATE = {
  [SandboxCodeTypeEnum.js]: JS_TEMPLATE,
  [SandboxCodeTypeEnum.py]: PY_TEMPLATE
};
