import { definePluginApp } from "@get-bb/plugin-sdk/app";

import "./app.css";
import { SONORA_ICONS } from "./lib/constants.ts";
import { NowPlayingBanner } from "./now-playing-banner.tsx";
import { NowPlayingContextCard } from "./now-playing-card.tsx";
import { NowPlayingDisclosure } from "./now-playing-disclosure.tsx";
import { ThreadBackdrop } from "./thread-backdrop.tsx";

/** Sorts after bb's related, changes, and storage sections. */
const CONTEXT_CARD_GROUP = "4_sonora";

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "thread-backdrop",
    component: ThreadBackdrop,
  });
  app.composer.customize({
    id: "now-playing",
    scopes: ["thread"],
    banners: [{ id: "now-playing", chrome: "bare", component: NowPlayingBanner }],
  });
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "now-playing",
    label: "Sonora",
    icon: SONORA_ICONS.audioLines,
    component: NowPlayingDisclosure,
  });
  app.slots.experimental_threadContextCardSection({
    id: "now-playing",
    title: "Sonora",
    group: CONTEXT_CARD_GROUP,
    component: NowPlayingContextCard,
  });
});
