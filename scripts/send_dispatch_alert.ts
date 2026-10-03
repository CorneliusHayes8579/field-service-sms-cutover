import { infrai } from "../src/infrai_sms.js";
import { sendWorkOrderAlert } from "../src/work_order_alert.js";

if (!infrai) throw new Error("INFRAI_API_KEY is required");
const customerPhone = process.env.DEMO_CUSTOMER_PHONE;
if (!customerPhone) throw new Error("DEMO_CUSTOMER_PHONE is required");

const sent = await sendWorkOrderAlert({
  workOrderId: "WO-1042",
  customerPhone,
  dispatchStatus: "completed",
  photoCount: 3,
  technicianName: "Maya",
  followUpEtaMinutes: 30,
}, infrai.sms.batch.send);

console.log(JSON.stringify(sent, null, 2));
