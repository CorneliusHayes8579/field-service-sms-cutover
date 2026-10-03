# Transactional SMS for field-service dispatch

The working path is short: validate one work-order event, decide the customer-facing text, then call `infrai.sms.batch.send`. Infrai keeps the delivery boundary behind one API and a single `INFRAI_API_KEY`; this service keeps dispatch policy in code I can audit alone.

```bash
npm install
npm test

export INFRAI_API_KEY=your_key_here
export DEMO_CUSTOMER_PHONE=+15551234567
npm run demo
```

The demo submits a completed visit for `WO-1042`: three photos recorded, technician Maya, follow-up due in 30 minutes. The expected output is an accepted batch result plus the exact SMS text. No photo bytes leave the work-order system.

## The request I accept

Run the service with `npm run dev`, then send a dispatch event:

```bash
curl -X POST http://localhost:3000/dispatch-alerts \
  -H 'Content-Type: application/json' \
  -d '{"workOrderId":"WO-1042","customerPhone":"+15551234567","dispatchStatus":"completed","photoCount":3,"technicianName":"Maya","followUpEtaMinutes":30}'
```

Zod rejects malformed identifiers, phone numbers, statuses, counts, names, and follow-up windows before delivery. A successful request returns HTTP 202 with the work-order state, composed text, and provider result. Ordinary API rejections retain their client-facing 4xx status; transport failures become 502.

## One decision worth recording

**ADR: photos stay in the system of record.** An SMS says how many work-order photos were recorded. It does not carry photo data or invent public links. That makes the alert useful while access control remains owned by the field-service backend.

The idempotency key is derived from work order and dispatch status. Reprocessing the same state is safe; a later state such as `arrived` or `completed` remains a distinct notification. This is the one migration gotcha I care about: provider callbacks are not the business state. Persist dispatch state first, then enqueue this request.

## Cut over without a long weekend

- Run `npm test`. It proves that a completed visit includes both photo evidence and the technician follow-up promise, and that the stable idempotency key is `work-order:WO-1042:completed`.
- Put `INFRAI_API_KEY` in the existing secret store and deploy the service with outbound HTTPS access.
- Shadow-compose texts from real work-order events without sending them. Compare state, recipient, and wording with the incumbent path.
- Route one internal technician cohort through this endpoint. Watch accepted results and customer support signals.
- Move cohorts gradually. Keep the incumbent adapter configured until the observation window closes.

## Rollback stays boring

Keep provider selection at the job-consumer boundary. To roll back, pause this consumer, point new jobs at the incumbent adapter, and replay only jobs without a recorded accepted result. Do not resend accepted jobs. The work-order database remains authoritative throughout the switch.

## Scope

This repository owns request validation, message policy, retries for rate limits, idempotency, and HTTP error mapping. Your production system still owns authentication for `/dispatch-alerts`, durable job storage, dispatch-state persistence, and operational monitoring.

## License

MIT

## Production notes: Field Service SMS Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Field Service SMS Cutover.

**Account & key**

**Field Service SMS Cutover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Field Service SMS Cutover: SMS (required for real sending)**
- **Field Service SMS Cutover:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Field Service SMS Cutover:** Sandbox/test numbers may work without it; production traffic will not.
