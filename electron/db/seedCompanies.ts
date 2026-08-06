import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { clientCompanies } from "./schema";

/** Seed a few demo client companies once (safe on every boot). */
export function ensureDemoClientCompanies(db: Db): void {
  const count = db.select({ n: sql<number>`count(*)` }).from(clientCompanies).get()?.n ?? 0;
  if (Number(count) > 0) return;

  const samples = [
    { companyName: "Green Field Agri Store", area: "Lahore", joinedAt: "2024-03-12" },
    { companyName: "Indus Seed Traders", area: "Multan", joinedAt: "2024-06-01" },
    { companyName: "Canal Fertilizers", area: "Faisalabad", joinedAt: "2024-08-20" },
    { companyName: "Riverbank Agro", area: "Lahore", joinedAt: "2025-01-15" },
    { companyName: "Desert Bloom Supplies", area: "Bahawalpur", joinedAt: "2025-04-02" },
    { companyName: "Northern Farm Hub", area: "Peshawar", joinedAt: "2025-07-18" },
    { companyName: "Punjab Agri Mart", area: "Lahore", joinedAt: "2025-11-05" },
    { companyName: "Sindh Grow Depot", area: "Karachi", joinedAt: "2026-02-10" },
  ];
  const ts = new Date().toISOString();
  for (const s of samples) {
    db.insert(clientCompanies)
      .values({
        id: randomUUID(),
        companyName: s.companyName,
        area: s.area,
        joinedAt: s.joinedAt,
        notes: null,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}
