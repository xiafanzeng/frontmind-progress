import { test } from "node:test";
import assert from "node:assert/strict";
import { initTRPC, TRPCError } from "@trpc/server";
import { createProgressRoutes } from "../dist/server/routes.js";
import { runWithProgressStartAdmission } from "../dist/server/start-admission.js";

const id = "11111111-1111-4111-8111-111111111111";
const projectInput = { name: "监控范围", mainBrand: "品牌", aliases: [], competitors: [], timezone: "Asia/Shanghai" };
const configuration = {
  name: "口碑监控", mainBrand: "品牌", brandAliases: [], competitors: [],
  questions: ["品牌口碑怎么样？"], platforms: [{ platformId: id, providerCode: "doubao", clientType: "web", mode: "search", screenshot: 0, regionCode: null }],
  repetitions: 5, schedule: { type: "none", timezone: "Asia/Shanghai", localTime: "09:00", weekday: null },
};
function fixture() {
  const writes = [];
  const repository = {
    listProjects: async () => [], listMonitors: async () => [],
    createProject: async (_owner, input) => { writes.push("createProject"); return { id, createdAt: new Date(), ...input }; },
    setMonitorPaused: async () => { writes.push("pause"); },
    softDeleteMonitor: async () => { writes.push("delete"); },
    restoreMonitor: async () => { writes.push("restore"); },
    cancelRun: async () => {
      writes.push("cancel");
      return { id, projectId: id, projectBrandVersionId: id, monitorId: id, monitorVersionId: id,
        trigger: "manual", status: "cancelled", expectedAttempts: 1, completedAttempts: 0,
        failedAttempts: 0, stoppedAttempts: 1, submittedAttempts: 0, startedAt: null,
        completedAt: new Date(), cancelRequestedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    },
  };
  const core = { authorize: async () => ({ user: { id: "owner" }, repository, audit: {}, costs: {}, config: {} }) };
  const caller = initTRPC.create().router(createProgressRoutes(core).customer).createCaller({});
  return { caller, writes };
}

test("formal knowledge gates only new monitoring configuration and starts", async () => {
  const { caller, writes } = fixture();
  let checks = 0;
  await runWithProgressStartAdmission(async () => {
    checks++;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "请先完成并发布当前企业项目的知识库。" });
  }, async () => {
    for (const call of [
      () => caller.projects.create(projectInput),
      () => caller.projects.update({ projectId: id, ...projectInput }),
      () => caller.projects.updateBrand({ projectId: id, mainBrand: "品牌" }),
      () => caller.monitors.create({ projectId: id, configuration }),
      () => caller.monitors.update({ monitorId: id, configuration }),
      () => caller.monitors.runNow({ monitorId: id, idempotencyKey: "unchanged-original-key" }),
      () => caller.monitors.resume({ monitorId: id }),
    ]) await assert.rejects(call, error => error.code === "PRECONDITION_FAILED");
    assert.equal(checks, 7);
    assert.deepEqual(writes, []);
    assert.deepEqual(await caller.projects.list(), []);
    assert.deepEqual(await caller.monitors.list({ projectId: id }), []);
    await caller.monitors.pause({ monitorId: id });
    await caller.monitors.remove({ monitorId: id });
    await caller.monitors.restore({ monitorId: id });
    await caller.runs.cancel({ runId: id });
    assert.equal(checks, 7);
    assert.deepEqual(writes, ["pause", "delete", "restore", "cancel"]);
  });
});

test("admission stays request scoped and independent operations retain their existing authorization", async () => {
  const { caller, writes } = fixture();
  const denied = runWithProgressStartAdmission(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    throw new TRPCError({ code: "PRECONDITION_FAILED" });
  }, () => assert.rejects(() => caller.projects.create(projectInput), error => error.code === "PRECONDITION_FAILED"));
  const permitted = runWithProgressStartAdmission(async () => {}, () => caller.projects.create(projectInput));
  await Promise.all([denied, permitted]);
  await caller.projects.create(projectInput);
  assert.deepEqual(writes, ["createProject", "createProject"]);
});
