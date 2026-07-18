import { createHash } from "node:crypto";
import {
  createWorkerProcessIdentityForTest,
  type WorkerProcessIdentity,
} from "@software-builder/agent-runtime";
import {
  AgentJobRepository,
  type AgentJobClaim,
} from "./agent-job-repository.js";

/**
 * Explicit test-only process fixture. Production callers must obtain their
 * identity from the worker boot boundary and register it themselves.
 */
export class RegisteredWorkerProcessFixtureForTest {
  private readonly identities = new Map<string, WorkerProcessIdentity>();
  private readonly registrations = new Map<string, Promise<WorkerProcessIdentity>>();

  constructor(private readonly testNamespace: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(testNamespace)) {
      throw new Error("INVALID_TEST_WORKER_NAMESPACE");
    }
  }

  identity(workerId: string): WorkerProcessIdentity {
    let identity = this.identities.get(workerId);
    if (!identity) {
      identity = createWorkerProcessIdentityForTest(
        this.entropy("instance", workerId),
        this.entropy("ownership", workerId),
      );
      this.identities.set(workerId, identity);
    }
    return identity;
  }

  async registeredIdentity(
    repository: AgentJobRepository,
    workerId: string,
  ): Promise<WorkerProcessIdentity> {
    let registration = this.registrations.get(workerId);
    if (!registration) {
      const identity = this.identity(workerId);
      registration = repository.registerWorkerProcess(workerId, identity).then(() => identity);
      this.registrations.set(workerId, registration);
    }
    return registration;
  }

  async claimNext(
    repository: AgentJobRepository,
    workerId: string,
    claimId: string,
    leaseMs: number,
  ): Promise<AgentJobClaim | null> {
    const identity = await this.registeredIdentity(repository, workerId);
    return repository.claimNext(workerId, claimId, leaseMs, identity);
  }

  private entropy(purpose: "instance" | "ownership", workerId: string): string {
    return createHash("sha256")
      .update(`registered-worker-process-fixture\0${this.testNamespace}\0${purpose}\0${workerId}`)
      .digest("hex");
  }
}
