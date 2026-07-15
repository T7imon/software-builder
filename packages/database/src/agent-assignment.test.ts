import { describe,expect,it } from "vitest";
import { AgentAssignmentService,type AgentAssignment,type AgentAssignmentRepository,type AssignActiveAgentInput,type ReleaseAgentAssignmentInput } from "./agent-assignment.js";
import type { ProjectCapability } from "./types.js";

const capability="synthetic-capability" as never;
const projectId="00000000-0000-4000-8000-000000000101";
const jobId="00000000-0000-4000-8000-000000000102";
const assignmentId="00000000-0000-4000-8000-000000000103";
const assigned:AgentAssignment={assignmentId,projectId,jobId,requiredRole:"PLANNER",agentId:"00000000-0000-4000-8000-000000000104",agentKey:"planner",agentVersion:1,assignmentStatus:"ASSIGNED",createdAt:new Date("2026-01-01T00:00:00Z"),createdBy:"synthetic-test"};
const assignInput:AssignActiveAgentInput={assignmentId,projectId,jobId,requiredRole:"PLANNER",createdBy:"synthetic-test"};
const releaseInput:ReleaseAgentAssignmentInput={assignmentId,projectId,jobId,releasedBy:"synthetic-releaser"};

class StubRepository implements AgentAssignmentRepository {
  calls:string[]=[];
  async assignActiveAgent(_capability:ProjectCapability,input:AssignActiveAgentInput){this.calls.push(`assign:${input.assignmentId}`);return assigned;}
  async getAssignmentByJob(_capability:ProjectCapability,inputJobId:string){this.calls.push(`get:${inputJobId}`);return assigned;}
  async listAssignmentsByProject(){this.calls.push("list");return[assigned];}
  async releaseAssignment(_capability:ProjectCapability,input:ReleaseAgentAssignmentInput){this.calls.push(`release:${input.assignmentId}`);return{...assigned,assignmentStatus:"RELEASED" as const,releasedAt:new Date("2026-01-02T00:00:00Z"),releasedBy:input.releasedBy};}
}

describe("AgentAssignmentService",()=>{
  it("stellt die vier typisierten Operationen bereit",async()=>{const repository=new StubRepository();const service=new AgentAssignmentService(repository);await expect(service.assignActiveAgent(capability,assignInput)).resolves.toEqual(assigned);await expect(service.getAssignmentByJob(capability,jobId)).resolves.toEqual(assigned);await expect(service.listAssignmentsByProject(capability)).resolves.toEqual([assigned]);await expect(service.releaseAssignment(capability,releaseInput)).resolves.toMatchObject({assignmentStatus:"RELEASED",releasedBy:"synthetic-releaser"});expect(repository.calls).toEqual([`assign:${assignmentId}`,`get:${jobId}`,"list",`release:${assignmentId}`]);});
  it("weist ungueltige IDs, Rollen und Akteure vor dem Repository ab",()=>{const repository=new StubRepository();const service=new AgentAssignmentService(repository);expect(()=>service.assignActiveAgent(capability,{...assignInput,assignmentId:"invalid"})).toThrow(/assignmentId/);expect(()=>service.assignActiveAgent(capability,{...assignInput,requiredRole:"UNKNOWN" as never})).toThrow(/requiredRole/);expect(()=>service.assignActiveAgent(capability,{...assignInput,createdBy:"api_key=forbidden"})).toThrow(/createdBy/);expect(()=>service.getAssignmentByJob(capability,"invalid")).toThrow(/jobId/);expect(()=>service.releaseAssignment(capability,{...releaseInput,releasedBy:""})).toThrow(/releasedBy/);expect(repository.calls).toEqual([]);});
});
