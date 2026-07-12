import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ContentDigest,
  PolicyVersion,
  ProjectId,
} from "@software-builder/core";

import type {
  LegalGateDecision,
  LegalGateScope,
} from "./index.js";

describe("LegalGateDecision scope binding", () => {
  it("exports the exact supported Legal gate scopes", () => {
    expectTypeOf<LegalGateScope>().toEqualTypeOf<
      "planning" | "revision" | "external_processing" | "publication"
    >();
  });

  it("carries the evaluated scope together with all evidence bindings", () => {
    const decision: LegalGateDecision = {
      allowed: true,
      status: "PASS",
      projectId: "project-test" as ProjectId,
      scope: "planning",
      scopeDigest: "digest-test" as ContentDigest,
      policyVersion: "policy-test" as PolicyVersion,
      unmetRequirementIds: [],
      reasonCodes: [],
    };

    expect(decision).toMatchObject({
      projectId: "project-test",
      scope: "planning",
      scopeDigest: "digest-test",
      policyVersion: "policy-test",
    });
  });
});
