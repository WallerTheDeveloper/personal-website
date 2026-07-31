// Entry point.
//
// This is a deferred module at the end of <body>, so the whole DOM contract
// already exists by the time it runs — no DOMContentLoaded wrapper needed for
// the mount-time work below.
//
// PORT_PLAN.md step 6 adds the router here: boot() on DOMContentLoaded, dispose
// on pagehide. Two seams are waiting for it —
//   - applyTitle(current) from commit()
//   - trackView(current)  from commit(), and trackView(null) from boot() for
//     the hub. Neither goes in a click handler.

import { initAnalytics } from './analytics';
import { applyHead } from './head';

applyHead();
initAnalytics();
