import { getCurrentUser } from "../../../../auth";
import { syncMalList } from "../../../../mal";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Sync failed";
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  try {
    const result = await syncMalList(user.id);
    return Response.json({ ok: true, ...result });
  } catch (error: unknown) {
    return new Response(getErrorMessage(error), { status: 500 });
  }
}
