export type OrderStatus = 'awaiting_payment' | 'placed' | 'preparing' | 'ready' | 'collected' | 'cancelled';
export type PaymentMethod = 'card' | 'store';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

export type Branch = {
  id: string; name: string; district: string; city: string; address: string | null;
  prep_minutes: number; status: 'open' | 'closed' | 'coming_soon'; accepts_orders: boolean; sort: number;
};
export type Category = { id: string; name: string; blurb: string | null; is_drink: boolean; sort: number };
export type Product = {
  id: string; category_id: string; name: string; description: string | null; price: number;
  is_coffee: boolean; has_milk_options: boolean; image_path: string | null; badge: 'fresh' | null; sort: number;
};
export type Milk = { id: string; label: string; extra_price: number; is_plant: boolean; is_default: boolean; sort: number };
export type Campaign = { id: string; tone: 'primary' | 'eco' | 'copper' | 'surface'; eyebrow: string | null; title: string; body: string | null; sort: number };
export type Settings = {
  stamps_per_reward: number; reward_valid_days: number; own_cup_discount: number;
  second_coffee_pct: number; second_coffee_active: boolean; max_counter_stamps: number;
  card_payments_enabled: boolean;
  support_email: string | null; support_phone: string | null;
};

export type Profile = {
  id: string; first_name: string; last_name: string; phone: string | null; birthday: string | null;
  favorite_branch_id: string | null; marketing_opt_in: boolean; member_code: string; stamps: number;
};
export type Reward = { id: string; code: string; earned_at: string; expires_at: string; reserved_order_id: string | null; used_at: string | null };

export type OrderItem = {
  id: number; product_id: string | null; product_name: string; milk_label: string | null;
  unit_price: number; quantity: number; free_quantity: number; is_coffee: boolean;
};
export type Order = {
  id: string; order_no: number; user_id: string | null; customer_name: string | null; branch_id: string;
  status: OrderStatus; payment_method: PaymentMethod; payment_status: PaymentStatus;
  eco_packaging: boolean; own_cup: boolean; subtotal: number; reward_discount: number; campaign_discount: number;
  cup_discount: number; total: number; rewards_used: number; stamps_earned: number;
  created_at: string; ready_at: string | null; collected_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  order_items?: OrderItem[];
  branch?: Pick<Branch, 'name' | 'district' | 'city' | 'prep_minutes'>;
};
export type StaffMembership = { branch_id: string | null; role: 'barista' | 'manager' | 'admin' };
