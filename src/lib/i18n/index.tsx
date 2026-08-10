"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { en } from "./en";
import { ur } from "./ur";
import type { Locale } from "./types";

const STORAGE_KEY = "agri_soft_locale";

const dictionaries = { en, ur } as const;

/** Map route pathname → i18n page keys */
export const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "pages.dashboard.title", subtitle: "pages.dashboard.subtitle" },
  "/platform/licenses": { title: "pages.licenses.title", subtitle: "pages.licenses.subtitle" },
  "/settings/license": { title: "pages.licenseInfo.title", subtitle: "pages.licenseInfo.subtitle" },
  "/sales": { title: "pages.sales.title", subtitle: "pages.sales.subtitle" },
  "/sales/returns": { title: "pages.salesReturns.title", subtitle: "pages.salesReturns.subtitle" },
  "/purchases": { title: "pages.purchases.title", subtitle: "pages.purchases.subtitle" },
  "/purchases/returns": {
    title: "pages.purchasesReturns.title",
    subtitle: "pages.purchasesReturns.subtitle",
  },
  "/units": { title: "pages.units.title", subtitle: "pages.units.subtitle" },
  "/categories": { title: "pages.categories.title", subtitle: "pages.categories.subtitle" },
  "/products": { title: "pages.products.title", subtitle: "pages.products.subtitle" },
  "/inventory": { title: "pages.inventory.title", subtitle: "pages.inventory.subtitle" },
  "/customers": { title: "pages.customers.title", subtitle: "pages.customers.subtitle" },
  "/vendors": { title: "pages.vendors.title", subtitle: "pages.vendors.subtitle" },
  "/transactions/journal": { title: "pages.journal.title", subtitle: "pages.journal.subtitle" },
  "/transactions/receive": { title: "pages.receive.title", subtitle: "pages.receive.subtitle" },
  "/transactions/pay": { title: "pages.pay.title", subtitle: "pages.pay.subtitle" },
  "/transactions/expense": { title: "pages.expense.title", subtitle: "pages.expense.subtitle" },
  "/transactions/income": { title: "pages.income.title", subtitle: "pages.income.subtitle" },
  "/ledgers/accounts": {
    title: "pages.ledgersAccounts.title",
    subtitle: "pages.ledgersAccounts.subtitle",
  },
  "/ledgers/customers": {
    title: "pages.ledgersCustomers.title",
    subtitle: "pages.ledgersCustomers.subtitle",
  },
  "/ledgers/vendors": {
    title: "pages.ledgersVendors.title",
    subtitle: "pages.ledgersVendors.subtitle",
  },
  "/ledgers/expenses": {
    title: "pages.ledgersExpenses.title",
    subtitle: "pages.ledgersExpenses.subtitle",
  },
  "/ledgers/income": { title: "pages.ledgersIncome.title", subtitle: "pages.ledgersIncome.subtitle" },
  "/reports/sales": { title: "pages.reportsSales.title", subtitle: "pages.reportsSales.subtitle" },
  "/reports/purchases": {
    title: "pages.reportsPurchases.title",
    subtitle: "pages.reportsPurchases.subtitle",
  },
  "/reports/profit": { title: "pages.reportsProfit.title", subtitle: "pages.reportsProfit.subtitle" },
  "/reports/stock": { title: "pages.reportsStock.title", subtitle: "pages.reportsStock.subtitle" },
  "/reports/tax": { title: "pages.reportsTax.title", subtitle: "pages.reportsTax.subtitle" },
  "/reports/deleted": {
    title: "pages.reportsDeleted.title",
    subtitle: "pages.reportsDeleted.subtitle",
  },
  "/setup/taxes": { title: "pages.taxes.title", subtitle: "pages.taxes.subtitle" },
  "/setup/discounts": { title: "pages.discounts.title", subtitle: "pages.discounts.subtitle" },
  "/setup/additions": { title: "pages.additions.title", subtitle: "pages.additions.subtitle" },
  "/settings/users": { title: "pages.users.title", subtitle: "pages.users.subtitle" },
  "/settings/backup": { title: "pages.backup.title", subtitle: "pages.backup.subtitle" },
  "/settings": { title: "pages.settings.title", subtitle: "pages.settings.subtitle" },
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
