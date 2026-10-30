import Link from "next/link"
import Image from "next/image"

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--blue-008)]">
      <div className="container mx-auto px-4 pt-12 pb-8">
        {/* 4-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-10">
          {/* Brand col */}
          <div>
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Image src="/xiv-icon.png" alt="" width={28} height={28} className="object-contain" />
              <span className="font-cinzel font-bold tracking-wide text-sm">
                <span className="text-xiv">XIV</span> <span className="text-foreground/80">Venue Manager</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px]">
              The all-in-one toolset for running roleplay venues in Final Fantasy XIV.
            </p>
            <Link
              href="https://ko-fi.com/ehnocure"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--support-pink)] hover:text-pink-300 transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z" />
              </svg>
              Support on Ko-fi
            </Link>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Product</h3>
            <div className="space-y-2.5">
              {[
                { label: "Features", href: "/#features" },
                { label: "How it works", href: "/#how" },
                { label: "Dashboard", href: "/dashboard" },
                { label: "Discover venues", href: "/discover" },
                { label: "Usage stats", href: "/stats" },
                { label: "Meet the team", href: "/team" },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Resources</h3>
            <div className="space-y-2.5">
              {[
                { label: "Getting started", href: "/guide/getting-started" },
                { label: "Running events", href: "/guide/events" },
                { label: "Promoting your venue", href: "/guide/promoting" },
                { label: "Managing staff", href: "/guide/staff-management" },
                { label: "Owner guide", href: "/guide/owner" },
                { label: "Staff guide", href: "/guide/staff" },
                { label: "FAQ", href: "/guide/owner#faq" },
                { label: "Privacy policy", href: "/privacy" },
                { label: "Terms of use", href: "/terms" },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Community</h3>
            <div className="space-y-2.5">
              {[
                { label: "Discord", href: "https://discord.gg/AN5VDNSe2A" },
                { label: "GitHub", href: "https://github.com/BluntEXE/ffxiv-venue-manager" },
                { label: "Partake.gg", href: "https://partake.gg" },
                { label: "Ko-fi", href: "https://ko-fi.com/ehnocure" },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer bottom */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[var(--blue-008)]">
          <p className="text-[0.72rem] text-[var(--fg-faint)] leading-relaxed text-center sm:text-left max-w-[52ch]">
            &copy; {new Date().getFullYear()} XIV Venue Manager. A community fan tool, not affiliated with SQUARE ENIX
            CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
          </p>
          <div className="flex items-center gap-2">
            {[
              {
                href: "https://discord.gg/AN5VDNSe2A",
                label: "Discord",
                path: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.7.4 3 1 4.2 1.8a16.5 16.5 0 0 0-14.6 0C6 4.5 7.3 3.9 9 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1 8.9.2 13.3.6 17.6a19.9 19.9 0 0 0 6 3l.8-1.3c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l.8 1.3a19.9 19.9 0 0 0 6-3c.5-5-.7-9.4-3.4-13.2ZM8.9 15c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z",
              },
              {
                href: "https://github.com/BluntEXE/ffxiv-venue-manager",
                label: "GitHub",
                path: "M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
              },
              {
                href: "https://ko-fi.com/ehnocure",
                label: "Ko-fi",
                path: "M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z",
              },
            ].map(({ href, label, path }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="w-9 h-9 rounded-lg border border-[var(--blue-015)] flex items-center justify-center text-muted-foreground hover:text-[var(--xiv-blue)] hover:border-[var(--blue-035)] transition-colors"
              >
                <svg className="w-[17px] h-[17px] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
