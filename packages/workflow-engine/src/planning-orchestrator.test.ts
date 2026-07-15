import { describe,expect,it } from "vitest";
import { assertOutcomeAllowedForRole,assertOwnerDecisionInput,assertPlanningJobResult,assertPlanningStart,isTerminalPlanningState,type PlanningJobResult } from "./planning-orchestrator.js";

const revision="a".repeat(64);
const result=(overrides:Partial<PlanningJobResult>={}):PlanningJobResult=>({jobId:"11111111-1111-4111-8111-111111111111",runtimeResultId:"22222222-2222-4222-8222-222222222222",projectRevision:revision,outcome:"PASS",objectRef:"synthetic/planning/result",digest:"b".repeat(64),requirements:[],...overrides});

describe("Planning Orchestrator domain contract",()=>{
  it("accepts only minimized, revision-bound synthetic results",()=>{
    expect(()=>assertPlanningJobResult(result())).not.toThrow();
    expect(()=>assertPlanningJobResult(result({outcome:"PASS_WITH_REQUIREMENTS",requirements:[{code:"NOTICE_REQUIRED",ref:"synthetic/requirements/notice"}]}))).not.toThrow();
    expect(()=>assertPlanningJobResult(result({projectRevision:"wrong"}))).toThrow("PLANNING_INVALID_PROJECT_REVISION");
    expect(()=>assertPlanningJobResult(result({outcome:"PASS",requirements:[{code:"NOTICE_REQUIRED",ref:"synthetic/ref"}]}))).toThrow("PLANNING_REQUIREMENTS_OUTCOME_MISMATCH");
    expect(()=>assertPlanningJobResult(result({outcome:"PASS_WITH_REQUIREMENTS",requirements:[]}))).toThrow("PLANNING_REQUIREMENTS_OUTCOME_MISMATCH");
  });

  it("limits Planner and Architect to PASS without review requirements",()=>{
    expect(()=>assertOutcomeAllowedForRole("PLANNER",result())).not.toThrow();
    expect(()=>assertOutcomeAllowedForRole("ARCHITECT",result({outcome:"BLOCK"}))).toThrow("PLANNING_ROLE_RESULT_MISMATCH");
    expect(()=>assertOutcomeAllowedForRole("SECURITY",result({outcome:"BLOCK"}))).not.toThrow();
  });

  it("validates start and immutable owner-decision inputs without secrets",()=>{
    expect(()=>assertPlanningStart("11111111-1111-4111-8111-111111111111",revision,"synthetic-owner")).not.toThrow();
    expect(()=>assertOwnerDecisionInput("APPROVE","synthetic-owner","planning-approved")).not.toThrow();
    expect(()=>assertOwnerDecisionInput("APPROVE","synthetic-owner","password=forbidden")).toThrow("PLANNING_INVALID_DECISION_REASON");
  });

  it("recognizes only the three terminal planning states",()=>{
    expect(isTerminalPlanningState("BLOCKED")).toBe(true);
    expect(isTerminalPlanningState("REJECTED")).toBe(true);
    expect(isTerminalPlanningState("READY_FOR_IMPLEMENTATION")).toBe(true);
    expect(isTerminalPlanningState("WAITING_FOR_OWNER_APPROVAL")).toBe(false);
  });
});
