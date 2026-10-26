// App-wide mutable state shared by the views.
import { todayKey } from './util.js';

export const state = {
  profile: null,
  currentDate: todayKey(),
};
