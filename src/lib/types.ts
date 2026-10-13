export type OrderStatus = 'awaiting_payment' | 'placed' | 'preparing' | 'ready' | 'collected' | 'cancelled';
export type PaymentMethod = 'card' | 'store';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

/** Opening hours by ISO weekday ("1" = Monday … "7" = Sunday), Turkey time; a missing day is closed. */
export type OpeningHours = Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', [string, string]>>;
export type Branch = {
  id: string; name: string; district: string; city: string; address: string | null;
  prep_minutes: number; status: 'open' | 'closed' | 'coming_soon'; accepts_orders: boolean; sort: number;
  opening_hours?: OpeningHours | null; busy_extra_minutes?: number; busy_until?: string | null; paused_until?: string | null;
};
export type Category = { id: string; name: string; blurb: string | null; is_drink: boolean; sort: number; is_active?: boolean };
export type Product = {
  id: string; category_id: string; name: string; description: string | null; price: number;
  is_coffee: boolean; has_milk_options: boolean; image_path: string | null; badge: 'fresh' | null; sort: number;
  is_active?: boolean;
};
export type Milk = { id: string; label: string; extra_price: number; is_plant: boolean; is_default: boolean; sort: number; is_active?: boolean };
export type Campaign = {
  id: string; tone: 'primary' | 'eco' | 'copper' | 'surface'; eyebrow: string | null; title: string; body: string | null; sort: number;
  is_active?: boolean; starts_at?: string | null; ends_at?: string | null;
};
export type Settings = {
  stamps_per_reward: number; reward_valid_days: number; own_cup_discount: number;
  second_coffee_pct: number; second_coffee_active: boolean; max_counter_stamps: number;
  card_payments_enabled: boolean;
  support_email: string | null; support_phone: string | null;
  birthday_reward_enabled?: boolean; birthday_reward_days?: number;
  winback_enabled?: boolean; winback_after_days?: number; winback_title?: string; winback_body?: string;
};

export type Profile = {
  id: string; first_name: string; last_name: string; phone: string | null; birthday: string | null;
  favorite_branch_id: string | null; marketing_opt_in: boolean; member_code: string; stamps: number;
};
export type Reward = {
  id: string; code: string; earned_at: string; expires_at: string; reserved_order_id: string | null; used_at: string | null;
  reason?: 'stamps' | 'birthday' | 'gift';
};
export type Favorite = { id: number; product_id: string; milk_id: string | null; created_at: string };
export type OrderRating = { liked: boolean; comment: string | null };

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
  pickup_at?: string | null;
  order_items?: OrderItem[];
  order_ratings?: OrderRating | null;
  /** Staff actions on the order (branch staff only). */
  order_events?: OrderEvent[];
  branch?: Pick<Branch, 'name' | 'district' | 'city' | 'prep_minutes'>;
};
export type OrderEvent = { status: OrderStatus; actor_name: string | null; created_at: string };
export type StaffRole = 'barista' | 'manager' | 'admin';
export type StaffMembership = { branch_id: string | null; role: StaffRole };
export type TeamMember = {
  user_id: string; email: string; first_name: string | null; last_name: string | null;
  role: StaffRole; since: string; is_me: boolean;
};
export type TeamInvite = { email: string; role: StaffRole; since: string };
export type BranchTeam = { members: TeamMember[]; invites: TeamInvite[] };

// ---------------------------------------------------------------- owner report
export type Report = {
  totals: { orders: number; revenue: number; avg_ticket: number; coffees: number; cancelled: number; customers: number; likes: number; dislikes: number; scheduled: number };
  by_branch: { branch_id: string; name: string; orders: number; revenue: number; likes: number; dislikes: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  by_hour: { hour: number; orders: number }[];
  by_day: { day: string; orders: number; revenue: number }[];
  comments: { liked: boolean; comment: string; created_at: string; branch: string; order_no: number }[];
};
export type ExportRow = {
  order_no: number; created_at: string; pickup_at: string | null; branch: string; customer: string; status: string;
  payment: string; subtotal: number; discount: number; total: number; items: string; liked: boolean | null; comment: string | null;
  handled_by: string | null;
};
export type PushCampaign = { id: number; title: string; body: string; branch_id: string | null; recipients: number; created_at: string };

// ---------------------------------------------------------------- company panel (admins)
export type LiveBranch = {
  branch_id: string; waiting: number; scheduled: number; preparing: number; ready: number; oldest_waiting_at: string | null;
  today_orders: number; today_revenue: number; today_cancelled: number; sold_out: number; staff: number;
};
export type LiveOverview = { generated_at: string; branches: LiveBranch[] };
export type CompanyStaffMember = {
  user_id: string; branch_id: string | null; role: StaffRole; email: string; first_name: string | null; last_name: string | null;
  since: string; last_sign_in_at: string | null; is_me: boolean;
};
export type CompanyStaff = { members: CompanyStaffMember[]; invites: { email: string; branch_id: string; role: StaffRole; since: string }[] };
export type CustomerRow = {
  id: string; first_name: string; last_name: string; email: string; phone: string | null; stamps: number; created_at: string;
  rewards: number; orders: number; spent: number; last_order_at: string | null; is_staff: boolean;
};
export type CustomerSearch = { total: number; new_7d: number; opted_in: number; results: CustomerRow[] };
export type CustomerDetail = {
  id: string; first_name: string; last_name: string; email: string; phone: string | null; birthday: string | null; member_code: string;
  stamps: number; marketing_opt_in: boolean; created_at: string; favorite_branch: string | null;
  staff: { branch_id: string | null; role: StaffRole }[];
  stats: { orders: number; spent: number; cancelled: number; first_order_at: string | null; last_order_at: string | null };
  rewards: { code: string; reason: 'stamps' | 'birthday' | 'gift'; earned_at: string; expires_at: string }[];
  orders: { id: string; order_no: number; branch: string; status: OrderStatus; total: number; created_at: string }[];
};
export type AdminOrderRow = {
  id: string; order_no: number; branch_id: string; customer_name: string | null; email: string | null; status: OrderStatus;
  payment_method: PaymentMethod; payment_status: PaymentStatus; total: number; created_at: string; pickup_at: string | null; items: string | null;
};
