// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { configureProgressHost, ProgressExecutionActivity } from "./host-runtime";
import type { MonitorRun } from "./domain";
afterEach(() => {cleanup();configureProgressHost({});});
it("renders the original timed monitoring phases in an independent host", () => {
  const run = {id:"run",status:"completed",createdAt:"2026-09-10T01:00:00Z",startedAt:"2026-09-10T01:00:01Z",completedAt:"2026-09-10T01:00:04Z",attempts:[]} as unknown as MonitorRun;
  const {container}=render(<ProgressExecutionActivity run={run}/>);
  expect(container.querySelector('.business-execution-disclosure')).not.toBeNull();
  expect(screen.getByLabelText("执行过程")).toBeTruthy();
  expect(screen.getByText("用时 4秒")).toBeTruthy();
  expect(screen.getByText(/准备采集/)).toBeTruthy();
  expect(screen.getByText(/执行采集/)).toBeTruthy();
  expect(screen.getByText(/采集结果/)).toBeTruthy();
  expect(container.querySelector('details')?.open).toBe(false);
});
