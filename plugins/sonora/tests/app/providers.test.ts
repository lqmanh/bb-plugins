import { describe, expect, it } from "vitest";

import { providerBadge } from "../../src/app/lib/providers.ts";
import { NO_BADGE_PROVIDERS, PROVIDER_BADGES } from "../support/providers.ts";

describe("providerBadge", () => {
  it.each(PROVIDER_BADGES)("maps $provider to $label", (badge) => {
    expect(providerBadge(badge.provider)).toEqual(badge);
  });

  it.each(NO_BADGE_PROVIDERS)("has no badge for $name", ({ provider }) => {
    expect(providerBadge(provider)).toBeNull();
  });
});
