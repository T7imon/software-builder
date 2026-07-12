import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ContentDigest,
  PolicyVersion,
  ProjectId,
} from "@software-builder/core";

import type {
  SecurityGateDecision,
  SecurityGateScope,
} from "./index.js";

describe("SecurityGateDecision scope binding", () => {
  it("exports the exact supported Security gate scopes", () => {
    expectTypeOf<SecurityGateScope>().toEqualTypeOf<
      "planning" | "revision" | "external_operation"
    >();
  });

  it("carries the evaluated scope together with all evidence bindings", () => {
    const decision: SecurityGateDecision = {
      allowed: true,
      projectId: "project-test" as ProjectId,
      scope: "revision",
      scopeDigest: "digest-test" as ContentDigest,
      policyVersion: "policy-test" as PolicyVersion,
      blockingFindingIds: [],
      reasonCodes: [],
    };

    expect(decision).toMatchObject({
      projectId: "project-test",
      scope: "revision",
      scopeDigest: "digest-test",
      policyVersion: "policy-test",
    });
  });
});
