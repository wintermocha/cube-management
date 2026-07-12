export function loginHref(locationLike = window.location) {
  return locationLike.href || new URL(String(locationLike), locationLike.origin).href;
}
