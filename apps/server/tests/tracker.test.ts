import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  resetDb,
  USER_A,
  USER_B,
  firstMessage,
  get,
  json,
  makeApp,
  send,
} from "./helpers";

interface Ctx {
  base: string;
  close: () => Promise<void>;
}

let a: Ctx;
let b: Ctx;

beforeAll(async () => {
  await resetDb();
  a = await makeApp(USER_A);
  b = await makeApp(USER_B);
});

afterAll(async () => {
  await a.close();
  await b.close();
});

describe("tracker", () => {
  let companyId = 0;
  let roleId = 0;

  it("creates a company (upsert by name)", async () => {
    const created = await send(`${a.base}/api/companies`, "POST", {
      name: "Goodspace",
    });
    expect(created.status).toBe(201);
    const company = await json(created);
    companyId = company.id;
    expect(company.role_count).toBe(0);

    const updated = await send(`${a.base}/api/companies`, "POST", {
      name: "Goodspace",
      location: "Noida",
    });
    const same = await json(updated);
    expect(same.id).toBe(companyId);
    expect(same.location).toBe("Noida");
  });

  it("rejects blank company names", async () => {
    const response = await send(`${a.base}/api/companies`, "POST", {
      name: "  ",
    });
    expect(response.status).toBe(400);
    expect(firstMessage(await json(response))).toContain(
      "name: Company name is required",
    );
  });

  it("creates a role with an initial history row and blocks duplicates", async () => {
    const created = await send(`${a.base}/api/roles`, "POST", {
      company_id: companyId,
      target_title: "Software Engineer",
      status: "wishlist",
    });
    expect(created.status).toBe(201);
    const role = await json(created);
    roleId = role.id;
    expect(role.status).toBe("wishlist");

    const duplicate = await send(`${a.base}/api/roles`, "POST", {
      company_id: companyId,
      target_title: "Software Engineer",
    });
    expect(duplicate.status).toBe(409);
    expect((await json<{ message: string }>(duplicate)).message).toBe(
      "This company already has a role with that title",
    );

    const history = await json(
      await get(`${a.base}/api/roles/${roleId}/history`),
    );
    expect(history.history).toHaveLength(1);
    expect(history.history[0].status).toBe("wishlist");
  });

  it("validates role status transitions and appends history on change", async () => {
    const bad = await send(`${a.base}/api/roles/${roleId}`, "PATCH", {
      status: "hired",
    });
    expect(bad.status).toBe(400);
    expect(firstMessage(await json(bad))).toContain(
      "status: unknown status: hired",
    );

    const moved = await send(`${a.base}/api/roles/${roleId}`, "PATCH", {
      status: "interview",
    });
    expect(moved.status).toBe(200);
    expect((await json(moved)).status).toBe("interview");

    const history = await json(
      await get(`${a.base}/api/roles/${roleId}/history`),
    );
    expect(
      history.history.map((row: { status: string }) => row.status),
    ).toEqual(["wishlist", "interview"]);
  });

  it("scopes listings per user", async () => {
    const forB = await json(await get(`${b.base}/api/companies`));
    expect(forB.companies).toHaveLength(0);

    const rolesB = await json(await get(`${b.base}/api/roles`));
    expect(rolesB.roles).toHaveLength(0);

    const rolesA = await json(await get(`${a.base}/api/roles`));
    expect(rolesA.roles).toHaveLength(1);
    expect(rolesA.roles[0].company_name).toBe("Goodspace");
  });

  it("returns dashboard aggregates", async () => {
    const dashboard = await json(await get(`${a.base}/api/dashboard`));
    expect(dashboard.company_count).toBe(1);
    expect(dashboard.role_count).toBe(1);
    expect(dashboard.by_status.interview).toBe(1);
    expect(dashboard.recent_roles).toHaveLength(1);
  });

  it("404s foreign and missing resources", async () => {
    const missing = await get(`${a.base}/api/companies/9999`);
    expect(missing.status).toBe(404);
    expect((await json<{ message: string }>(missing)).message).toBe(
      "Company not found",
    );
  });
});
