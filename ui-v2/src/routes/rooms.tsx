import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Path layout so /rooms and /rooms/$slug can both mount. Chrome lives on the children. */
export const Route = createFileRoute("/rooms")({
  component: () => <Outlet />,
});
