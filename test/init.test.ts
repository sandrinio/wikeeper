import { describe, expect, it } from "vitest";
import {
  registerIntegration,
  resetIntegrations,
  runIntegrations,
} from "../src/core/integrations.js";
import type { IntegrationContext } from "../src/core/integrations.js";

const ctx = {} as IntegrationContext;

describe("integration registry", () => {
  it("runs in registration order and remove in reverse", async () => {
    resetIntegrations();
    const order: string[] = [];
    for (const n of ["a", "b"]) {
      registerIntegration({ name: n, init: () => void order.push(`i${n}`), remove: () => void order.push(`r${n}`) });
    }
    await runIntegrations("init", ctx);
    await runIntegrations("remove", ctx);
    expect(order).toEqual(["ia", "ib", "rb", "ra"]);
    resetIntegrations();
  });

  it("rejects duplicates and converts doctor throws into findings", async () => {
    resetIntegrations();
    registerIntegration({
      name: "x",
      doctor: () => {
        throw new Error("bad");
      },
    });
    expect(() => registerIntegration({ name: "x" })).toThrowError(/already registered/);
    const r = await runIntegrations("doctor", ctx);
    expect(r.checks[0]).toMatchObject({ id: "integration-x", severity: "error" });
    resetIntegrations();
    expect((await runIntegrations("doctor", ctx)).checks).toEqual([]);
  });
});
