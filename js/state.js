// App-wide mutable state shared by the views.
import { todayKey } from './util.js';

// Shown in the profile so it's easy to check the phone has the latest version.
export const APP_VERSION = '14 · 27/10/2026';

export const state = {
  profile: null,
  currentDate: todayKey(),
};
