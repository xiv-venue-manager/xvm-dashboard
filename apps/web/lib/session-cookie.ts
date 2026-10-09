export const SESSION_COOKIE_SECURE = process.env.NODE_ENV === "production"
export const SESSION_COOKIE_NAME = `${SESSION_COOKIE_SECURE ? "__Secure-" : ""}next-auth.session-token`
