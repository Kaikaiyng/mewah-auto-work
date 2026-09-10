export type LocalCustomerAccountId = 'ahmad' | 'superadmin';

const LOCAL_CUSTOMER_ACCOUNT_KEY = 'maw_local_customer_account';
const DEFAULT_LOCAL_ACCOUNT: LocalCustomerAccountId = 'ahmad';

export function getLocalCustomerAccount(): LocalCustomerAccountId {
  if (typeof sessionStorage === 'undefined') return DEFAULT_LOCAL_ACCOUNT;
  const account = sessionStorage.getItem(LOCAL_CUSTOMER_ACCOUNT_KEY)
    || localStorage.getItem(LOCAL_CUSTOMER_ACCOUNT_KEY);
  return account === 'superadmin'
    ? 'superadmin'
    : DEFAULT_LOCAL_ACCOUNT;
}

export function setLocalCustomerAccount(accountId: LocalCustomerAccountId, rememberMe = false) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(LOCAL_CUSTOMER_ACCOUNT_KEY);
    localStorage.removeItem(LOCAL_CUSTOMER_ACCOUNT_KEY);
    (rememberMe ? localStorage : sessionStorage).setItem(LOCAL_CUSTOMER_ACCOUNT_KEY, accountId);
  }
}

export function clearLocalCustomerAccount() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(LOCAL_CUSTOMER_ACCOUNT_KEY);
    localStorage.removeItem(LOCAL_CUSTOMER_ACCOUNT_KEY);
  }
}
