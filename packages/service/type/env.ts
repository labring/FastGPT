declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
}

export {};
