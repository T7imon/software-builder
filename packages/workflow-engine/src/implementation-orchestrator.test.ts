import { describe,expect,it } from "vitest";
import {
  assertImplementationExecutorResult,
  assertImplementationReviewResult,
  assertImplementationStart,
  isTerminalImplementationState,
  type ImplementationExecutorResult,
  type ImplementationReviewResult,
} from "./planning-orchestrator.js";

const projectId="11111111-1111-4111-8111-111111111111";
const runId="22222222-2222-4222-8222-222222222222";
const jobId="33333333-3333-4333-8333-333333333333";
const runtimeResultId="44444444-4444-4444-8444-444444444444";
const resultId="55555555-5555-4555-8555-555555555555";
const revision="a".repeat(64);
const createdAt=new Date("2026-07-15T12:00:00.000Z");
const artifact={objectRef:"synthetic/implementation/artifact",digest:"b".repeat(64)};
const upperUuid=(value:string)=>value.toUpperCase();

const executorResult=(overrides:Partial<ImplementationExecutorResult>={}):ImplementationExecutorResult=>({
  implementationResultId:resultId,runtimeResultId,projectId,projectRevision:revision,executorJobId:jobId,
  agentId:"66666666-6666-4666-8666-666666666666",agentKey:"synthetic-executor",agentVersion:1,
  artifacts:[artifact],summary:"Synthetic implementation completed.",createdAt,status:"SUCCEEDED",...overrides,
});
const reviewResult=(overrides:Partial<ImplementationReviewResult>={}):ImplementationReviewResult=>({
  reviewResultId:"77777777-7777-4777-8777-777777777777",runtimeResultId,projectId,projectRevision:revision,
  reviewJobId:jobId,implementationResultId:resultId,role:"QA",outcome:"PASS",objectRef:artifact.objectRef,
  digest:artifact.digest,requirements:[],createdAt,...overrides,
});

describe("Implementation Orchestrator domain contract",()=>{
  it("accepts only an exact owner-approved start identity",()=>{
    expect(()=>assertImplementationStart(projectId,runId,revision,"synthetic-owner")).not.toThrow();
    expect(()=>assertImplementationStart(upperUuid(projectId),upperUuid(runId),revision,"synthetic-owner")).not.toThrow();
    expect(()=>assertImplementationStart(projectId,runId,"wrong","synthetic-owner")).toThrow("IMPLEMENTATION_INVALID_PROJECT_REVISION");
    expect(()=>assertImplementationStart(projectId,runId,revision,"password=forbidden")).toThrow("IMPLEMENTATION_INVALID_REQUESTED_BY");
  });

  it("validates immutable synthetic executor projections for every terminal executor status",()=>{
    expect(()=>assertImplementationExecutorResult(executorResult())).not.toThrow();
    expect(()=>assertImplementationExecutorResult(executorResult({implementationResultId:upperUuid(resultId),runtimeResultId:upperUuid(runtimeResultId),projectId:upperUuid(projectId),executorJobId:upperUuid(jobId),agentId:upperUuid("66666666-6666-4666-8666-666666666666")}))).not.toThrow();
    expect(()=>assertImplementationExecutorResult(executorResult({status:"FAILED",artifacts:[]}))).not.toThrow();
    expect(()=>{const {runtimeResultId:discarded,...cancelled}=executorResult({status:"CANCELLED",artifacts:[]});void discarded;assertImplementationExecutorResult(cancelled);}).not.toThrow();
    expect(()=>assertImplementationExecutorResult(executorResult({projectRevision:"wrong"}))).toThrow("IMPLEMENTATION_INVALID_PROJECT_REVISION");
    expect(()=>assertImplementationExecutorResult(executorResult({status:"SUCCEEDED",artifacts:[]}))).toThrow("IMPLEMENTATION_SUCCESS_RESULT_INCOMPLETE");
    expect(()=>assertImplementationExecutorResult(executorResult({status:"FAILED",artifacts:[artifact]}))).toThrow("IMPLEMENTATION_NON_SUCCESS_ARTIFACTS");
    expect(()=>assertImplementationExecutorResult(executorResult({summary:"api_key=forbidden"}))).toThrow("IMPLEMENTATION_INVALID_SUMMARY");
  });

  it("closes QA and Reviewer outcomes to PASS or CHANGES_REQUESTED",()=>{
    expect(()=>assertImplementationReviewResult(reviewResult())).not.toThrow();
    expect(()=>assertImplementationReviewResult(reviewResult({reviewResultId:upperUuid("77777777-7777-4777-8777-777777777777"),runtimeResultId:upperUuid(runtimeResultId),projectId:upperUuid(projectId),reviewJobId:upperUuid(jobId),implementationResultId:upperUuid(resultId)}))).not.toThrow();
    expect(()=>assertImplementationReviewResult(reviewResult({role:"REVIEWER",outcome:"CHANGES_REQUESTED"}))).not.toThrow();
    expect(()=>assertImplementationReviewResult(reviewResult({role:"QA",outcome:"BLOCK"}))).toThrow("IMPLEMENTATION_REVIEW_ROLE_OUTCOME_MISMATCH");
    expect(()=>assertImplementationReviewResult(reviewResult({role:"REVIEWER",outcome:"PASS_WITH_REQUIREMENTS",requirements:[{code:"NOTICE_REQUIRED",ref:"synthetic/notice"}]}))).toThrow("IMPLEMENTATION_REVIEW_ROLE_OUTCOME_MISMATCH");
  });

  it("allows Development-only security/legal requirements but never implicit or free requirements",()=>{
    expect(()=>assertImplementationReviewResult(reviewResult({role:"SECURITY",outcome:"BLOCK"}))).not.toThrow();
    expect(()=>assertImplementationReviewResult(reviewResult({role:"LEGAL_DE_EU",outcome:"PASS_WITH_REQUIREMENTS",requirements:[{code:"NOTICE_REQUIRED",ref:"synthetic/legal/notice"}]}))).not.toThrow();
    expect(()=>assertImplementationReviewResult(reviewResult({role:"LEGAL_DE_EU",outcome:"PASS_WITH_REQUIREMENTS",requirements:[]}))).toThrow("IMPLEMENTATION_REQUIREMENTS_OUTCOME_MISMATCH");
    expect(()=>assertImplementationReviewResult(reviewResult({role:"SECURITY",outcome:"PASS",requirements:[{code:"RETENTION_LIMIT",ref:"synthetic/security/retention"}]}))).toThrow("IMPLEMENTATION_REQUIREMENTS_OUTCOME_MISMATCH");
  });

  it("recognizes exactly the five task-terminal implementation states",()=>{
    for(const state of ["READY_FOR_DELIVERY","CHANGES_REQUESTED","BLOCKED","IMPLEMENTATION_FAILED","IMPLEMENTATION_CANCELLED"] as const)expect(isTerminalImplementationState(state)).toBe(true);
    expect(isTerminalImplementationState("IMPLEMENTING")).toBe(false);
    expect(isTerminalImplementationState("IMPLEMENTATION_REVIEW")).toBe(false);
  });
});
