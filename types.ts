
export interface Product {
  id: string;
  name: string;
  code: string;
  cost: number;
  price: number;
  category: string;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
  originalPrice: number;
  discountValue: number;
  discountType: 'amount' | 'percent';
}

export enum UserRole {
  OWNER = 'OWNER',
  STAFF = 'STAFF'
}

// Added DiscountType enum to fix errors in DiscountSelector.tsx
export enum DiscountType {
  PERCENTAGE = 'percent',
  FIXED = 'amount'
}

// Added Discount interface to fix errors in DiscountSelector.tsx
export interface Discount {
  type: DiscountType;
  value: number;
}

export interface PromotionStep {
  minQty: number;
  price: number;
}

export interface Promotion {
  id: string;
  name: string;
  active: boolean;
  targetProductIds: string[]; // Updated to support multiple SKUs
  steps: PromotionStep[];
}

export interface SaleRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  billDiscountValue: number;
  billDiscountType: 'amount' | 'percent';
  total: number;
  timestamp: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  logistics: LogisticsProvider;
  destinationBranch?: string;
  createdByRole: UserRole;
}

export type OrderStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
export type PaymentMethod = 'Cash' | 'Transfer' | 'COD';
export type PaymentStatus = 'Paid' | 'Outstanding';
export type LogisticsProvider = 'อนุชิต' | 'มีไช' | 'รุ่งอรุณ' | 'รับสินค้าเอง';
export type AppMode = 'DASHBOARD' | 'ORDERS' | 'STOCK' | 'REPORTS' | 'SETTINGS' | 'PROMOTIONS';
export type Language = 'th' | 'lo' | 'en';