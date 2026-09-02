"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { en } from "./en";
import { ur } from "./ur";
import type { Locale } from "./types";

const STORAGE_KEY = "agri_soft_locale";

const dictionaries = { en, ur } as const;

/** Map route pathname → i18n page keys */
export const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "pages.dashboard.title" },
  "/platform/licenses": { title: "pages.licenses.title" },
  "/settings/license": { title: "pages.licenseInfo.title" },
  "/sales": { title: "pages.sales.title" },
  "/sales/returns": { title: "pages.salesReturns.title" },
  "/purchases": { title: "pages.purchases.title" },
  "/purchases/returns": { title: "pages.purchasesReturns.title" },
  "/products": { title: "pages.products.title" },
  "/inventory": { title: "pages.inventory.title" },
  "/customers": { title: "pages.customers.title" },
  "/vendors": { title: "pages.vendors.title" },
  "/transactions/journal": { title: "pages.journal.title" },
  "/transactions/receive": { title: "pages.receive.title" },
  "/transactions/pay": { title: "pages.pay.title" },
  "/transactions/expense": { title: "pages.expense.title" },
  "/transactions/income": { title: "pages.income.title" },
  "/ledgers/accounts": { title: "pages.ledgersAccounts.title" },
  "/ledgers/customers": { title: "pages.ledgersCustomers.title" },
  "/ledgers/vendors": { title: "pages.ledgersVendors.title" },
  "/ledgers/expenses": { title: "pages.ledgersExpenses.title" },
  "/ledgers/income": { title: "pages.ledgersIncome.title" },
  "/reports/sales": { title: "pages.reportsSales.title" },
  "/reports/purchases": { title: "pages.reportsPurchases.title" },
  "/reports/profit": { title: "pages.reportsProfit.title" },
  "/reports/stock": { title: "pages.reportsStock.title" },
  "/reports/tax": { title: "pages.reportsTax.title" },
  "/reports/deleted": { title: "pages.reportsDeleted.title" },
  "/setup/taxes": { title: "pages.taxes.title" },
  "/setup/discounts": { title: "pages.discounts.title" },
  "/setup/additions": { title: "pages.additions.title" },
  "/settings/users": { title: "pages.users.title" },
  "/settings/password": { title: "pages.password.title" },
  "/settings/backup": { title: "pages.backup.title" },
  "/settings/audit": { title: "pages.audit.title" },
  "/settings": { title: "pages.settings.title" },
};

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18nValue | null>(null);

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "ur" ? "ur" : "en";
}

export function applyLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const dir = locale === "ur" ? "rtl" : "ltr";
  document.documentElement.setAttribute("lang", locale === "ur" ? "ur" : "en");
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("data-locale", locale);
}

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  );
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const initial = getStoredLocale();
    setLocaleState(initial);
    applyLocale(initial);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLocale(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] ?? en;
      const raw = dict[key] ?? en[key] ?? key;
      return format(raw, vars);
    },
    [locale]
  );

  return (
    <I18nContext.Provider
      value={{ locale, setLocale, t, dir: locale === "ur" ? "rtl" : "ltr" }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: "en" as Locale,
      setLocale: (_: Locale) => {},
      t: (key: string, vars?: Record<string, string | number>) => format(en[key] ?? key, vars),
      dir: "ltr" as const,
    };
  }
  return ctx;
}

export function normalizePath(pathname: string) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}
