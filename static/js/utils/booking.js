/**
 * "Book Now" behaves the same everywhere (dashboard cards, trek details):
 * confirm -> POST /api/bookings (holds a seat) -> Checkout to pay.
 */
import { confirmDialog } from '../components/ConfirmDialog.js';
import { toast } from '../components/Toast.js';
import { post } from '../api.js';
import { formatMoney, formatRange } from './format.js';

export async function startBooking(trek, router) {
  const ok = await confirmDialog({
    title: `Book ${trek.name}?`,
    message: `${formatRange(trek.start_date, trek.end_date)} · ${formatMoney(trek.price)}. `
      + "We'll hold your seat for 30 minutes while you pay.",
    confirmText: 'Book & pay',
  });
  if (!ok) return false;
  try {
    const result = await post('/bookings', { trek_id: trek.id });
    toast.success('Seat held. Complete payment to confirm it.');
    router.push(`/user/checkout/${result.booking.id}`);
    return true;
  } catch (error) {
    toast.error(error.message);
    return false;
  }
}
