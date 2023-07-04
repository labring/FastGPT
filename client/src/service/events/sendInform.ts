export const startSendInform = async () => {
  if (global.sendInformQueue.length === 0 || global.sendInformQueueLen > 0) return;
  global.sendInformQueueLen++;

  try {
    const fn = global.sendInformQueue[global.sendInformQueue.length - 1];
    await fn();
    global.sendInformQueue.pop();
    global.sendInformQueueLen--;

    startSendInform();
  } catch (error) {
    global.sendInformQueueLen--;
    startSendInform();
  }
};
