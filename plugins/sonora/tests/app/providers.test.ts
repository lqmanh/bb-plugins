import { describe, expect, it } from "vitest";

import { nextProvider, providerBadge } from "../../src/app/lib/providers.ts";
import { NO_BADGE_PROVIDERS, PROVIDER_BADGES } from "../support/providers.ts";

describe("providerBadge", () => {
  it.each(PROVIDER_BADGES)("maps $provider to $label", (badge) => {
    expect(providerBadge(badge.provider)).toEqual(badge);
  });

  it.each(NO_BADGE_PROVIDERS)("has no badge for $name", ({ provider }) => {
    expect(providerBadge(provider)).toBeNull();
  });
});

describe("nextProvider", () => {
  it("cycles providers alphabetically, then no badge, before wrapping", () => {
    const alphabetical = [...PROVIDER_BADGES]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((badge) => badge.provider);
    const expected = [...alphabetical.slice(1), null, alphabetical[0]];

    let provider: string | null = alphabetical[0];
    for (const next of expected) {
      provider = nextProvider(provider);
      expect(provider).toBe(next);
    }

    expect(nextProvider("pandora")).toBe(alphabetical[0]);
  });
});
