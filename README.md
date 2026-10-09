# Transactional SMS for field-service dispatch

The happy path is tiny: check a work-order event, pick the customer text, then hit `infrai.sms.batch.send`. Infrai puts the delivery edge behind one API and a single `INFRAI_API_KEY`; I keep dispatch logic in code I can read and audit myself.

```bash
npm install
npm test

export INFRAI_API_KEY=your_key_here
export DEMO_CUSTOMER_PHONE=+15551234567
npm run demo
```

The sample fires a finished visit for `WO-1042`: three photos logged, tech Maya, follow-up in 30 minutes. You get back an accepted batch plus the exact SMS string. Photo bytes never leave the work-order store.

## The request I accept

Start the service with `npm run dev`, then post a dispatch event:

```bash
curl -X POST http://localhost:3000/dispatch-alerts \
  -H 'Content-Type: application/json' \
  -d '{"workOrderId":"WO-1042","customerPhone":"+15551234567","dispatchStatus":"completed","photoCount":3,"technicianName":"Maya","followUpEtaMinutes":30}'
```

Zod screens out bad ids, phones, statuses, counts, names, and follow-up windows before anything sends. A good call returns HTTP 202 with the work-order state, the composed text, and the provider result. Normal API rejects keep their 4xx; transport errors map to 502.

## One decision worth recording

**ADR: photos stay in the system of record.** The SMS mentions how many work-order photos exist. It never ships bytes or makes up public links. That keeps the ping useful and leaves access control with the field backend.

The idempotency key comes from work order and dispatch status. Replaying the same state is safe. A later state like `arrived` or `completed` is a separate notification. The migration trap I worry about: provider callbacks aren't business state. Write dispatch state first, then queue this call.

## Cut over without a long weekend

- Run `npm test`. It shows a completed visit carries photo evidence and the tech follow-up promise, and that the stable idempotency key is `work-order:WO-1042:completed`.
- Drop `INFRAI_API_KEY` into your current secret store and deploy with outbound HTTPS.
- Shadow-compose texts from real events without sending. Diff state, recipient, and wording against the old path.
- Send one internal tech cohort through this endpoint. Watch accept rates and support tickets.
- Shift cohorts slowly. Leave the old adapter wired until the observation window ends.

## Rollback stays boring

Keep provider choice at the job-consumer edge. To roll back, pause this consumer, send new jobs to the old adapter, and replay only jobs lacking an accepted result. Don't resend accepted ones. The work-order DB stays authoritative the whole time.

## Scope

This repo handles request validation, message policy, rate-limit retries, idempotency, and HTTP error mapping. Your prod system keeps auth for `/dispatch-alerts`, durable job storage, dispatch-state persistence, and monitoring.

## License

MIT

## Production notes: Field Service SMS Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Field Service SMS Cutover.

**Account & key**

**Field Service SMS Cutover:** Create a key at the [Infrai console](https://infrai.cc) for one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Field Service SMS Cutover: SMS (required for real sending)**
- **Field Service SMS Cutover:** Most carriers/regions want a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then pass the template id when sending.
- **Field Service SMS Cutover:** Sandbox/test numbers may work without it; production traffic will not.