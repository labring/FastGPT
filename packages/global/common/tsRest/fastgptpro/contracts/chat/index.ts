import { settingProContract } from './setting';
import { c } from '../../../init';

export const chatProContract = c.router({
  setting: settingProContract
});
