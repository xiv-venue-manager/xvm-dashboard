import { gilToMinorUnits, hoursToMinutes } from "../api/position-convert"

export interface ExportedTransaction {
  id: string
  venueId: string
  eventId: string | null
  serviceId: string | null
  serviceName: string | null
  staffId: string | null
  type: "SALE" | "TIP" | "COVER_CHARGE" | "OTHER"
  amount: number
  customerName: string | null
  notes: string | null
  createdAt: string
}

export interface ExportedPayroll {
  id: string
  venueId: string
  membershipId: string | null
  isManualEntry: boolean
  manualEntryName: string | null
  paymentType: "FIXED_SALARY" | "HOURLY" | "POT_SHARE" | "CONTRACTOR_PAYOUT"
  baseRate: number
  hoursWorked: number | null
  bonusAmount: number | null
  totalAmount: number
  periodStart: string
  periodEnd: string
  isPaid: boolean
  paidAt: string | null
  paidBy: string | null
  notes: string | null
  potDistributionId: string | null
  createdAt: string
  updatedAt: string
}

export interface FinanceExport {
  transactions: ExportedTransaction[]
  payroll: ExportedPayroll[]
}

export interface FinanceContext {
  personKeys: ReadonlySet<string>
  memberships: ReadonlyMap<string, { venue: string; person: string }>
  eventKeys: ReadonlySet<string>
  serviceKeys: ReadonlySet<string>
}

export interface TransactionRow {
  key: string
  venue_key: string
  event_key: string | null
  service_key: string | null
  service_name: string | null
  membership_key: string | null
  recorded_by_person_key: string | null
  kind: "sale" | "tip" | "cover_charge" | "other_income"
  amount: number
  customer_name: string | null
  notes: string | null
  status: "posted"
  created_at: string
  posted_at: string
}

export interface PayrollRow {
  key: string
  venue_key: string
  membership_key: string | null
  person_key: string
  payment_type: "fixed_salary" | "hourly" | "pot_share" | "contractor_payout"
  base_rate_minor: number
  minutes_worked: number | null
  bonus_amount_minor: number | null
  total_amount_minor: number
  period_start: string
  period_end: string
  paid_by_person_key: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceResult {
  transactions: TransactionRow[]
  payroll: PayrollRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const KINDS: Record<ExportedTransaction["type"], TransactionRow["kind"]> = {
  SALE: "sale",
  TIP: "tip",
  COVER_CHARGE: "cover_charge",
  OTHER: "other_income",
}
const MAX_CUSTOMER = 32
const MAX_TX_NOTES = 200
const MAX_PAYROLL_NOTES = 250
const MAX_NAME = 100
const DAY_MS = 24 * 60 * 60 * 1000

const squash = (value: string) => value.trim().replace(/\s+/g, " ")
export const payeeKey = (name: string) => `payee:${squash(name).slice(0, MAX_NAME).toLowerCase()}`

export function mapFinance(source: FinanceExport, ctx: FinanceContext): FinanceResult {
  const result: FinanceResult = { transactions: [], payroll: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const membershipFor = new Map<string, string>()
  for (const [key, m] of ctx.memberships) membershipFor.set(`${m.venue}|${m.person}`, key)

  for (const t of [...source.transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (t.amount <= 0) {
      skip(t.id, "amount is not positive")
      continue
    }
    if (!Number.isInteger(t.amount)) warn(t.id, `amount ${t.amount} rounded to a whole gil`)

    const person = t.staffId !== null && ctx.personKeys.has(t.staffId) ? t.staffId : null
    if (t.staffId !== null && person === null) warn(t.id, "staff member was not loaded, left empty")

    let eventKey: string | null = null
    if (t.eventId !== null) {
      if (ctx.eventKeys.has(t.eventId)) eventKey = t.eventId
      else warn(t.id, "event was not loaded, left empty")
    }
    const serviceKey = t.serviceId !== null && ctx.serviceKeys.has(t.serviceId) ? t.serviceId : null

    let customer = t.customerName === null ? null : squash(t.customerName) || null
    if (customer !== null && customer.length > MAX_CUSTOMER) {
      customer = customer.slice(0, MAX_CUSTOMER)
      warn(t.id, `customer name cut to ${MAX_CUSTOMER} characters`)
    }
    let notes = t.notes === null ? null : t.notes.trim() || null
    if (notes !== null && notes.length > MAX_TX_NOTES) {
      notes = notes.slice(0, MAX_TX_NOTES)
      warn(t.id, `notes cut to ${MAX_TX_NOTES} characters`)
    }

    result.transactions.push({
      key: t.id,
      venue_key: t.venueId,
      event_key: eventKey,
      service_key: serviceKey,
      service_name: t.serviceName === null ? null : squash(t.serviceName).slice(0, MAX_NAME) || null,
      membership_key: person === null ? null : (membershipFor.get(`${t.venueId}|${person}`) ?? null),
      recorded_by_person_key: person,
      kind: KINDS[t.type],
      amount: gilToMinorUnits(t.amount) as number,
      customer_name: customer,
      notes,
      status: "posted",
      created_at: t.createdAt,
      posted_at: t.createdAt,
    })
  }

  let roundedHours = 0
  let roundedGil = 0
  let fixedPeriods = 0

  for (const p of [...source.payroll].sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id))) {
    if (p.isPaid && p.paymentType === "HOURLY" && p.totalAmount === 0) {
      skip(p.id, "paid hourly entry with a total of 0")
      continue
    }

    let personKey: string
    let membershipKey: string | null = null
    if (p.membershipId !== null) {
      const m = ctx.memberships.get(p.membershipId)
      if (!m || m.venue !== p.venueId) {
        skip(p.id, "membership was not loaded")
        continue
      }
      membershipKey = p.membershipId
      personKey = m.person
    } else if (p.isManualEntry && p.manualEntryName !== null && squash(p.manualEntryName)) {
      personKey = payeeKey(p.manualEntryName)
    } else {
      skip(p.id, "no membership and no payee name")
      continue
    }

    const money = [p.baseRate, p.totalAmount, p.bonusAmount ?? 0]
    if (money.some((v) => !Number.isInteger(v))) roundedGil++

    const hourly = p.paymentType === "HOURLY"
    let minutes: number | null = null
    if (hourly && p.hoursWorked !== null) {
      minutes = hoursToMinutes(p.hoursWorked)
      if (Math.abs(p.hoursWorked * 60 - Math.round(p.hoursWorked * 60)) > 1e-6) roundedHours++
    } else if (!hourly && p.hoursWorked !== null) {
      warn(p.id, "hours worked on a non-hourly entry dropped")
    }

    let periodEnd = p.periodEnd
    if (new Date(p.periodEnd).getTime() <= new Date(p.periodStart).getTime()) {
      periodEnd = new Date(new Date(p.periodStart).getTime() + DAY_MS).toISOString()
      fixedPeriods++
    }

    if (p.potDistributionId !== null) warn(p.id, "pot distribution link dropped, none were loaded")
    let notes = p.notes === null ? null : p.notes.trim() || null
    if (notes !== null && notes.length > MAX_PAYROLL_NOTES) {
      notes = notes.slice(0, MAX_PAYROLL_NOTES)
      warn(p.id, `notes cut to ${MAX_PAYROLL_NOTES} characters`)
    }
    const payer = p.paidBy !== null && ctx.personKeys.has(p.paidBy) ? p.paidBy : null

    result.payroll.push({
      key: p.id,
      venue_key: p.venueId,
      membership_key: membershipKey,
      person_key: personKey,
      payment_type: p.paymentType.toLowerCase() as PayrollRow["payment_type"],
      base_rate_minor: gilToMinorUnits(p.baseRate) as number,
      minutes_worked: minutes,
      bonus_amount_minor: gilToMinorUnits(p.bonusAmount),
      total_amount_minor: gilToMinorUnits(p.totalAmount) as number,
      period_start: p.periodStart,
      period_end: periodEnd,
      paid_by_person_key: p.isPaid ? payer : null,
      paid_at: p.isPaid ? (p.paidAt ?? p.updatedAt) : null,
      notes,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })
  }

  if (roundedGil > 0) warn("payroll", `${roundedGil} entries had a fractional gil amount rounded to a whole gil`)
  if (roundedHours > 0) warn("payroll", `${roundedHours} hourly entries had hours rounded to whole minutes, the stored total is kept unchanged`)
  if (fixedPeriods > 0) warn("payroll", `${fixedPeriods} entries had a period that did not end after it started, period end set to start plus one day`)

  return result
}
