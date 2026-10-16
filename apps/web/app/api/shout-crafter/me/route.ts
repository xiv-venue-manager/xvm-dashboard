import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { myVenues } from "@/lib/api/venue-access"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return cors(NextResponse.json({ user: null }, { status: 200 }))
  }

  const namedVenues = (await myVenues(session.user.id).catch(() => []))
    .filter((v) => v.role === "OWNER")
    .map(({ id, slug, name }) => ({ id, slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return cors(
    NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image,
      },
      venues: namedVenues,
    })
  )
}
