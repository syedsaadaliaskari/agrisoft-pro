import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ElectronAPI } from "../shared/ipc";

const api: ElectronAPI = {
  ping: () => ipcRenderer.invoke(IPC.PING),
  getAppInfo: () => ipcRenderer.invoke(IPC.GET_APP_INFO),
  login: (username, password) => ipcRenderer.invoke(IPC.AUTH_LOGIN, username, password),
  logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  getCurrentUser: () => ipcRenderer.invoke(IPC.AUTH_CURRENT_USER),
  getDbStats: () => ipcRenderer.invoke(IPC.DB_STATS),

  nextDocumentNumber: (docType) => ipcRenderer.invoke(IPC.DOCS_NEXT_NUMBER, docType),

  listUnits: () => ipcRenderer.invoke(IPC.UNITS_LIST),
  createUnit: (input) => ipcRenderer.invoke(IPC.UNITS_CREATE, input),
  updateUnit: (id, input) => ipcRenderer.invoke(IPC.UNITS_UPDATE, id, input),
  deleteUnit: (id) => ipcRenderer.invoke(IPC.UNITS_DELETE, id),

  listCategories: () => ipcRenderer.invoke(IPC.CATEGORIES_LIST),
  createCategory: (input) => ipcRenderer.invoke(IPC.CATEGORIES_CREATE, input),
  updateCategory: (id, input) => ipcRenderer.invoke(IPC.CATEGORIES_UPDATE, id, input),
  deleteCategory: (id) => ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),

  listTaxes: () => ipcRenderer.invoke(IPC.TAXES_LIST),
  createTax: (input) => ipcRenderer.invoke(IPC.TAXES_CREATE, input),
  updateTax: (id, input) => ipcRenderer.invoke(IPC.TAXES_UPDATE, id, input),
  deleteTax: (id) => ipcRenderer.invoke(IPC.TAXES_DELETE, id),

  listDiscounts: () => ipcRenderer.invoke(IPC.DISCOUNTS_LIST),
  createDiscount: (input) => ipcRenderer.invoke(IPC.DISCOUNTS_CREATE, input),
  updateDiscount: (id, input) => ipcRenderer.invoke(IPC.DISCOUNTS_UPDATE, id, input),
  deleteDiscount: (id) => ipcRenderer.invoke(IPC.DISCOUNTS_DELETE, id),

  listAdditions: () => ipcRenderer.invoke(IPC.ADDITIONS_LIST),
  createAddition: (input) => ipcRenderer.invoke(IPC.ADDITIONS_CREATE, input),
  updateAddition: (id, input) => ipcRenderer.invoke(IPC.ADDITIONS_UPDATE, id, input),
  deleteAddition: (id) => ipcRenderer.invoke(IPC.ADDITIONS_DELETE, id),

  listProducts: () => ipcRenderer.invoke(IPC.PRODUCTS_LIST),
  getProduct: (id) => ipcRenderer.invoke(IPC.PRODUCTS_GET, id),
  createProduct: (input) => ipcRenderer.invoke(IPC.PRODUCTS_CREATE, input),
  updateProduct: (id, input) => ipcRenderer.invoke(IPC.PRODUCTS_UPDATE, id, input),
  deleteProduct: (id) => ipcRenderer.invoke(IPC.PRODUCTS_DELETE, id),

  listVariants: (productId) => ipcRenderer.invoke(IPC.VARIANTS_LIST, productId),
  createVariant: (productId, input) => ipcRenderer.invoke(IPC.VARIANTS_CREATE, productId, input),
  updateVariant: (id, input) => ipcRenderer.invoke(IPC.VARIANTS_UPDATE, id, input),
  deleteVariant: (id) => ipcRenderer.invoke(IPC.VARIANTS_DELETE, id),

  listInventory: () => ipcRenderer.invoke(IPC.INVENTORY_LIST),
  adjustStock: (input) => ipcRenderer.invoke(IPC.INVENTORY_ADJUST, input),

  listCustomers: () => ipcRenderer.invoke(IPC.CUSTOMERS_LIST),
  createCustomer: (input) => ipcRenderer.invoke(IPC.CUSTOMERS_CREATE, input),
  updateCustomer: (id, input) => ipcRenderer.invoke(IPC.CUSTOMERS_UPDATE, id, input),
  deleteCustomer: (id) => ipcRenderer.invoke(IPC.CUSTOMERS_DELETE, id),

  listVendors: () => ipcRenderer.invoke(IPC.VENDORS_LIST),
  createVendor: (input) => ipcRenderer.invoke(IPC.VENDORS_CREATE, input),
  updateVendor: (id, input) => ipcRenderer.invoke(IPC.VENDORS_UPDATE, id, input),
  deleteVendor: (id) => ipcRenderer.invoke(IPC.VENDORS_DELETE, id),

  listAccounts: (filter) => ipcRenderer.invoke(IPC.ACCOUNTS_LIST, filter),
  getAccount: (id) => ipcRenderer.invoke(IPC.ACCOUNTS_GET, id),
  postVoucher: (input) => ipcRenderer.invoke(IPC.VOUCHERS_POST, input),
  getVoucher: (id) => ipcRenderer.invoke(IPC.VOUCHERS_GET, id),
  cancelVoucher: (id) => ipcRenderer.invoke(IPC.VOUCHERS_CANCEL, id),
  getAccountLedger: (accountId, query) => ipcRenderer.invoke(IPC.LEDGER_ACCOUNT, accountId, query),
  getPartyLedger: (partyType, partyId, query) =>
    ipcRenderer.invoke(IPC.LEDGER_PARTY, partyType, partyId, query),

  receivePayment: (input) => ipcRenderer.invoke(IPC.TX_RECEIVE, input),
  makePayment: (input) => ipcRenderer.invoke(IPC.TX_PAY, input),
  postExpense: (input) => ipcRenderer.invoke(IPC.TX_EXPENSE, input),
  postIncome: (input) => ipcRenderer.invoke(IPC.TX_INCOME, input),

  listPurchases: () => ipcRenderer.invoke(IPC.PURCHASES_LIST),
  getPurchase: (id) => ipcRenderer.invoke(IPC.PURCHASES_GET, id),
  listPurchasesByVendor: (vendorId) => ipcRenderer.invoke(IPC.PURCHASES_LIST_BY_VENDOR, vendorId),
  createPurchase: (input) => ipcRenderer.invoke(IPC.PURCHASES_CREATE, input),
  deletePurchase: (id) => ipcRenderer.invoke(IPC.PURCHASES_DELETE, id),
  listPurchaseReturns: () => ipcRenderer.invoke(IPC.PURCHASE_RETURNS_LIST),
  createPurchaseReturn: (input) => ipcRenderer.invoke(IPC.PURCHASE_RETURNS_CREATE, input),

  listSales: () => ipcRenderer.invoke(IPC.SALES_LIST),
  getSale: (id) => ipcRenderer.invoke(IPC.SALES_GET, id),
  listSalesByCustomer: (customerId) => ipcRenderer.invoke(IPC.SALES_LIST_BY_CUSTOMER, customerId),
  createSale: (input) => ipcRenderer.invoke(IPC.SALES_CREATE, input),
  deleteSale: (id) => ipcRenderer.invoke(IPC.SALES_DELETE, id),
  listSaleReturns: () => ipcRenderer.invoke(IPC.SALE_RETURNS_LIST),
  createSaleReturn: (input) => ipcRenderer.invoke(IPC.SALE_RETURNS_CREATE, input),

  getDashboardSummary: () => ipcRenderer.invoke(IPC.DASHBOARD_SUMMARY),
  getSalesReport: (query) => ipcRenderer.invoke(IPC.REPORTS_SALES, query),
  getPurchasesReport: (query) => ipcRenderer.invoke(IPC.REPORTS_PURCHASES, query),
  getProfitReport: (query) => ipcRenderer.invoke(IPC.REPORTS_PROFIT, query),
  getStockReport: () => ipcRenderer.invoke(IPC.REPORTS_STOCK),
  getTaxReport: (query) => ipcRenderer.invoke(IPC.REPORTS_TAX),
  getDeletedDocumentsReport: (query) => ipcRenderer.invoke(IPC.REPORTS_DELETED, query),

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  updateSettings: (input) => ipcRenderer.invoke(IPC.SETTINGS_UPDATE, input),
  listUsers: () => ipcRenderer.invoke(IPC.USERS_LIST),
  createUser: (input) => ipcRenderer.invoke(IPC.USERS_CREATE, input),
  updateUser: (id, input) => ipcRenderer.invoke(IPC.USERS_UPDATE, id, input),
  setUserPassword: (id, password) => ipcRenderer.invoke(IPC.USERS_SET_PASSWORD, id, password),
  listRoles: () => ipcRenderer.invoke(IPC.ROLES_LIST),
  listPermissions: () => ipcRenderer.invoke(IPC.PERMISSIONS_LIST),
  setRolePermissions: (roleId, permissionCodes) =>
    ipcRenderer.invoke(IPC.ROLES_SET_PERMISSIONS, roleId, permissionCodes),
  listAuditLogs: (query) => ipcRenderer.invoke(IPC.AUDIT_LIST, query),
  printHtml: (html) => ipcRenderer.invoke(IPC.APP_PRINT_HTML, html),
};

contextBridge.exposeInMainWorld("api", api);
