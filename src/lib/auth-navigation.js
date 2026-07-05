export function loginHref(locationLike = window.location) {
  const origin = locationLike.origin || new URL(locationLike.href).origin;
  return new URL('/login', origin).href;
}
