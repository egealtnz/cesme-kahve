import { Redirect, useLocalSearchParams } from 'expo-router';

/** cesmekahve://odeme-sonucu?order=…&status=… — where iyzico's callback sends the browser back to. */
export default function PaymentReturn() {
  const { order, status } = useLocalSearchParams<{ order?: string; status?: string }>();
  if (!order) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/order/[id]', params: { id: order, fresh: '1', outcome: status ?? 'pending' } }} />;
}
