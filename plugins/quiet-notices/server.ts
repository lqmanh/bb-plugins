import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * Quiet Notices backend entry.
 *
 * The child-notice gate and queue controls are added by the implementation
 * tasks; this scaffold only establishes the plugin entry point.
 */
export default async function plugin(bb: BbPluginApi) {
  bb.log.info("Quiet Notices loaded");

  bb.onDispose(() => {
    bb.log.info("Quiet Notices disposed");
  });
}
