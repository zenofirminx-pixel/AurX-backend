import { parse, serialize } from "cookie";
import { randomUUID } from "crypto";

export function getUser(req, res) {
  const cookies = parse(req.headers.cookie || "");

  let userId = null;
  let isGuest = false;

  // USER CONNECTÉ
  if (cookies.aurx_session) {
    try {
      const user = JSON.parse(
        Buffer.from(cookies.aurx_session, "base64").toString()
      );
      userId = user.id || user.sid || user.email;
    } catch {}
  }

  // GUEST
  if (!userId) {
    isGuest = true;

    if (cookies.aurx_guest_id) {
      userId = cookies.aurx_guest_id;
    } else {
      userId = `guest_${randomUUID()}`;

      res.setHeader(
        "Set-Cookie",
        serialize("aurx_guest_id", userId, {
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 60 * 60 * 24 * 365,
        })
      );
    }
  }

  return { userId, isGuest };
}