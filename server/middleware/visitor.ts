import { getCookie, setCookie, type H3Event } from "h3";
import { visitorStore } from "../ric/desk";

/** Per-visitor desks: every browser gets an anonymous `ric_vid` cookie, so even with AUTH_DISABLED=1 each visitor has their own paper desk. */
export default (event: H3Event, next: () => unknown) => {
  let vid = getCookie(event, "ric_vid");
  if (!vid || !/^[a-z0-9]{8,32}$/.test(vid)) {
    vid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    setCookie(event, "ric_vid", vid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return visitorStore.run(vid, next);
};
