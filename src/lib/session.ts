export const OWNER_COOKIE = "tamagotchi_owner";

export const ownerCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
  secure: process.env.NODE_ENV === "production",
};
