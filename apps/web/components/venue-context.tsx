"use client"

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from "react"
import { useSession } from "next-auth/react"

interface Venue {
  id: string
  name: string
  slug: string
  dataCenter?: string
  world?: string
  memberships?: Array<{ role: string }>
}

interface VenueContextValue {
  venues: Venue[]
  isLoading: boolean
  error: string | null
  hasFetched: boolean
  fetchVenues: () => Promise<void>
  refetchVenues: () => Promise<void>
  getVenueBySlug: (slug: string) => Venue | undefined
  invalidateCache: () => void
}

const VenueContext = createContext<VenueContextValue | undefined>(undefined)

interface VenueProviderProps {
  children: ReactNode
}

export function VenueProvider({ children }: VenueProviderProps) {
  const { status } = useSession()
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const loadVenues = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/venues")

      if (!response.ok) {
        throw new Error("Failed to fetch venues")
      }

      const data = await response.json()
      setVenues(data)
      setHasFetched(true)
    } catch (error: unknown) {
      console.error("Failed to fetch venues:", error)
      setError(error instanceof Error ? error.message : "Failed to load venues")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchVenues = useCallback(async () => {
    // If already fetched, don't fetch again
    if (hasFetched && venues.length > 0) {
      return
    }

    await loadVenues()
  }, [hasFetched, venues.length, loadVenues])

  const getVenueBySlug = useCallback(
    (slug: string) => {
      return venues.find((v) => v.slug === slug)
    },
    [venues]
  )

  const invalidateCache = useCallback(() => {
    setVenues([])
    setHasFetched(false)
  }, [])

  // Auto-fetch on mount once authenticated. Skipping on the public landing
  // page avoids a wasted /api/venues call that returns 401 (or HTML at the
  // edge) and pollutes the console.
  useEffect(() => {
    if (status === "authenticated" && !hasFetched) {
      // Genuine data fetch (sets loading/error/venues state), not derivable from props/state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchVenues()
    }
  }, [status, hasFetched, fetchVenues])

  return (
    <VenueContext.Provider
      value={{
        venues,
        isLoading,
        error,
        hasFetched,
        fetchVenues,
        refetchVenues: loadVenues,
        getVenueBySlug,
        invalidateCache,
      }}
    >
      {children}
    </VenueContext.Provider>
  )
}

export function useVenues() {
  const context = useContext(VenueContext)
  if (context === undefined) {
    throw new Error("useVenues must be used within a VenueProvider")
  }
  return context
}
