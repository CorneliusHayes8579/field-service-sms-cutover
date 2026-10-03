import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, infrai } from "./infrai_sms.js";
import { sendWorkOrderAlert } from "./work_order_alert.js";

const port = Number(process.env.PORT ?? 3000);

function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) request.destroy(new Error("Request body is too large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { reject(new SyntaxError("Request body must be JSON")); }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/dispatch-alerts") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }
  if (!infrai) {
    response.writeHead(503).end(JSON.stringify({ error: "INFRAI_API_KEY is required" }));
    return;
  }

  try {
    const body = await readJson(request);
    const sent = await sendWorkOrderAlert(body, infrai.sms.batch.send);
    response.writeHead(202).end(JSON.stringify(sent));
  } catch (error) {
    if (error instanceof ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid work-order alert", issues: error.issues }));
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
    } else {
      response.writeHead(500).end(JSON.stringify({ error: "Alert request failed" }));
    }
  }
});

server.listen(port, () => console.log(`Dispatch alert service listening on http://localhost:${port}`));
