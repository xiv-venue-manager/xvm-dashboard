export interface XivAuthNotice {
  tone: "success" | "error"
  message: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeXivAuthResult(search: string): XivAuthNotice | null {
  const params = new URLSearchParams(search)
  const status = params.get("xivauth")
  if (!status) return null
  const count = (key: string) => Number(params.get(key)) || 0

  switch (status) {
    case "done": {
      const verified = count("verified")
      const transferred = count("transferred")
      const conflicts = count("conflicts")
      const total = verified + transferred
      if (total === 0) {
        return { tone: "error", message: `None could be verified. ${conflicts} ${conflicts === 1 ? "is" : "are"} held by another account, or share a name with one.` }
      }
      const parts = [`Verified ${plural(total, "character", "characters")}.`]
      if (transferred > 0) {
        parts.push(`${transferred} ${transferred === 1 ? "was" : "were"} taken over from an account that had linked ${transferred === 1 ? "it" : "them"} without proof.`)
      }
      if (conflicts > 0) {
        parts.push(`${conflicts} could not be verified because ${conflicts === 1 ? "it is" : "they are"} held by another account, or share${conflicts === 1 ? "s" : ""} a name with one.`)
      }
      return { tone: "success", message: parts.join(" ") }
    }
    case "denied":
      return { tone: "error", message: "You did not allow access on XIV Auth, so nothing was verified." }
    case "none":
      return { tone: "error", message: "XIV Auth did not share any characters. Share at least one verified character there and try again." }
    case "state":
      return { tone: "error", message: "That sign-in expired or did not start here. Please try again." }
    case "unavailable":
      return { tone: "error", message: "Verification with XIV Auth is not set up yet." }
    default:
      return { tone: "error", message: "Something went wrong talking to XIV Auth. Please try again." }
  }
}
