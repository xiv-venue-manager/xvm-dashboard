import type { Metadata } from "next"
import { Inter, Outfit, Cinzel, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/navbar"
import { SessionProvider } from "@/components/session-provider"
import { VenueProvider } from "@/components/venue-context"
import { SidebarProvider } from "@/components/sidebar-context"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
})

const cinzel = Cinzel({
  variable: "--font-cinzel-var",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
})

export const dynamic = "force-dynamic"

const SITE_URL = "https://xivvenuemanager.com"
const SITE_DESC =
  "Free venue management for FFXIV roleplay venues. Track events, manage staff, log sales and go live from the web or inside the game."

export const metadata: Metadata = {
  title: { default: "XIV Venue Manager - Free FFXIV Venue Management", template: "%s | XIV Venue Manager" },
  description: SITE_DESC,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: "XIV Venue Manager",
    title: "XIV Venue Manager",
    description: SITE_DESC,
    url: SITE_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "XIV Venue Manager" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "XIV Venue Manager",
    description: SITE_DESC,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-2048x2048.png", sizes: "2048x2048", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${cinzel.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased font-sans">
        <SessionProvider>
          <TooltipProvider>
            <SidebarProvider>
              <VenueProvider>
                {/* Skip Navigation Link for Accessibility */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  Skip to main content
                </a>
                <Navbar />
                <main id="main-content">{children}</main>
              </VenueProvider>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "rgba(7,11,20,0.95)",
                border: "1px solid var(--blue-020)",
                color: "var(--foreground)",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  )
}
