import { expectTypeOf, describe, expect, it } from "vitest";

import {
  FOUNDATION_CAPABILITY_DEFAULTS,
  type Capability,
  type CapabilityStateFor,
} from "./index.js";

describe("FOUNDATION capability types", () => {
  it("keeps every external or production capability disabled by default", () => {
    expect(FOUNDATION_CAPABILITY_DEFAULTS.github).toBe("disabled");
    expect(FOUNDATION_CAPABILITY_DEFAULTS.automatic_execution).toBe("disabled");
    expect(FOUNDATION_CAPABILITY_DEFAULTS.production_deployment).toBe("disabled");
  });

  it("does not represent an enabled production deployment", () => {
    expectTypeOf<CapabilityStateFor<"production_deployment">>().toEqualTypeOf<"disabled">();
    expectTypeOf<Extract<Capability, { name: "production_deployment" }>['state']>().toEqualTypeOf<
      "disabled"
    >();
  });
});
