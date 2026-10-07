import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { linkMyCharacter, listMyCharacters } from "@/lib/api/xvm-api"
import { toCharacterShape } from "@/lib/api/character-shape"
import { validators } from "@/lib/validation"

const linkCharacterSchema = z.object({
  characterName: validators.characterName,
  world: validators.world,
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const characters = await listMyCharacters(token)
    return NextResponse.json({ characters: characters.map(toCharacterShape) })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[user-characters GET] xvm-api error")
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = linkCharacterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const created = await linkMyCharacter(token, {
      character_name: parsed.data.characterName,
      world: parsed.data.world,
    })
    return NextResponse.json({ character: toCharacterShape(created) })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[user-characters POST] xvm-api error")
  }
}
