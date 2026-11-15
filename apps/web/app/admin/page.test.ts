import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  isAdmin: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/admin-access", () => ({ isPlatformAdmin: m.isAdmin }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    m.redirect(url)
    throw new Error("NEXT_REDIRECT")
  },
}))

import AdminHomePage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.isAdmin.mockResolvedValue(true)
})

const render = async () => renderToStaticMarkup(await AdminHomePage())

describe("/admin landing page", () => {
  it("lists every admin page for a platform admin", async () => {
    const html = await render()
    for (const href of ["/admin/announcements", "/admin/feedback", "/admin/reaction-role-templates", "/admin/team"]) {
      expect(html).toContain(`href="${href}"`)
    }
    expect(m.isAdmin).toHaveBeenCalledWith("u1")
  })

  it("shows a signed-in person who is not an admin the refusal and none of the links", async () => {
    m.isAdmin.mockResolvedValue(false)
    const html = await render()
    expect(html).toContain("This page is for platform admins.")
    expect(html).not.toContain("/admin/")
  })

  it("sends a signed-out visitor to sign in without asking about admin rights", async () => {
    m.session.mockResolvedValue(null)
    await expect(AdminHomePage()).rejects.toThrow("NEXT_REDIRECT")
    expect(m.redirect).toHaveBeenCalledWith("/auth/signin")
    expect(m.isAdmin).not.toHaveBeenCalled()
  })
})
