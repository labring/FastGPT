type JsonSchemaType = {
  type: string;
  properties: {
    [key: string]: JsonSchemaType;
  };
  required?: string[];
};

// export function ToolIO2FlowNodeIO({ input, output }: { input:; output: string }): {
//   inputs: FlowNodeInputItemType[];
//   outputs: FlowNodeOutputItemType[];
// } {
//   const inputSchema: JsonSchemaType = JSON.parse(input || '{}');
//   const inputItems = Object.keys(inputSchema.properties);
//   const outputSchema: JsonSchemaType = JSON.parse(output || '{}');
//   const outputItems = Object.keys(outputSchema);
//   return {
//     inputs: [
//       Input_Template_Stream_MODE,
//       ...inputItems.map((item: string) => {
//         const input = inputSchema.properties[item];
//         return {
//           key: item,
//           renderTypeList: (() => {
//             switch (input.type) {
//               case 'string':
//                 return [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference];
//               case 'number':
//                 return [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference];
//               case 'boolean':
//                 return [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference];
//               default:
//                 return [FlowNodeInputTypeEnum.reference];
//             }
//           })(),
//           label: item
//         };
//       })
//     ],
//     outputs: [
//       ...outputItems.map((item: string) => {
//         const output = outputSchema.properties[item];
//         return {
//           id: item,
//           type: FlowNodeOutputTypeEnum.static,
//           key: item,
//           renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
//           label: item
//         };
//       })
//     ]
//   };
// }
