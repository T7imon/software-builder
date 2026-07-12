import type {
  ContentDigest,
  LegalRequirementId,
  PolicyVersion,
  ProjectId,
} from "@software-builder/core";

export type LegalStatus = "PASS" | "PASS_WITH_REQUIREMENTS" | "BLOCK" | "COUNSEL_REQUIRED";
export type LegalGateScope = "planning" | "revision" | "external_processing" | "publication";

export interface LegalGateContext {
  readonly projectId: ProjectId;
  readonly scope: LegalGateScope;
  readonly scopeDigest: ContentDigest;
  readonly policyVersion: PolicyVersion;
}

interface LegalGateBinding {
  readonly projectId: ProjectId;
  readonly scope: LegalGateScope;
  readonly scopeDigest: ContentDigest;
  readonly policyVersion: PolicyVersion;
}

export type LegalGateDecision =
  | (LegalGateBinding & {
      readonly allowed: true;
      readonly status: "PASS";
      readonly unmetRequirementIds: readonly [];
      readonly reasonCodes: readonly [];
    })
  | (LegalGateBinding & {
      readonly allowed: true;
      readonly status: "PASS_WITH_REQUIREMENTS";
      readonly requirementsVerified: true;
      readonly unmetRequirementIds: readonly [];
      readonly reasonCodes: readonly [];
    })
  | (LegalGateBinding & {
      readonly allowed: false;
      readonly status: "BLOCK" | "COUNSEL_REQUIRED";
      readonly failure: "BLOCKING_STATUS";
      readonly unmetRequirementIds: readonly [];
      readonly reasonCodes: readonly [string, ...string[]];
    })
  | (LegalGateBinding & {
      readonly allowed: false;
      readonly status: "PASS_WITH_REQUIREMENTS";
      readonly failure: "OPEN_REQUIREMENTS";
      readonly unmetRequirementIds: readonly [LegalRequirementId, ...LegalRequirementId[]];
      readonly reasonCodes: readonly [string, ...string[]];
    })
  | (LegalGateBinding & {
      readonly allowed: false;
      readonly status: null;
      readonly failure:
        | "MISSING_ASSESSMENT"
        | "UNKNOWN_ASSESSMENT"
        | "CONFLICTING_ASSESSMENT"
        | "STALE_ASSESSMENT";
      readonly unmetRequirementIds: readonly [];
      readonly reasonCodes: readonly [string, ...string[]];
    });

/** Fail-closed policy boundary. FOUNDATION provides no evaluator or legal advice. */
export interface LegalGatesPort {
  evaluate(context: LegalGateContext): Promise<LegalGateDecision>;
}
