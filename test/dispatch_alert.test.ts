import assert from "node:assert/strict";
import test from "node:test";
import { sendWorkOrderAlert } from "../src/work_order_alert.js";
import { createInfraiSms } from "../src/infrai_sms.js";

test("a completed visit includes photo evidence and a follow-up promise", async () => {
  const calls: Array<{ payload: { readonly messages: ReadonlyArray<{ to: string; body: string }> }; key: string }> = [];
  const result = await sendWorkOrderAlert({
    workOrderId: "WO-1042",
    customerPhone: "+15551234567",
    dispatchStatus: "completed",
    photoCount: 3,
    technicianName: "Maya",
    followUpEtaMinutes: 30,
  }, async (payload, key) => {
    calls.push({ payload, key });
    return { accepted: 1 };
  });

  assert.deepEqual(calls, [{
    payload: {
      messages: [{ to: "+15551234567", body: "Work order WO-1042 is complete. 3 work-order photos are recorded. Maya will follow up within 30 minutes." }],
    },
    key: "work-order:WO-1042:completed",
  }]);
  assert.equal(result.dispatchStatus, "completed");
});

test("batch send places idempotency in the request body", async () => {
  const requests: Array<{ headers: Headers; body: unknown }> = [];
  const sender = createInfraiSms("test-key", async (_url, init) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, data: { accepted: 1 } }), { status: 200 });
  });
  await sender.sms.batch.send({ messages: [{ to: "+15551234567", body: "Test" }] }, "work-order:1:completed");
  assert.deepEqual(requests[0]?.body, {
    messages: [{ to: "+15551234567", body: "Test" }],
    idempotency_key: "work-order:1:completed",
  });
  assert.equal(requests[0]?.headers.has("Idempotency-Key"), false);
});
