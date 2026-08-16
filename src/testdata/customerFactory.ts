import { faker } from '@faker-js/faker';

export interface CustomerData {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  postcode: string;
  address: string;
}

function lettersOnly(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z]/g, '');
  return cleaned || fallback;
}

export function customerFullName(customer: Pick<CustomerData, 'firstName' | 'lastName' | 'fullName'>): string {
  return customer.fullName || `${customer.firstName} ${customer.lastName}`.trim();
}

export function customerInitials(customer: Pick<CustomerData, 'firstName' | 'lastName'>): string {
  const first = (customer.firstName || '').trim().charAt(0);
  const last = (customer.lastName || '').trim().charAt(0);
  return `${first}${last}`.toUpperCase();
}

export function randomCustomer(): CustomerData {
  const firstName = lettersOnly(faker.person.firstName(), 'Alex');
  const lastName = lettersOnly(faker.person.lastName(), 'Morgan');
  const unique = faker.string.alphanumeric(6).toLowerCase();

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${firstName}.${lastName}.${unique}@example.com`.toLowerCase(),
    phone: faker.string.numeric({ length: 11, allowLeadingZeros: false }),
    city: faker.location.city(),
    postcode: faker.location.zipCode('??##??').replace(/\s/g, '').toUpperCase(),
    address: faker.location.streetAddress(),
  };
}

export function customerWith(overrides: Partial<CustomerData> = {}): CustomerData {
  const customer = { ...randomCustomer(), ...overrides };
  customer.fullName = `${customer.firstName} ${customer.lastName}`.trim();
  return customer;
}

export function customerWithInvalidField(field: keyof CustomerData, value: string): CustomerData {
  return customerWith({ [field]: value } as Partial<CustomerData>);
}
