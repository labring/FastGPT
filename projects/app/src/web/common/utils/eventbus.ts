export enum EventNameEnum {
  guideClick = 'guideClick',
  updaterNode = 'updaterNode'
}
type EventNameType = `${EventNameEnum}`;

export const eventBus = {
  list: new Map<EventNameType, Function>(),
  on: function (name: EventNameType, fn: Function) {
    this.list.set(name, fn);
  },
  emit: function (name: EventNameType, data: Record<string, any> = {}) {
    const fn = this.list.get(name);
    fn && fn(data);
  },
  off: function (name: EventNameType) {
    this.list.delete(name);
  }
};
