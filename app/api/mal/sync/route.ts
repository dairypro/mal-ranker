import { getCurrentUser } from "../../../../auth";
import { syncMalList } from "../../../../mal";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  try {
    const result = await syncMalList(user.id);
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return new Response(e?.message ?? "Sync failed", { status: 500 });
  }
}
