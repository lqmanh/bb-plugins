import { definePluginApp } from "@get-bb/plugin-sdk/app";

import "./app.css";
import { SONORA_ICONS } from "./constants.ts";
import { NowPlayingDisclosure } from "./now-playing.tsx";

export default definePluginApp((app) => {
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "now-playing",
    label: "Sonora",
    icon: SONORA_ICONS.audioLines,
    component: NowPlayingDisclosure,
  });
});
