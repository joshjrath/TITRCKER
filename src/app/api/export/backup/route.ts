import { now } from "@/server/clock";
import { buildBackupExport } from "@/server/read-models/export";

import { attachment, authorizeExport, exportFailed, PRIVATE_DOWNLOAD_HEADERS } from "../shared";

export const dynamic = "force-dynamic";

/** GET /api/export/backup — JSON backup (full history incl. deleted/reversed records and the audit trail). */
export async function GET(): Promise<Response> {
  const auth = await authorizeExport();
  if ("response" in auth) return auth.response;
  try {
    const { filename, backup } = await buildBackupExport({ ownerId: auth.owner.ownerId, now: now() });
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        ...PRIVATE_DOWNLOAD_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": attachment(filename),
      },
    });
  } catch (err) {
    return exportFailed("export.backup", err);
  }
}
