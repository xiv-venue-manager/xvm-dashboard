import { EmbedBuilder } from "discord.js"

const XIV_BLUE = 0x00b4ff
const SITE = "https://xivvenuemanager.com"

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
}

function fmtDate(d: Date): string {
  return (
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) +
    " · " +
    fmtTime(d) +
    " ST"
  )
}

function location(v: {
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
}): string {
  return [v.dataCenter, v.world, v.district, v.ward != null ? `W${v.ward}` : null, v.plot != null ? `P${v.plot}` : null]
    .filter(Boolean)
    .join(" · ")
}

export type VenueInfo = {
  name: string
  slug: string
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
}

export function tonightListEmbed(venues: (VenueInfo & { scheduledStart: Date; scheduledEnd: Date })[]) {
  const fields = venues.map((v) => ({
    name: v.name,
    value: `${location(v)}\n[View profile](${SITE}/venues/${v.slug}) · ${fmtTime(v.scheduledStart)} – ${fmtTime(v.scheduledEnd)} ST`,
    inline: false,
  }))

  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle("📅 Venues Open Tonight")
    .setDescription("Here's what's on in the realm this evening:")
    .addFields(fields)
    .setURL(`${SITE}/discover`)
    .setFooter({ text: "XIV Venue Manager · All times in Server Time (UTC)" })
    .setTimestamp()
}

export function newVenueEmbed(venue: VenueInfo) {
  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle("🏛️ New Venue Joined")
    .setDescription(`**${venue.name}** has joined XIV Venue Manager!`)
    .addFields({ name: "Location", value: location(venue), inline: true })
    .setURL(`${SITE}/venues/${venue.slug}`)
    .setFooter({ text: "XIV Venue Manager" })
    .setTimestamp()
}

export function venueGraduationEmbed(venue: VenueInfo, milestone: number) {
  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle("🎉 Milestone Reached!")
    .setDescription(
      `**${venue.name}** just logged their **${milestone.toLocaleString()}th patron visit!** ` +
        `Congratulations to the whole team on this incredible milestone.`
    )
    .setURL(`${SITE}/venues/${venue.slug}`)
    .setFooter({ text: "XIV Venue Manager" })
    .setTimestamp()
}

export function partakeDigestEmbed(
  events: { title: string; startTime: Date; venue: { name: string; slug: string } }[]
) {
  const fields = events.map((e) => ({
    name: e.venue.name,
    value: `[${e.title}](${SITE}/venues/${e.venue.slug}) · ${fmtDate(e.startTime)}`,
    inline: false,
  }))
  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle("📅 Upcoming Events This Week")
    .setDescription("Events from our partner venues on [Partake.gg](https://partake.gg) coming up in the next 7 days:")
    .addFields(fields)
    .setURL(`${SITE}/discover`)
    .setFooter({ text: "XIV Venue Manager · Powered by Partake.gg" })
    .setTimestamp()
}

export function eventsDigestDayEmbed(
  dayLabel: string,
  events: { title: string; startTime: Date; venue: { name: string; slug: string } }[],
  truncatedCount: number
) {
  if (events.length === 0) {
    return new EmbedBuilder()
      .setColor(XIV_BLUE)
      .setTitle(`📅 Events — ${dayLabel}`)
      .setDescription("Nothing scheduled.")
      .setFooter({ text: "XIV Venue Manager · All times Server Time (UTC)" })
      .setTimestamp()
  }

  const fields = events.map((e) => ({
    name: e.venue.name,
    value: `[${e.title}](${SITE}/venues/${e.venue.slug}) · ${fmtTime(e.startTime)} ST`,
    inline: false,
  }))

  const embed = new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle(`📅 Events — ${dayLabel}`)
    .addFields(fields)
    .setFooter({ text: "XIV Venue Manager · All times Server Time (UTC)" })
    .setTimestamp()

  if (truncatedCount > 0) {
    embed.setDescription(`+${truncatedCount} more event${truncatedCount !== 1 ? "s" : ""} today not shown.`)
  }

  return embed
}

export function regionBoardEmbed(
  regionLabel: string,
  openVenues: { venueName: string; dataCenter: string; openedAt: Date }[]
) {
  if (openVenues.length === 0) {
    return new EmbedBuilder()
      .setColor(XIV_BLUE)
      .setTitle(`🟢 What's Happening — ${regionLabel}`)
      .setDescription("No venues currently open in this region.")
      .setFooter({ text: "XIV Venue Manager · Live status" })
      .setTimestamp()
  }

  const lines = [...openVenues]
    .sort((a, b) => a.venueName.localeCompare(b.venueName))
    .map((v) => `🟢 **${v.venueName}** (${v.dataCenter}) — open since ${fmtTime(v.openedAt)} ST`)

  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle(`🟢 What's Happening — ${regionLabel}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "XIV Venue Manager · Live status" })
    .setTimestamp()
}

export function eventLiveEmbed(event: { title: string; startTime: Date; endTime: Date; venue: VenueInfo }) {
  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle("🟢 Now Open")
    .setDescription(`**${event.venue.name}** is open tonight!`)
    .addFields(
      { name: "Event", value: event.title, inline: true },
      { name: "Hours (ST)", value: `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}`, inline: true }
    )
    .setURL(`${SITE}/venues/${event.venue.slug}`)
    .setFooter({ text: "XIV Venue Manager" })
    .setTimestamp()
}

// "What's New?" style manual update post - same shape as the ones already
// posted by hand in #announcements (bold section headers inline in the
// description, no fields). intro is the opening paragraph under the title;
// sections are rendered as **Heading**\nbody, blank-line separated.
export function announcementEmbed(input: {
  title: string
  intro?: string
  sections: { heading: string; body: string }[]
}) {
  const parts = []
  if (input.intro) parts.push(input.intro)
  parts.push(...input.sections.map((s) => `**${s.heading}**\n${s.body}`))

  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle(input.title)
    .setDescription(parts.join("\n\n"))
    .setFooter({ text: "XIV Venue Manager" })
    .setTimestamp()
}
