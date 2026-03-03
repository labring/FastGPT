export type TracksQueueType = {
  event: TrackEnum;
  data: Record<string, any>;
};

declare global {
  var countTrackQueue:
    | Map<
        string,
        {
          event: TrackEnum;
          count: number;
          data: Record<string, any>;
        }
      >
    | undefined;
}
