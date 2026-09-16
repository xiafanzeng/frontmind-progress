import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MonitorForm from "./components/MonitorForm";
import ModuleWorkspace from "./ModuleWorkspace";
import type { MonitoringPageProps } from "./pages/MonitoringPage";
import type { RunCostQuoteInput } from "./runBilling";

// Keep the real form and tRPC/React Query mutation lifecycle, while opening a
// populated editor directly instead of exercising unrelated report navigation.
vi.mock("./pages/MonitoringPage", () => ({
  default: (props: MonitoringPageProps) =>
    props.project && props.models.length ? (
      <MonitorForm
        project={props.project}
        models={props.models}
        availableBalanceTenThousandths={props.availableBalanceTenThousandths}
        quoteRunCost={props.quoteRunCost}
        initial={{
          name: "报价回归",
          brandAliases: [props.project.brandName],
          competitors: [],
          questions: ["测试品牌如何交付？"],
          platforms: [{
            platformId: props.models[0]!.id,
            providerCode: props.models[0]!.code,
            clientType: "web",
            mode: "search",
            screenshot: 0,
            regionCode: null,
          }],
          repetitions: 1,
          schedule: { type: "none", timezone: "Asia/Shanghai" },
        }}
        onCancel={() => {}}
        onSubmit={() => {}}
      />
    ) : null,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flushUpdates() {
  // tRPC batches and React Query observer notifications each use a timer;
  // separate acts also flush the renders/effects caused by each notification.
  for (let turn = 0; turn < 6; turn += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  }
}

it("quotes once across mutation and parent updates, then requotes when the input changes", async () => {
  vi.useFakeTimers();
  const requests: Array<{
    input: RunCostQuoteInput;
    resolve: (response: Response) => void;
  }> = [];
  const responses: Record<string, unknown> = {
    "projects.list": [{
      id: "project", name: "测试项目", mainBrand: "测试品牌", aliases: [],
      competitors: [], timezone: "Asia/Shanghai",
    }],
    "platforms.list": [{
      id: "deepseek-web", providerCode: "deepseek", displayName: "DeepSeek",
      clientType: "web", enabled: true, verified: true,
      supportsReasoning: true, reasoningSupport: "supported",
      supportsScreenshot: true, supportsDomesticRegion: false,
      supportsOverseasRegion: false,
    }],
    "regions.list": [],
    "costs.summary": { availableTenThousandths: "100000" },
    "monitors.list": [],
    "monitors.listDeleted": [],
  };
  const response = (data: unknown[]) => new Response(
    JSON.stringify(data.map(value => ({ result: { data: value } }))),
    { headers: { "content-type": "application/json" } },
  );
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const procedures = new URL(url, window.location.href).pathname
      .split("/trpc/")[1]!.split(",");
    if (procedures[0] === "costs.quote") {
      return new Promise<Response>(resolve => {
        requests.push({
          input: JSON.parse(String(options?.body))["0"],
          resolve,
        });
      });
    }
    return Promise.resolve(response(procedures.map(procedure => {
      if (!(procedure in responses)) throw new Error(`Unexpected RPC: ${procedure}`);
      return responses[procedure];
    })));
  }));

  const view = render(<ModuleWorkspace />);
  await flushUpdates();
  expect(screen.getByLabelText("重复次数")).toHaveValue(1);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.input.items[0]!.quantity).toBe(1);

  view.rerender(<ModuleWorkspace />);
  await flushUpdates();
  expect(requests).toHaveLength(1);

  requests[0]!.resolve(response([{ totalAmountTenThousandths: "900" }]));
  await flushUpdates();
  expect(screen.getByText("按实际成功任务结算")).toBeVisible();
  expect(requests).toHaveLength(1);

  view.rerender(<ModuleWorkspace />);
  await flushUpdates();
  expect(requests).toHaveLength(1);

  fireEvent.change(screen.getByLabelText("重复次数"), { target: { value: "2" } });
  await flushUpdates();
  expect(requests).toHaveLength(2);
  expect(requests[1]!.input.items[0]!.quantity).toBe(2);
  requests[1]!.resolve(response([{ totalAmountTenThousandths: "1800" }]));
  await flushUpdates();
  expect(screen.getByText("按实际成功任务结算")).toBeVisible();
  expect(requests).toHaveLength(2);
});
