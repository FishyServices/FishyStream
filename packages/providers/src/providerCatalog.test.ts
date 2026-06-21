import { describe, expect, it } from "vitest";
import { getProviderByKey, getProviderByOrigin } from "./providerCatalog";

describe("providerCatalog", () => {
  it("uses explicit provider origins when a website has an absolute URL", () => {
    const provider = getProviderByKey("peachify");

    expect(provider?.progress?.origins).toEqual(["https://peachify.top"]);
    expect(provider?.progress?.unsafeWildcardOrigin).toBe(false);
  });

  it("keeps relative proxy providers marked as unsafe wildcard origins", () => {
    const provider = getProviderByKey("vidplays");

    expect(provider?.progress?.origins).toEqual(["*"]);
    expect(provider?.progress?.unsafeWildcardOrigin).toBe(true);
  });

  it("finds a provider by explicit origin", () => {
    expect(getProviderByOrigin("https://vidcore.net")?.key).toBe("vidcore");
  });
});
