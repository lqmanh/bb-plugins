import {
  renderSlot,
  type PluginRpcTestHandlers,
  type RenderSlotOptions,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { ComponentType } from "react";

import { nowPlayingRpcContract } from "../../src/shared/now-playing.ts";
import type { ControlHandler, RpcHandler } from "./fixtures.ts";
import { settle } from "./render.ts";

type NowPlayingSlotOptions = Omit<
  RenderSlotOptions<typeof nowPlayingRpcContract>,
  "rpc" | "experimental_rpcContract"
> & {
  nowPlaying: RpcHandler;
  control?: ControlHandler;
};

const mounted: RenderedSlot[] = [];

export async function renderNowPlayingSlot<Props extends object>(
  registration: { component: ComponentType<Props> },
  props: Props,
  { nowPlaying, control = () => null, ...options }: NowPlayingSlotOptions,
): Promise<RenderedSlot> {
  const rpc: PluginRpcTestHandlers<typeof nowPlayingRpcContract> = {
    nowPlaying,
    control,
  };
  const slot = renderSlot(registration, props, {
    ...options,
    rpc,
    experimental_rpcContract: nowPlayingRpcContract,
  });
  mounted.push(slot);
  await settle();
  return slot;
}

export function unmountSlots(): void {
  for (const slot of mounted.splice(0)) slot.unmount();
}

/** For a test that checks what unmounting does, so the cleanup doesn't unmount it again. */
export function unmountSlot(slot: RenderedSlot): void {
  mounted.splice(mounted.indexOf(slot), 1);
  slot.unmount();
}
