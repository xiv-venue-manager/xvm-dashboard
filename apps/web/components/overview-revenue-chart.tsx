"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface EventRevenue {
  label: string
  revenue: number
  isToday: boolean
}

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--blue-020)] bg-[#0a0f1e] px-3 py-2 shadow-xl text-sm">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="text-[var(--xiv-blue)] font-semibold">{payload[0].value.toLocaleString("en-US")} gil</p>
    </div>
  )
}

export function OverviewRevenueChart({ data }: { data: EventRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={160} minWidth={0}>
      <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(0,180,255,0.04)" }} />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.isToday ? "var(--xiv-blue)" : "rgba(0,180,255,0.35)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
