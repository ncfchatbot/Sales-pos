
export interface Product {
  id: string;
  name: string;
  cost: number;
  price: number;
  category: string;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
  itemDiscount?: Discount;
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED'
}

export interface Discount {
  type: DiscountType;
  value: number;
}

export interface OrderSummary {
  subtotal: number;
  itemDiscountTotal: number;
  billDiscountAmount: number;
  total: number;
  profit: number; // Added profit calculation
}

export type TransactionStatus = 'completed' | 'cancelled';
export type PaymentStatus = 'paid' | 'pending';
export type PaymentMethod = 'transfer' | 'cod' | 'cash';
export type ShippingCarrier = 'anouchit' | 'mixay' | 'roung_aloun' | 'pickup' | '';

export interface Transaction extends OrderSummary {
  id: string;
  timestamp: Date;
  items: CartItem[];
  status: TransactionStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  shippingCarrier: ShippingCarrier;
  shippingBranch: string;
  appliedDiscount: Discount | null;
}

export interface ShopSettings {
  name: string;
  address: string;
  phone: string;
  logo: string; 
  logoType: 'emoji' | 'image';
}

export type View = 'dashboard' | 'pos' | 'stock' | 'reports' | 'settings';
export type Language = 'TH' | 'LA' | 'EN';
