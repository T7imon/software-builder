import type {
  ContentDigest,
  PolicyVersion,
  ProjectId,
  SecurityFindingId,
} from "@software-builder/core";

export type SecurityGateScope = "planning" | "revision" | "external_operation";

export interface SecurityGateContext {
  readonly projectId: ProjectId;
  readonly scope: SecurityGateScope;
  readonly scopeDigest: ContentDigest;
  readonly policyVersion: PolicyVersion;
}

interface SecurityGateBinding {
  readonly projectId: ProjectId;
  readonly scope: SecurityGateScope;
  readonly scopeDigest: ContentDigest;
  readonly policyVersion: PolicyVersion;
}

export type SecurityGateDecision =
  | (SecurityGateBinding & {
      readonly allowed: true;
      readonly blockingFindingIds: readonly [];
      readonly reasonCodes: readonly [];
    })
  | (SecurityGateBinding & {
      readonly allowed: false;
      readonly failure: "BLOCKING_FINDING";
      readonly blockingFindingIds: readonly [SecurityFindingId, ...SecurityFindingId[]];
      readonly reasonCodes: readonly [string, ...string[]];
    })
  | (SecurityGateBinding & {
      readonly allowed: false;
      readonly failure:
        | "MISSING_EVIDENCE"
        | "UNKNOWN_EVIDENCE"
        | "CONFLICTING_EVIDENCE"
        | "STALE_EVIDENCE";
      readonly blockingFindingIds: readonly [];
      readonly reasonCodes: readonly [string, ...string[]];
    });

/** Fail-closed policy boundary. FOUNDATION provides no evaluator. */
export interface SecurityGatesPort {
  evaluate(context: SecurityGateContext): Promise<SecurityGateDecision>;
}
