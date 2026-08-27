import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("standard destination-charge settlement contract", () => {
  const source = readFileSync(resolve(process.cwd(), "server/job-payment-settlement.ts"), "utf8");

  it("uses a stable Stripe capture idempotency key", () => {
    expect(source).toContain("guber-standard-job-${jobId}-capture-v1");
    expect(source).toContain("idempotencyKey");
  });

  it("records capture, ledger, and worker wallet effects in one database transaction", () => {
    const finalization = source.slice(source.indexOf("const finalize"), source.indexOf("} catch (error: any)"));
    expect(finalization).toContain('await finalize.query("BEGIN")');
    expect(finalization).toContain("INSERT INTO money_ledger");
    expect(finalization).toContain("wallet_transactions");
    expect(finalization).toContain("capture_status = 'captured'");
    expect(finalization).toContain('await finalize.query("COMMIT")');
  });

  it("never receives a Stripe transfers client for a destination-charge job", () => {
    expect(source).not.toContain("transfers.create");
    expect(source).toContain('row.payment_rail !== "destination_charge"');
  });
});