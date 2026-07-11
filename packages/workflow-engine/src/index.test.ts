import { describe, expect, it } from "vitest";

import { WORKFLOW_STATUSES } from "./index.js";

describe("WORKFLOW_STATUSES", () => {
  it("matches the approved WorkflowExecution statuses", () => {
    expect(WORKFLOW_STATUSES).toEqual([
      "REQUESTED",
      "DENIED",
      "AUTHORIZED",
      "QUEUED",
      "CLAIMED",
      "RUNNING",
      "INFRA_RETRY",
      "INFRA_FAILED",
      "CANCELLING",
      "CANCELLED",
      "CANCEL_STUCK",
      "AWAITING_OBLIGATIONS",
      "COMPLETED",
      "REPAIR_SCHEDULED",
      "STOPPED",
    ]);
  });
});
