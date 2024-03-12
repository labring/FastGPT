export enum DispatchNodeResponseKeyEnum {
  nodeResponse = 'responseData', // run node response
  nodeDispatchUsages = 'nodeDispatchUsages', // the node bill.
  childrenResponses = 'childrenResponses', // Some nodes make recursive calls that need to be returned
  toolResponses = 'toolResponses', // The result is passed back to the tool node for use
  assistantResponses = 'assistantResponses' // assistant response
}
