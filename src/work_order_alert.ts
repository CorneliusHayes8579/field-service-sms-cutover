import { z } from "zod";
import type { BatchSendResult } from "./infrai_sms.js";

export const workOrderAlertSchema = z.object({
  workOrderId: z.string().trim().min(1).max(64),
  customerPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  dispatchStatus: z.enum(["assigned", "en_route", "arrived", "completed"]),
  photoCount: z.number().int().min(0).max(50),
  technicianName: z.string().trim().min(1).max(60),
  followUpEtaMinutes: z.number().int().min(0).max(1_440),
});

export type WorkOrderAlert = z.infer<typeof workOrderAlertSchema>;
export type SmsSender = (
  payload: Readonly<{ messages: ReadonlyArray<{ to: string; body: string }> }>,
  idempotencyKey: string,
) => Promise<BatchSendResult>;

const statusCopy: Record<WorkOrderAlert["dispatchStatus"], string> = {
  assigned: "has been assigned",
  en_route: "is on the way",
  arrived: "has arrived",
  completed: "is complete",
};

export function composeDispatchText(alert: WorkOrderAlert): string {
  const photoNote = alert.photoCount === 1
    ? "1 work-order photo is recorded."
    : `${alert.photoCount} work-order photos are recorded.`;
  const followUp = alert.dispatchStatus === "completed"
    ? `${alert.technicianName} will follow up within ${alert.followUpEtaMinutes} minutes.`
    : `Technician: ${alert.technicianName}.`;
  return `Work order ${alert.workOrderId} ${statusCopy[alert.dispatchStatus]}. ${photoNote} ${followUp}`;
}

export async function sendWorkOrderAlert(input: unknown, send: SmsSender) {
  const alert = workOrderAlertSchema.parse(input);
  const text = composeDispatchText(alert);
  const result = await send({ messages: [{ to: alert.customerPhone, body: text }] }, `work-order:${alert.workOrderId}:${alert.dispatchStatus}`);
  return { workOrderId: alert.workOrderId, dispatchStatus: alert.dispatchStatus, text, result };
}
