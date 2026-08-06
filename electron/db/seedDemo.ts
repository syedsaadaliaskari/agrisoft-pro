import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import {
  additions,
  categories,
  customers,
  discounts,
  documentCounters,
  products,
  productVariants,
  roles,
  settings,
  taxes,
  units,
  users,
  vendors,
} from "./schema";

function settingExists(db: Db, key: string): boolean {
  return !!db.select().from(settings).where(eq(settings.key, key)).get();
}

function upsertSetting(db: Db, key: string, value: string, groupName: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings)
      .values({ id: randomUUID(), key, value, groupName, createdAt: now, updatedAt: now })
      .run();
  }
}

/**
 * Sample agri masters for development. Skips when `demo_seeded` is set.
 * Transaction documents are seeded in later steps once sale/purchase modules exist.
 */
export async function seedDemoData(db: Db): Promise<void> {
  if (settingExists(db, "demo_seeded")) return;

  const productCount = db.select({ value: count() }).from(products).get()?.value ?? 0;
  if (productCount > 0) {
    upsertSetting(db, "demo_seeded", new Date().toISOString(), "system");
    return;
  }

  upsertSetting(db, "shop_name", "Green Fields Agri Store", "shop");
  upsertSetting(db, "shop_phone", "+92 300 9876543", "shop");
  upsertSetting(db, "shop_address", "Main Bazaar, Faisalabad", "shop");
  upsertSetting(db, "receipt_footer", "Thank you for shopping at Green Fields!", "receipt");

  const cashierRole = db.select().from(roles).where(eq(roles.name, "Cashier")).get();
  if (cashierRole) {
    const existingCashier = db.select().from(users).where(eq(users.username, "cashier")).get();
    if (!existingCashier) {
      const hash = await bcrypt.hash("cashier123", 10);
      db.insert(users)
        .values({
          id: randomUUID(),
          username: "cashier",
          passwordHash: hash,
          fullName: "Ali Cashier",
          roleId: cashierRole.id,
          isActive: true,
          phone: "+92 301 5551212",
        })
        .run();
    }
  }

  if ((db.select({ value: count() }).from(discounts).get()?.value ?? 0) === 0) {
    db.insert(discounts)
      .values([
        { id: randomUUID(), name: "Bulk 5%", type: "percent", value: 5, isActive: true },
        { id: randomUUID(), name: "Flat Rs 100", type: "fixed", value: 100, isActive: true },
      ])
      .run();
  }

  if ((db.select({ value: count() }).from(additions).get()?.value ?? 0) === 0) {
    db.insert(additions)
      .values([
        { id: randomUUID(), name: "Delivery", type: "fixed", value: 200, isActive: true },
        { id: randomUUID(), name: "Loading", type: "fixed", value: 50, isActive: true },
      ])
      .run();
  }

  db.insert(customers)
    .values([
      {
        id: randomUUID(),
        code: "CUS-00001",
        name: "Ahmed Farmer",
        phone: "+92 300 1112233",
        city: "Faisalabad",
        openingBalance: 0,
        balanceType: "debit",
        creditLimit: 50000,
        isActive: true,
      },
      {
        id: randomUUID(),
        code: "CUS-00002",
        name: "Village Coop Store",
        phone: "+92 301 2223344",
        city: "Jhang",
        openingBalance: 2500,
        balanceType: "debit",
        creditLimit: 100000,
        isActive: true,
      },
      {
        id: randomUUID(),
        code: "CUS-00003",
        name: "Walk-in Customer",
        phone: "",
        city: "Faisalabad",
        openingBalance: 0,
        balanceType: "debit",
        creditLimit: 0,
        isActive: true,
      },
    ])
    .run();

  db.insert(vendors)
    .values([
      {
        id: randomUUID(),
        code: "VEN-00001",
        name: "Punjab Seed Co.",
        phone: "+92 42 1110001",
        city: "Lahore",
        openingBalance: 0,
        balanceType: "credit",
        isActive: true,
      },
      {
        id: randomUUID(),
        code: "VEN-00002",
        name: "AgroChem Distributors",
        phone: "+92 41 2220002",
        city: "Faisalabad",
        openingBalance: 15000,
        balanceType: "credit",
        isActive: true,
      },
    ])
    .run();

  const unitKg = db.select().from(units).where(eq(units.name, "Kilogram")).get();
  const unitBag = db.select().from(units).where(eq(units.name, "Bag")).get();
  const unitL = db.select().from(units).where(eq(units.name, "Litre")).get();
  const unitPc = db.select().from(units).where(eq(units.name, "Piece")).get();
  const cats = db.select().from(categories).all();
  const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const tax5 = db.select().from(taxes).where(eq(taxes.name, "GST 5%")).get();
  const tax0 = db.select().from(taxes).where(eq(taxes.name, "No Tax")).get();

  type DemoProduct = {
    sku: string;
    name: string;
    category: string;
    unitId: string | undefined;
    brand: string;
    cost: number;
    sale: number;
    wholesale: number;
    taxId: string | undefined;
    packs: { size: string; color: string; stock: number }[];
  };

  const catalog: DemoProduct[] = [
    {
      sku: "SKU-SEED-001",
      name: "Wheat Seed (Local)",
      category: "Seeds",
      unitId: unitKg?.id,
      brand: "Punjab Seed",
      cost: 85,
      sale: 110,
      wholesale: 100,
      taxId: tax0?.id,
      packs: [
        { size: "1kg", color: "Grade A", stock: 200 },
        { size: "40kg", color: "Grade A", stock: 40 },
      ],
    },
    {
      sku: "SKU-SEED-002",
      name: "Hybrid Maize Seed",
      category: "Seeds",
      unitId: unitKg?.id,
      brand: "Pioneer",
      cost: 420,
      sale: 520,
      wholesale: 480,
      taxId: tax5?.id,
      packs: [{ size: "5kg", color: "Hybrid", stock: 60 }],
    },
    {
      sku: "SKU-FERT-001",
      name: "Urea Fertilizer",
      category: "Fertilizers",
      unitId: unitBag?.id,
      brand: "FFC",
      cost: 3200,
      sale: 3600,
      wholesale: 3450,
      taxId: tax0?.id,
      packs: [{ size: "50kg", color: "Standard", stock: 120 }],
    },
    {
      sku: "SKU-FERT-002",
      name: "DAP Fertilizer",
      category: "Fertilizers",
      unitId: unitBag?.id,
      brand: "Engro",
      cost: 7800,
      sale: 8500,
      wholesale: 8200,
      taxId: tax0?.id,
      packs: [{ size: "50kg", color: "Standard", stock: 80 }],
    },
    {
      sku: "SKU-PEST-001",
      name: "Imidacloprid Insecticide",
      category: "Pesticides",
      unitId: unitL?.id,
      brand: "Syngenta",
      cost: 950,
      sale: 1200,
      wholesale: 1100,
      taxId: tax5?.id,
      packs: [
        { size: "250ml", color: "Concentrate", stock: 90 },
        { size: "1L", color: "Concentrate", stock: 45 },
      ],
    },
    {
      sku: "SKU-FEED-001",
      name: "Cattle Feed Mix",
      category: "Feed",
      unitId: unitBag?.id,
      brand: "Local Mill",
      cost: 2100,
      sale: 2450,
      wholesale: 2300,
      taxId: tax0?.id,
      packs: [{ size: "40kg", color: "Standard", stock: 70 }],
    },
    {
      sku: "SKU-TOOL-001",
      name: "Hand Sprayer 16L",
      category: "Tools",
      unitId: unitPc?.id,
      brand: "AgroTech",
      cost: 2800,
      sale: 3500,
      wholesale: 3200,
      taxId: tax5?.id,
      packs: [{ size: "16L", color: "Plastic", stock: 25 }],
    },
  ];

  for (const item of catalog) {
    const productId = randomUUID();
    db.insert(products)
      .values({
        id: productId,
        sku: item.sku,
        name: item.name,
        categoryId: catByName[item.category] ?? null,
        unitId: item.unitId ?? null,
        brand: item.brand,
        gender: null,
        season: null,
        costPrice: item.cost,
        salePrice: item.sale,
        wholesalePrice: item.wholesale,
        taxId: item.taxId ?? null,
        reorderLevel: 10,
        isActive: true,
      })
      .run();

    for (const pack of item.packs) {
      db.insert(productVariants)
        .values({
          id: randomUUID(),
          productId,
          sku: `${item.sku}-${pack.size.replace(/\s+/g, "")}`,
          size: pack.size,
          color: pack.color,
          costPrice: item.cost,
          salePrice: item.sale,
          stockQty: pack.stock,
          isActive: true,
        })
        .run();
    }
  }

  upsertSetting(db, "demo_seeded", new Date().toISOString(), "system");

  // Advance party counters past demo codes (CUS-00001..3, VEN-00001..2)
  const bump = (docType: string, next: number) => {
    const row = db.select().from(documentCounters).where(eq(documentCounters.docType, docType)).get();
    if (row && row.nextNumber < next) {
      db.update(documentCounters)
        .set({ nextNumber: next, updatedAt: new Date().toISOString() })
        .where(eq(documentCounters.id, row.id))
        .run();
    }
  };
  bump("customer", 4);
  bump("vendor", 3);
}
