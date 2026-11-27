export function appointmentRoute(
  pathname: string,
  search: string
): { management: boolean; widgetId: string } | null {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/appointments/manage")
    return { management: true, widgetId: "" };
  const match = path.match(/^\/appointments\/([^/]+)$/);
  if (match) {
    try {
      return { management: false, widgetId: decodeURIComponent(match[1]) };
    } catch {
      return null;
    }
  }
  const query = new URLSearchParams(search);
  if (
    (path === "" || path === "/") &&
    query.get("type") === "appointment" &&
    query.get("slug")
  )
    return { management: false, widgetId: query.get("slug")! };
  return null;
}
