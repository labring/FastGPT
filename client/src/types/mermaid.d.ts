declare module "mermaid" {
    import mermaidAPI from "mermaid";
    const mermaid: any;
    export default mermaid;
  
    // 扩展 mermaidAPI
    interface MermaidAPI extends mermaidAPI.mermaidAPI {
      contentLoaded: (
        targetEl: Element,
        options?: mermaidAPI.mermaidAPI.Config
      ) => void;
    }
  
    const mermaidAPIInstance: MermaidAPI;
    export default mermaidAPIInstance;
  }
type Dispatch = (action: Action) => void;

  