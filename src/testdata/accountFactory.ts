import { faker } from '@faker-js/faker';

export type AccountCurrency = 'Pound' | 'Dollar' | 'Rupee' | '';

export interface AccountData {
  currency: AccountCurrency;
  amount: string;
}

export interface DepositData {
  amount: string;
  accountLabel?: string;
  accountValue?: string;
  category?: string;
}

export interface WithdrawData {
  amount: string;
  accountLabel?: string;
  accountValue?: string;
  category?: string;
}

const CURRENCIES: Exclude<AccountCurrency, ''>[] = ['Pound', 'Dollar', 'Rupee'];
const RANDOM_OPENING_MIN = 50000;
const RANDOM_OPENING_MAX = 100000;
const RANDOM_TX_MIN = 1;
const RANDOM_TX_MAX = 20000;

export function resolveAccountCurrency(labelOrValue?: string): AccountCurrency {
  const text = (labelOrValue || '').trim().toLowerCase();
  if (!text) return '';
  return CURRENCIES.find((currency) => text === currency.toLowerCase() || text.includes(currency.toLowerCase())) ?? '';
}

export function randomOpeningAmount(min = RANDOM_OPENING_MIN, max = RANDOM_OPENING_MAX): string {
  return String(faker.number.int({ min, max }));
}

export function accountsForCount(count: number, amount?: string): AccountData[] {
  if (count < 1) {
    throw new Error(`Account count must be at least 1, received ${count}`);
  }

  const shuffled = faker.helpers.shuffle([...CURRENCIES]);
  return Array.from({ length: count }, (_, index) => ({
    currency: shuffled[index % shuffled.length],
    amount: amount || randomOpeningAmount(),
  }));
}

export function randomDepositAmount(min = RANDOM_TX_MIN, max = RANDOM_TX_MAX): string {
  return String(faker.number.int({ min, max }));
}

export function randomWithdrawAmount(min = RANDOM_TX_MIN, max = RANDOM_TX_MAX): string {
  return randomDepositAmount(min, max);
}
