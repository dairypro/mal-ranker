import { prisma } from '../../../prisma';

export async function GET() {
  const row = await prisma.healthcheck.create({ data: {} });

  return Response.json({
    ok: true,
    createdId: row.id,
    createdAt: row.createdAt,
  });
}
