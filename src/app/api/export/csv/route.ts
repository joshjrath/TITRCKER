import { now } from "@/server/clock";
import { buildCsvExport } from "@/server/read-models/export";

import { attachment, authorizeExport, exportFailed, PRIVATE_DOWNLOAD_HEADERS } from "../shared";

/** GET /api/export/csv — full reconciliation CSV of the signed-in owner's ledger (UTF-8 with BOM for Excel). */
export async function GET(): Promise<Response> {
  const auth = await authorizeExport();
  if ("response" in auth) return auth.response;
  try {
    const { filename, body } = await buildCsvExport({ ownerId: auth.owner.ownerId, now: now() });
    return new Response(body, {
      status: 200,
      headers: {
        ...PRIVATE_DOWNLOAD_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": attachment(filename),
      },
    });
  } catch (err) {
    return exportFailed("export.csv", err);
  }
}
