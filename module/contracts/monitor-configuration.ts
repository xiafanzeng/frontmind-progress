import { z } from "zod";
import { monitorConfigurationSchema, monitorCreateInputSchema, monitorUpdateInputSchema, monitorDetailOutputSchema, monitorListOutputSchema } from "@frontmind/monitoring-contracts";

// Extend the module-owned boundary without changing the shared vendor contract.
// A save must explicitly name its task brand; never substitute a project default.
export const taskConfigurationSchema = monitorConfigurationSchema.and(z.object({
  mainBrand: z.string().trim().min(1).max(120),
  groupAssignment: z.object({ groupId: z.string().uuid().nullable(), revision: z.number().int().min(0).max(2147483646) }).optional(),
}));
export type TaskConfiguration = z.infer<typeof taskConfigurationSchema>;
export const taskCreateInputSchema = monitorCreateInputSchema.extend({ configuration: taskConfigurationSchema });
export const taskUpdateInputSchema = monitorUpdateInputSchema.extend({ configuration: taskConfigurationSchema });
export const taskDetailOutputSchema = monitorDetailOutputSchema.extend({ mainBrand: z.string() });
export const taskListOutputSchema = monitorListOutputSchema.extend({ mainBrand: z.string().nullable() });
