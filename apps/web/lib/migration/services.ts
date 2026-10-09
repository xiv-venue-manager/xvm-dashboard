import { gilToMinorUnits } from "../api/position-convert"

export interface ExportedService {
  id: string
  venueId: string
  name: string
  description: string | null
  price: number
  category: string | null
  isActive: boolean
  linkedItemId: number | null
  linkedItemName: string | null
  linkedItemIcon: number | null
  stockCount: number | null
  createdAt: string
  roleIds: string[]
}

export interface ServicesExport {
  services: ExportedService[]
}

export interface CategoryRow {
  key: string
  venue_key: string
  name: string
}

export interface ServiceRow {
  key: string
  venue_key: string
  category_key: string | null
  name: string
  description: string | null
  price_minor: number
  is_active: boolean
  created_at: string
}

export interface ServicePositionRow {
  service_key: string
  position_key: string
}

export interface ServiceInventoryRow {
  service_key: string
  linked_item_id: number
  linked_item_name: string | null
  linked_item_icon: number | null
  stock_count: number | null
}

export interface ServicesResult {
  categories: CategoryRow[]
  services: ServiceRow[]
  servicePositions: ServicePositionRow[]
  inventories: ServiceInventoryRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_NAME = 100
const MAX_CATEGORY = 50

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapServices(source: ServicesExport, positionVenues: ReadonlyMap<string, string>): ServicesResult {
  const result: ServicesResult = { categories: [], services: [], servicePositions: [], inventories: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const categoryKeys = new Map<string, string>()
  const takenNames = new Set<string>()
  const rows = [...source.services].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  for (const service of rows) {
    const name = squash(service.name)
    if (!name) {
      skip(service.id, "blank name")
      continue
    }
    if (name.length > MAX_NAME) {
      skip(service.id, `name over ${MAX_NAME} characters`)
      continue
    }
    if (service.price < 0) {
      skip(service.id, "negative price")
      continue
    }
    const identity = `${service.venueId}|${name.toLowerCase()}`
    if (takenNames.has(identity)) {
      skip(service.id, "same name as an earlier service at this venue, ignoring case")
      continue
    }
    takenNames.add(identity)

    if (!Number.isInteger(service.price)) warn(service.id, `price ${service.price} rounded to a whole gil`)

    let categoryKey: string | null = null
    const rawCategory = service.category === null ? "" : squash(service.category)
    if (rawCategory) {
      let category = rawCategory
      if (category.length > MAX_CATEGORY) {
        category = category.slice(0, MAX_CATEGORY)
        warn(service.id, `category cut to ${MAX_CATEGORY} characters`)
      }
      categoryKey = `${service.venueId}|${category.toLowerCase()}`
      if (!categoryKeys.has(categoryKey)) {
        categoryKeys.set(categoryKey, category)
        result.categories.push({ key: categoryKey, venue_key: service.venueId, name: category })
      }
    }

    result.services.push({
      key: service.id,
      venue_key: service.venueId,
      category_key: categoryKey,
      name,
      description: service.description === null ? null : service.description.trim() || null,
      price_minor: gilToMinorUnits(service.price) as number,
      is_active: service.isActive,
      created_at: service.createdAt,
    })

    for (const roleId of new Set(service.roleIds)) {
      const venue = positionVenues.get(roleId)
      if (venue === undefined) {
        skip(`${service.id}:${roleId}`, "position was not loaded")
      } else if (venue !== service.venueId) {
        skip(`${service.id}:${roleId}`, "position belongs to another venue")
      } else {
        result.servicePositions.push({ service_key: service.id, position_key: roleId })
      }
    }

    if (service.linkedItemId === null) {
      if (service.stockCount !== null) {
        skip(`${service.id}:inventory`, "stock count without a linked item, xvm-api inventory needs an FFXIV item")
      }
      continue
    }

    let itemName = service.linkedItemName === null ? null : squash(service.linkedItemName) || null
    if (itemName !== null && itemName.length > MAX_NAME) {
      itemName = itemName.slice(0, MAX_NAME)
      warn(service.id, `linked item name cut to ${MAX_NAME} characters`)
    }
    let stock = service.stockCount
    if (stock !== null && stock < 0) {
      warn(service.id, `negative stock count ${stock}, stored as not counted`)
      stock = null
    }
    result.inventories.push({
      service_key: service.id,
      linked_item_id: service.linkedItemId,
      linked_item_name: itemName,
      linked_item_icon: service.linkedItemIcon,
      stock_count: stock,
    })
  }

  return result
}
