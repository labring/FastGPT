declare global {
  var tiktokenWorkers: {
    index: number;
    worker: Worker;
    callbackMap: Record<string, (e: number) => void>;
  }[];
}
