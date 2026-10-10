import { Breadcrumb } from "@/components/breadcrumb"
import { PluginLinkCard } from "@/components/plugin-link-card"

export default function PluginPage() {
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Plugin" }]} />

      <div className="mb-6 md:mb-8">
        <h1 className="page-h1">Plugin</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
          Link the Venue Manager Dalamud plugin to your account with a one-time code.
        </p>
      </div>

      <PluginLinkCard />
    </div>
  )
}
