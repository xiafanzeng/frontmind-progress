import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ModuleWorkspace from "./ModuleWorkspace";
import type { MonitoringPageProps } from "./pages/MonitoringPage";

// Exercise the real workspace, project form, and tRPC/React Query transport.
// The monitoring page only reports which project the workspace selected.
vi.mock("./pages/MonitoringPage", () => ({
  default: ({ project }: MonitoringPageProps) => (
    <p data-testid="selected-project">{project?.name}</p>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const existingProject = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "已有项目", mainBrand: "已有品牌", aliases: [], competitors: [],
  timezone: "Asia/Shanghai",
};
const createdProject = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "新建项目", mainBrand: "新品牌", aliases: ["新别名"],
  competitors: [{ name: "竞品", aliases: ["竞品别名"] }],
  timezone: "Asia/Shanghai",
};
const response = (values: unknown[]) => new Response(
  JSON.stringify(values.map(data => ({ result: { data } }))),
  { headers: { "content-type": "application/json" } },
);

function installServer(create: (input: unknown) => Promise<Response>) {
  const projects = [existingProject];
  const mutations: Array<{ procedure: string; input: unknown }> = [];
  const reads: Record<string, unknown> = {
    "platforms.list": [], "regions.list": [],
    "costs.summary": { availableTenThousandths: "100000" },
    "monitors.list": [], "monitors.listDeleted": [],
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    const procedures = new URL(url, window.location.href).pathname
      .split("/trpc/")[1]!.split(",");
    if (options?.method === "POST") {
      const inputs = JSON.parse(String(options.body));
      procedures.forEach((procedure, index) => mutations.push({ procedure, input: inputs[index] }));
      if (procedures.length !== 1 || procedures[0] !== "projects.create") {
        throw new Error(`Unexpected mutation: ${procedures.join(",")}`);
      }
      return create(inputs[0]);
    }
    return response(procedures.map(procedure => {
      if (procedure === "projects.list") return projects;
      if (!(procedure in reads)) throw new Error(`Unexpected RPC: ${procedure}`);
      return reads[procedure];
    }));
  }));
  return { projects, mutations };
}

async function openCreateForm() {
  await waitFor(() => expect(screen.getByTestId("selected-project")).toHaveTextContent("已有项目"));
  const header = document.querySelector("header.fm-demo-header")!;
  fireEvent.click(within(header as HTMLElement).getByRole("button", { name: "创建项目" }));
  const dialog = await screen.findByRole("dialog", { name: "创建项目" });
  expect(within(dialog).getByRole("textbox", { name: /项目名称/ })).toHaveValue("");
  expect(within(dialog).getByRole("textbox", { name: /主品牌名称/ })).toHaveValue("");
  fireEvent.change(within(dialog).getByRole("textbox", { name: /项目名称/ }), { target: { value: createdProject.name } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /主品牌名称/ }), { target: { value: createdProject.mainBrand } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /品牌别名/ }), { target: { value: "新别名" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "竞品品牌" }), { target: { value: "竞品｜竞品别名" } });
  return dialog;
}

it("creates and selects another project from the header without creating monitors or runs", async () => {
  let finishCreate!: (value: Response) => void;
  const server = installServer(() => new Promise(resolve => { finishCreate = resolve; }));
  const view = render(<ModuleWorkspace />);
  const dialog = await openCreateForm();
  fireEvent.click(within(dialog).getByRole("button", { name: "保存项目" }));
  await waitFor(() => expect(server.mutations).toHaveLength(1));
  expect(within(dialog).getByRole("button", { name: "正在保存…" })).toBeDisabled();
  fireEvent.submit(dialog.querySelector("form")!);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(screen.getByRole("dialog", { name: "创建项目" })).toBeVisible();
  const { id: _id, ...input } = createdProject;
  expect(server.mutations).toEqual([{ procedure: "projects.create", input }]);
  server.projects.push(createdProject as typeof existingProject);
  finishCreate(response([createdProject]));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("combobox", { name: "监控项目" })).toHaveValue(createdProject.id);
  expect(screen.getByTestId("selected-project")).toHaveTextContent(createdProject.name);
  expect(server.mutations.map(({ procedure }) => procedure)).toEqual(["projects.create"]);

  view.unmount();
  window.history.replaceState({}, "", `/?project=${createdProject.id}`);
  render(<ModuleWorkspace />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "监控项目" })).toHaveValue(createdProject.id));
  expect(screen.getByTestId("selected-project")).toHaveTextContent(createdProject.name);
  expect(server.mutations).toHaveLength(1);
});

it("keeps a failed creation open with the entered values and allows retry", async () => {
  let attempts = 0;
  const server = installServer(async () => {
    if (++attempts === 1) return new Response(JSON.stringify([{
      error: { message: "项目名称已存在", code: -32009, data: { code: "CONFLICT", httpStatus: 409, path: "projects.create" } },
    }]), { status: 409, headers: { "content-type": "application/json" } });
    server.projects.push(createdProject as typeof existingProject);
    return response([createdProject]);
  });
  render(<ModuleWorkspace />);
  const dialog = await openCreateForm();
  fireEvent.click(within(dialog).getByRole("button", { name: "保存项目" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("项目名称已存在");
  expect(within(dialog).getByRole("textbox", { name: /项目名称/ })).toHaveValue(createdProject.name);
  expect(within(dialog).getByRole("button", { name: "保存项目" })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "保存项目" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("combobox", { name: "监控项目" })).toHaveValue(createdProject.id);
  expect(server.mutations.map(({ procedure }) => procedure)).toEqual(["projects.create", "projects.create"]);
});

it("switches the shared shell report tab without creating a run or losing the selected project", async () => {
  const server = installServer(async () => { throw new Error("No mutation expected"); });
  const view = render(<ModuleWorkspace view="monitoring" />);
  await screen.findByText("已有项目", { selector: '[data-testid="selected-project"]' });
  view.rerender(<ModuleWorkspace view="reports" />);
  expect(await screen.findByText("暂无运行报告。完成一次监控后，可在这里查看回答、引用和报告。")).toBeVisible();
  expect(screen.queryByTestId("selected-project")).not.toBeInTheDocument();
  view.rerender(<ModuleWorkspace view="monitoring" />);
  expect(await screen.findByTestId("selected-project")).toHaveTextContent("已有项目");
  expect(server.mutations).toEqual([]);
});
