import { settingContract } from './setting';
import { c } from '../../../init';

export const chatContract = c.router({
  setting: settingContract
});
