import { useEffect, useRef } from "react";

// Real-time sync without a socket. The API runs as a Netlify function, which
// cannot hold a WebSocket or an SSE stream open, so "live" here is built from
// the three things a browser can actually do on its own:
//
//   1. poll on a short interval while the tab is visible,
//   2. re-fetch the moment the tab is focused, shown again or comes back online,
//   3. tell every other tab in the same browser the instant something is
//      written, so an admin posting in one tab sees the student tab update
//      immediately instead of on the next tick.
//
// The channel names are the resources that changed. A page subscribes to the
// ones it renders and reloads when any of them fires.
export const LIVE_SYNC_MS = 5000;

export const SYNC_CHANNELS = {
  announcements: "announcements",
  applications: "applications",
  notifications: "notifications",
  scholarships: "scholarships",
};

const BROADCAST_NAME = "scholarhub-live-sync";
const LOCAL_EVENT = "scholarHubLiveSync";

let broadcastChannel = null;

const getBroadcastChannel = () => {
  if (broadcastChannel !== null) return broadcastChannel;

  try {
    broadcastChannel =
      typeof BroadcastChannel === "function" ? new BroadcastChannel(BROADCAST_NAME) : false;
  } catch {
    broadcastChannel = false;
  }

  return broadcastChannel;
};

// Called after any write. The same tab hears it through a window event and
// every other tab through the BroadcastChannel.
export const broadcastChange = (channel) => {
  const detail = { channel, at: Date.now() };

  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail }));

  const bus = getBroadcastChannel();

  if (bus) {
    try {
      bus.postMessage(detail);
    } catch {
      // A closed channel only means the other tabs fall back to polling.
    }
  }
};

// `refresh` is called with `{ silent: true }` for every background sync so the
// page can skip spinners and keep whatever notice it is already showing. The
// latest function is kept in a ref so the timers never restart just because
// the caller re-rendered.
export const useLiveSync = (refresh, { channels = [], intervalMs = LIVE_SYNC_MS, enabled = true } = {}) => {
  const refreshRef = useRef(refresh);
  const channelKey = channels.join("|");

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    const watched = new Set(channelKey ? channelKey.split("|") : []);
    const sync = () => refreshRef.current?.({ silent: true });

    const syncIfVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    const handleChange = (detail) => {
      if (!detail?.channel || watched.size === 0 || watched.has(detail.channel)) sync();
    };

    const handleLocal = (event) => handleChange(event.detail);
    const handleRemote = (event) => handleChange(event.data);

    const intervalId = window.setInterval(syncIfVisible, intervalMs);

    window.addEventListener("focus", syncIfVisible);
    window.addEventListener("online", syncIfVisible);
    document.addEventListener("visibilitychange", syncIfVisible);
    window.addEventListener(LOCAL_EVENT, handleLocal);

    const bus = getBroadcastChannel();

    if (bus) bus.addEventListener("message", handleRemote);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncIfVisible);
      window.removeEventListener("online", syncIfVisible);
      document.removeEventListener("visibilitychange", syncIfVisible);
      window.removeEventListener(LOCAL_EVENT, handleLocal);
      if (bus) bus.removeEventListener("message", handleRemote);
    };
  }, [channelKey, enabled, intervalMs]);
};
