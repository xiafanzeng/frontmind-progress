import { z } from "zod";

export const monitorGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().transform((value) => value.trim().replace(/\s+/gu, " "))
    .pipe(z.string().min(1).max(40).refine((value) => value !== "未分组", "请使用其他分组名称")),
}).strict();

/** Project-scoped organization, independent of monitor versions and schedules. */
export const monitorOrganizationSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0).max(2147483647),
  groups: z.array(monitorGroupSchema).max(200),
  membership: z.record(z.string().uuid(), z.string().uuid()),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.groups.map((group) => group.id));
  const names = new Set(value.groups.map((group) => group.name.toLocaleLowerCase()));
  if (ids.size !== value.groups.length || names.size !== value.groups.length) {
    ctx.addIssue({ code: "custom", message: "分组标识和名称不能重复", path: ["groups"] });
  }
  if (Object.keys(value.membership).length > 10000 || Object.values(value.membership).some((id) => !ids.has(id))) {
    ctx.addIssue({ code: "custom", message: "配置归属无效或超过数量限制", path: ["membership"] });
  }
});

export const monitorOrganizationInputSchema = z.object({ projectId: z.string().uuid() }).strict();
export const saveMonitorOrganizationInputSchema = monitorOrganizationInputSchema.extend({ organization: monitorOrganizationSchema });
export type MonitorOrganization = z.infer<typeof monitorOrganizationSchema>;
export type MonitorGroup = z.infer<typeof monitorGroupSchema>;
