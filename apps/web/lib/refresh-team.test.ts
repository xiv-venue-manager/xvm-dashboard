import { describe, it, expect, vi } from "vitest"

const next = vi.hoisted(() => ({ tag: vi.fn(), path: vi.fn() }))

vi.mock("next/cache", () => ({ revalidateTag: next.tag, revalidatePath: next.path }))

import { refreshTeamPage } from "./refresh-team"

describe("refreshTeamPage", () => {
  it("expires the team cache tag and the /team page immediately", () => {
    refreshTeamPage()
    expect(next.tag).toHaveBeenCalledWith("team", { expire: 0 })
    expect(next.path).toHaveBeenCalledWith("/team")
  })
})
