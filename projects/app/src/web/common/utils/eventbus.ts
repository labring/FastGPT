export enum EventNameEnum {
  sendQuestion = 'sendQuestion',
  editQuestion = 'editQuestion'
}

export const eventBus = {
  list: new Map<EventNameEnum, Function>(),
  on: function (name: EventNameEnum, fn: Function) {
    this.list.set(name, fn);
  },
  emit: function (name: EventNameEnum, data: Record<string, any> = {}) {
    const fn = this.list.get(name);
    fn && fn(data);
  },
  off: function (name: EventNameEnum) {
    this.list.delete(name);
  }
};
