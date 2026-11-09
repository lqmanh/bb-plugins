import { definePluginApp } from "@get-bb/plugin-sdk/app";

import "./app.css";
import { SONORA_ICONS } from "./lib/constants.ts";
import { NowPlayingDisclosure } from "./now-playing.tsx";
import { NowPlayingStrip } from "./now-playing-strip.tsx";
import { ThreadBackdrop } from "./thread-backdrop.tsx";

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "thread-backdrop",
    component: ThreadBackdrop,
  });
  app.composer.customize({
    id: "now-playing-strip",
    scopes: ["thread"],
    banners: [{ id: "now-playing", chrome: "bare", component: NowPlayingStrip }],
  });
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "now-playing",
    label: "Sonora",
    icon: SONORA_ICONS.audioLines,
    component: NowPlayingDisclosure,
  });
});
