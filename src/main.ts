// Entry point.
//
// This is a deferred module at the end of <body>, so the whole DOM contract
// already exists by the time it runs — no DOMContentLoaded wrapper needed for
// the mount-time work below.
//
// The router owns everything after this: it mounts on DOMContentLoaded, loads
// the engine dynamically (so a no-WebGL device never downloads three), and
// disposes on pagehide. It is also where `applyTitle(current)` and
// `trackView(current)` are called from — both from `commit()`, never from a
// click handler.

import { initAnalytics } from './analytics';
import { applyHead } from './head';
import { startRouter } from './router';

applyHead();
initAnalytics();
startRouter();
