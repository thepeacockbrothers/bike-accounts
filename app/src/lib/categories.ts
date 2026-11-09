// Categories line up with HMRC's short self-employment form (SA103S),
// which is also what Making Tax Digital quarterly updates use.

export type Kind = 'income' | 'expense' | 'ignore'

export interface Category {
  id: CategoryId
  label: string
  hint: string
  kind: Kind
  /** Wording HMRC uses on the online return / SA103S. Empty for non-business. */
  hmrc: string
  box?: string
}

export type CategoryId =
  | 'takings'
  | 'other_income'
  | 'parts'
  | 'van'
  | 'staff'
  | 'premises'
  | 'repairs'
  | 'professional'
  | 'bank'
  | 'phone'
  | 'other'
  | 'equipment'
  | 'personal'
  | 'transfer'

export const CATEGORIES: Category[] = [
  { id: 'takings', label: 'Takings', hint: 'Money from customers', kind: 'income', hmrc: 'Your turnover', box: '9' },
  { id: 'other_income', label: 'Other business income', hint: 'Grants, rebates, interest', kind: 'income', hmrc: 'Any other business income', box: '10' },
  { id: 'parts', label: 'Parts & stock', hint: 'Tyres, chains, cables, anything used on jobs', kind: 'expense', hmrc: 'Cost of goods bought for resale or goods used', box: '11' },
  { id: 'van', label: 'Van, fuel & travel', hint: 'Diesel, van insurance, servicing, parking, tolls', kind: 'expense', hmrc: 'Car, van and travel expenses', box: '12' },
  { id: 'staff', label: 'Staff', hint: 'Paying someone to help', kind: 'expense', hmrc: 'Wages, salaries and other staff costs', box: '13' },
  { id: 'premises', label: 'Rent, power & insurance', hint: 'Workshop/storage rent, electric, business insurance', kind: 'expense', hmrc: 'Rent, rates, power and insurance costs', box: '14' },
  { id: 'repairs', label: 'Repairs to equipment', hint: 'Fixing tools, stands, workshop', kind: 'expense', hmrc: 'Repairs and maintenance of property and equipment', box: '15' },
  { id: 'professional', label: 'Accountant & legal', hint: 'Accountant, solicitor, professional fees', kind: 'expense', hmrc: 'Accountancy, legal and other professional fees', box: '16' },
  { id: 'bank', label: 'Bank & card fees', hint: 'Account fees, card machine fees, interest', kind: 'expense', hmrc: 'Interest and bank and credit card financial costs', box: '17' },
  { id: 'phone', label: 'Phone, internet & office', hint: 'Mobile, broadband, stationery, postage', kind: 'expense', hmrc: 'Phone, fax, stationery and other office costs', box: '18' },
  { id: 'other', label: 'Other business costs', hint: 'Advertising, website, subscriptions, training, workwear', kind: 'expense', hmrc: 'Other allowable business expenses', box: '19' },
  { id: 'equipment', label: 'Tools & equipment', hint: 'Bigger purchases that last: tools, stands, laptop', kind: 'expense', hmrc: 'Equipment (see note)' },
  { id: 'personal', label: 'Personal', hint: 'Not for the business, or money taken for yourself', kind: 'ignore', hmrc: '' },
  { id: 'transfer', label: 'Transfer / tax payment', hint: 'Moving money between your accounts, paying HMRC', kind: 'ignore', hmrc: '' },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>

export const isCategoryId = (v: unknown): v is CategoryId =>
  typeof v === 'string' && v in CATEGORY_BY_ID
