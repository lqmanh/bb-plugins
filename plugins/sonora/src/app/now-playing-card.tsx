import { useSettings } from "@get-bb/plugin-sdk/app";

import { NowPlayingBody } from "./components/now-playing-body.tsx";

export function NowPlayingContextCard() {
  const { values } = useSettings();
  if (values?.contextCard !== true) return null;

  return <NowPlayingBody surface="card" />;
}
