/**
 * What the logged-in trekker holds per trek, so trek cards can show
 * "Join Waitlist" or "Waitlist #N" without each card calling the API.
 * Pages showing cards call refreshMyTreks() once when they load.
 *
 * Join/leave are shared by TrekCard and TrekDetails.
 */
import { reactive } from 'vue';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { toast } from '../components/Toast.js';
import { del, get, post } from '../api.js';

export const myTreks = reactive({ waiting: {}, booked: {} });

export async function refreshMyTreks() {
  try {
    const [bookings, waitlist] = await Promise.all([get('/user/bookings?status=Booked&per_page=100'), get('/user/waitlist')]);
    myTreks.booked = Object.fromEntries(bookings.items.map((b) => [b.trek_id, b]));
    myTreks.waiting = Object.fromEntries(waitlist.items.filter((w) => w.status === 'Waiting').map((w) => [w.trek_id, w]));
  } catch {
    /* cards still work; a join attempt would get a clear error from the API */
  }
}

export async function joinWaitlist(trek) {
  try {
    const res = await post(`/treks/${trek.id}/waitlist`);
    toast.success(res.message);
    await refreshMyTreks();
    return true;
  } catch (error) {
    toast.error(error.message);
    return false;
  }
}

export async function leaveWaitlist(trek, position) {
  const ok = await confirmDialog({
    title: 'Leave the waitlist?',
    message: `You'll lose your place (#${position}) for ${trek.name}.`,
    confirmText: 'Leave waitlist',
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    const res = await del(`/treks/${trek.id}/waitlist`);
    toast.info(res.message);
    await refreshMyTreks();
    return true;
  } catch (error) {
    toast.error(error.message);
    return false;
  }
}
