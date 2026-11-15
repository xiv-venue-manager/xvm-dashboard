import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronRight, MessageSquare, Megaphone, ShieldCheck, SmilePlus, Users, type LucideIcon } from "lucide-react"
import { authOptions } from "@/lib/auth"

interface AdminPage {
  href: string
  title: string
  description: string
  icon: LucideIcon
}

const ADMIN_PAGES: AdminPage[] = [
  { href: "/admin/announcements", title: "Announcements", description: "Broadcast feature updates and news to all logged-in users.", icon: Megaphone },
  { href: "/admin/feedback", title: "Feedback", description: "Review and manage user feedback submissions.", icon: MessageSquare },
  { href: "/admin/reaction-role-templates", title: "Reaction Role Templates", description: "The shared catalog every venue picks from under Reaction Roles.", icon: SmilePlus },
  { href: "/admin/team", title: "Team", description: "Who is on the Meet the team page, and how they are grouped.", icon: Users },
]

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  return (
    <div className="page-inner max-w-3xl mx-auto">
      <h1 className="page-h1 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-[var(--xiv-blue)]" />
        Admin
      </h1>
      <p className="text-muted-foreground mt-1 mb-8 text-sm">Platform-wide tools. These need platform admin access.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_PAGES.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="xiv-card rounded-xl p-5 flex items-start gap-3 transition-colors hover:bg-[var(--blue-007)]">
            <Icon className="h-5 w-5 mt-0.5 shrink-0 text-[var(--xiv-blue)]" />
            <div className="flex-1">
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  )
}
