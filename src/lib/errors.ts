/** Server error codes (from SQL functions and edge functions) → messages customers understand. */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Oturumun sona ermiş. Lütfen tekrar giriş yap.',
  profile_missing: 'Hesap bilgilerin bulunamadı. Çıkış yapıp tekrar giriş yap.',
  branch_not_found: 'Bu şubeyi bulamadık. Başka bir şube seç.',
  branch_not_accepting_orders: 'Bu şube şu an uygulamadan sipariş almıyor. Başka bir şube seç.',
  too_many_open_orders: 'Aynı anda en fazla 3 açık siparişin olabilir. Önceki siparişlerin teslim alınınca yenisini verebilirsin.',
  invalid_items: 'Sepetinde bir sorun var. Ürünleri kontrol edip tekrar dene.',
  invalid_quantity: 'Bir ürünün adedi geçersiz.',
  order_too_large: 'Tek siparişte en fazla 50 ürün olabilir.',
  product_unavailable: 'Sepetindeki bir ürün artık menüde değil. Sepetini güncelledik.',
  product_sold_out: 'Sepetindeki bir ürün bu şubede tükendi.',
  milk_unavailable: 'Seçtiğin süt şu an yok. Başka bir süt seç.',
  milk_not_allowed: 'Bu ürüne süt seçilemiyor.',
  cannot_cancel: 'Bu sipariş artık iptal edilemiyor. Şubeyle iletişime geçebilirsin.',
  order_not_found: 'Siparişi bulamadık.',
  order_not_awaiting_payment: 'Bu siparişin ödemesi zaten tamamlanmış ya da iptal edilmiş.',
  card_payments_disabled: 'Kartla ödeme şu an kapalı. Şubede ödeyerek sipariş verebilirsin.',
  phone_required: 'Kartla ödeme için cep telefonun gerekli. Hesap bilgilerinden ekleyebilirsin.',
  payment_provider_unavailable: 'Ödeme sistemine şu an ulaşılamıyor. Biraz sonra tekrar dene ya da şubede öde.',
  payment_init_failed: 'Ödeme sayfası açılamadı. Tekrar dene ya da şubede öde.',
  payment_signature_invalid: 'Ödeme doğrulanamadı. Tekrar dene.',
  not_allowed: 'Bu işlem için yetkin yok.',
  invalid_transition: 'Sipariş bu duruma geçirilemez.',
  refund_required: 'Kartla ödenmiş sipariş iade yapılmadan iptal edilemez. İadeyi iyzico panelinden yap.',
  reward_not_found: 'Bu hediye kahve kodu bulunamadı.',
  reward_already_used: 'Bu hediye kahve daha önce kullanılmış.',
  reward_reserved: 'Bu hediye kahve açık bir siparişte kullanılıyor.',
  reward_expired: 'Bu hediye kahvenin süresi dolmuş.',
  member_not_found: 'Bu kahve kartı bulunamadı.',
  delete_failed: 'Hesabın şu an silinemedi. Biraz sonra tekrar dene.',
  network: 'İnternet bağlantını kontrol edip tekrar dene.',
  invalid_credentials: 'E-posta ya da şifre hatalı.',
  email_not_confirmed: 'E-posta adresini henüz doğrulamadın.',
  user_already_exists: 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.',
  weak_password: 'Şifren en az 8 karakter olmalı, harf ve rakam içermeli.',
  otp_expired: 'Kodun süresi dolmuş ya da kod hatalı. Yeni kod iste.',
  over_email_send_rate_limit: 'Çok sık kod istedin. Bir dakika sonra tekrar dene.',
};

export function errorCode(e: unknown): string {
  const anyE = e as { code?: string; message?: string; error?: string } | null;
  const raw = String(anyE?.code ?? anyE?.error ?? anyE?.message ?? e ?? '');
  const msg = String(anyE?.message ?? '');
  if (/Failed to fetch|Network request failed|NetworkError/i.test(msg)) return 'network';
  for (const k of Object.keys(MESSAGES)) if (raw.startsWith(k) || msg.startsWith(k)) return k;
  return raw || 'unknown';
}

export function errorMessage(e: unknown): string {
  return MESSAGES[errorCode(e)] ?? 'Bir şeyler ters gitti. Tekrar dene.';
}
