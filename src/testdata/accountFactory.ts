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

const CURRENCIES: Exclude<AccountCurrency, ''>[] = ['Pound', 'Dollar', 'Rupee'];
const DEFAULT_AMOUNT = '40000';

export function accountsForCount(count: number, amount = DEFAULT_AMOUNT): AccountData[] {
  if (count < 1) {
    throw new Error(`Account count must be at least 1, received ${count}`);
  }

  return Array.from({ length: count }, (_, index) => ({
    currency: CURRENCIES[index % CURRENCIES.length],
    amount,
  }));
}

export function randomDepositAmount(min = 1000, max = 50000): string {
  return String(faker.number.int({ min, max }));
}
