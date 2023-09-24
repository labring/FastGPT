const decoder = new TextDecoder();

export const parseStreamChunk = (value: BufferSource) => {
  const chunk = decoder.decode(value);
  const chunkLines = chunk.split('\n\n').filter((item) => item);
  const chunkResponse = chunkLines.map((item) => {
    const splitEvent = item.split('\n');
    if (splitEvent.length === 2) {
      return {
        event: splitEvent[0].replace('event: ', ''),
        data: splitEvent[1].replace('data: ', '')
      };
    }
    return {
      event: '',
      data: splitEvent[0].replace('data: ', '')
    };
  });

  return chunkResponse;
};

export class SSEParseData {
  storeReadData = '';
  storeEventName = '';

  parse(item: { event: string; data: string }) {
    if (item.data === '[DONE]') return { eventName: item.event, data: item.data };

    if (item.event) {
      this.storeEventName = item.event;
    }

    try {
      const formatData = this.storeReadData + item.data;
      const parseData = JSON.parse(formatData);
      const eventName = this.storeEventName;

      this.storeReadData = '';
      this.storeEventName = '';

      return {
        eventName,
        data: parseData
      };
    } catch (error) {
      if (typeof item.data === 'string' && !item.data.startsWith(': ping')) {
        this.storeReadData += item.data;
      } else {
        this.storeReadData = '';
      }
    }
    return {};
  }
}
