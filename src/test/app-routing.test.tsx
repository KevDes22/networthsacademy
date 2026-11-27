import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it.each(["admin", "instructor"])(
    "matches the %s curriculum on the protected course route",
    (role) => {
      const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
      const course = "00000000-0000-4000-8000-000000000002";
      const matches = router.matchRoutes(`/${role}/courses`, { curriculum: course });
      expect(matches.at(-1)?.routeId).toBe(`/_authenticated/${role}/courses`);
      expect(matches.at(-1)?.search).toMatchObject({ curriculum: course });
    },
  );
  it.each(["/courses", "/signup", "/login"])("keeps the selected course on %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const course = "00000000-0000-4000-8000-000000000002";
    expect(router.matchRoutes(path, { enroll: course }).at(-1)?.search).toMatchObject({
      enroll: course,
    });
    expect(
      router.matchRoutes(path, { enroll: "https://example.org" }).at(-1)?.search,
    ).not.toMatchObject({ enroll: "https://example.org" });
  });
});
