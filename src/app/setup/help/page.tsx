"use client";

import { PackagePlus, ShoppingCart, Wheat, WheatOff } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

const sections = [
  {
    title: "How to make a sale",
    urdu: "سیل کیسے کریں",
    icon: ShoppingCart,
    steps: [
      "Open Sale.",
      "Pick the customer.",
      "Pick the product. The stock number shows the unit, such as 40 mann or 40 kg.",
      "Write how many. 40 means 40 of that unit.",
      "Write the price for one.",
      "Write the money they paid.",
      "Save. Stock goes down in that same unit.",
    ],
    urduSteps: [
      "سیل کھولیں۔",
      "گاہک چنیں۔",
      "مال چنیں۔ اسٹاک کے ساتھ یونٹ لکھا ہوگا، جیسے 40 من یا 40 کلو۔",
      "تعداد لکھیں۔ 40 کا مطلب 40 اسی یونٹ میں ہے۔",
      "ایک کا ریٹ لکھیں۔",
      "جو رقم ملی وہ لکھیں۔",
      "محفوظ کریں۔ اسٹاک اسی یونٹ میں کم ہوگا۔",
    ],
  },
  {
    title: "How to make a purchase",
    urdu: "خریداری کیسے کریں",
    icon: PackagePlus,
    steps: [
      "Open Purchase.",
      "Pick the supplier.",
      "Pick the product. The stock number shows the unit.",
      "Write how many, in that same unit.",
      "Write the cost of one.",
      "Write the money you paid.",
      "Save. Stock goes up in that same unit.",
    ],
    urduSteps: [
      "خریداری کھولیں۔",
      "سپلائر چنیں۔",
      "مال چنیں۔ اسٹاک کے ساتھ یونٹ لکھا ہوگا۔",
      "تعداد اسی یونٹ میں لکھیں۔",
      "ایک کا خرچ لکھیں۔",
      "جو رقم دی وہ لکھیں۔",
      "محفوظ کریں۔ اسٹاک اسی یونٹ میں بڑھے گا۔",
    ],
  },
  {
    title: "How to buy a crop",
    urdu: "فصل کی خرید کیسے کریں",
    icon: Wheat,
    example: [
      { label: "Load", value: "40 mann" },
      { label: "Kaat", value: "4 kg each" },
      { label: "Cut", value: "160 kg" },
      { label: "Safi", value: "36 mann" },
      { label: "Stock", value: "40 mann" },
      { label: "Pay", value: "36 × rate" },
    ],
    steps: [
      "Open Crop trading and buy from the farmer or the supplier.",
      "Pick the crop. The quantity is in that crop’s unit. Mann stays mann.",
      "Write the bags or the quantity, then the rate for one.",
      "Kaat is kilograms from each one. Write 4 and there are 40 bags or 40 mann: the cut is 40 × 4 = 160 kg.",
      "Safi is what is left. 40 mann minus that 160 kg is 36 mann.",
      "Stock gets the full load, all 40 mann.",
      "The bill is only the safi, 36 mann times the rate.",
      "Save.",
    ],
    urduSteps: [
      "فصل کی خرید کھولیں، کسان یا سپلائر سے۔",
      "فصل چنیں۔ تعداد اسی یونٹ میں ہوگی۔ من من ہی رہے گا۔",
      "بوریاں یا تعداد لکھیں، پھر ایک کا ریٹ۔",
      "کاٹ ہر ایک سے کلو ہے۔ 4 لکھیں اور 40 بوری یا 40 من ہوں تو کاٹ 160 کلو ہے۔",
      "صافی بچا ہوا وزن ہے۔ 40 من میں سے 160 کلو کم، 36 من۔",
      "اسٹاک میں پورا وزن جائے گا، سارے 40 من۔",
      "رقم صرف صافی کی ہے، 36 من ضرب ریٹ۔",
      "محفوظ کریں۔",
    ],
  },
  {
    title: "How to sell a crop",
    urdu: "فصل کی سیل کیسے کریں",
    icon: WheatOff,
    example: [
      { label: "Load", value: "40 mann" },
      { label: "Kaat", value: "4 kg each" },
      { label: "Cut", value: "160 kg" },
      { label: "Safi", value: "36 mann" },
      { label: "Stock out", value: "40 mann" },
      { label: "Receive", value: "36 × rate" },
    ],
    steps: [
      "Open Sell crop and pick the buyer and the crop.",
      "Write the quantity in that crop’s unit, and the rate for one.",
      "Kaat works the same way: 4 means 4 kg from each mann or each bag.",
      "40 times 4 is 160 kg. Safi is what is left, 36 mann.",
      "Stock goes down by the full load, all 40 mann.",
      "The buyer pays only for the safi.",
      "Save.",
    ],
    urduSteps: [
      "فصل کی سیل کھولیں، خریدار اور فصل چنیں۔",
      "تعداد اسی یونٹ میں لکھیں، اور ایک کا ریٹ۔",
      "کاٹ وہی ہے: 4 کا مطلب ہر من یا ہر بوری سے 4 کلو۔",
      "40 ضرب 4 برابر 160 کلو۔ صافی 36 من ہے۔",
      "اسٹاک سے پورا وزن نکلے گا، سارے 40 من۔",
      "خریدار صرف صافی کی رقم دے گا۔",
      "محفوظ کریں۔",
    ],
  },
];

export default function SetupHelpPage() {
  return (
    <AppShell title="Help" subtitle="Short steps for sale, purchase, and crop">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <section
              key={section.title}
              className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-soft)]/70 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
                  <p className="text-sm text-[var(--text-muted)]" dir="rtl">
                    {section.urdu}
                  </p>
                </div>
              </div>

              <div className="hidden grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-5 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:grid">
                <span />
                <span>English</span>
                <span className="text-end" dir="rtl">
                  اردو
                </span>
              </div>

              <ol className="flex flex-col gap-2 px-4 py-4 sm:px-5">
                {section.steps.map((step, index) => (
                  <li
                    key={step}
                    className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 sm:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6">{step}</p>
                    <p className="text-sm leading-7 text-[var(--text-muted)] sm:text-end" dir="rtl">
                      {section.urduSteps[index]}
                    </p>
                  </li>
                ))}
              </ol>

              {section.example ? (
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[var(--border)] bg-[var(--bg-soft)]/50 p-4 sm:grid-cols-3">
                  {section.example.map((item) => (
                    <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        {item.label}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold tabular-nums">{item.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
