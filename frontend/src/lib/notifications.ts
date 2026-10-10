import type { NotificationItem, Role } from '@/lib/types';

/** Notifications-center URL per portal. */
export function centerHrefFor(role: Role): string {
  return role === 'Owner'
    ? '/owner/notifications'
    : role === 'Secretary'
      ? '/secretary/notifications'
      : role === 'Client'
        ? '/client/notifications'
        : '/driver/notifications';
}

/**
 * Deep link for a notification: the exact section it belongs to.
 * Every notification is clickable and lands on its related screen —
 * never just the center. Unknown types (or items without a linked order)
 * fall back to the role's notifications center.
 */
export function notificationHref(n: NotificationItem, role: Role): string {
  const center = centerHrefFor(role);
  const orderId = n.relatedOrderId ?? undefined;
  switch (n.notificationType) {
    case 'order_pending':
      if (role === 'Owner') return orderId ? `/owner/approvals/${orderId}` : '/owner/approvals';
      if (role === 'Secretary') return orderId ? `/secretary/approvals/${orderId}` : '/secretary/approvals';
      return center;
    case 'route_assigned':
    case 'stores_assigned':
      return role === 'Driver' ? '/driver' : center;
    case 'order_approved':
      if (role === 'Client') return orderId ? `/client/track/${orderId}` : '/client/track';
      if (role === 'Driver') return '/driver';
      return center;
    case 'order_rejected':
      return role === 'Client' ? '/client/orders' : center;
    case 'order_cancelled':
      if (role === 'Owner') return '/owner/orders';
      if (role === 'Secretary') return '/secretary/kanban';
      if (role === 'Client') return '/client/orders';
      return '/driver';
    case 'order_completed':
      if (role === 'Owner') return '/owner/proof';
      if (role === 'Secretary') return orderId ? `/secretary/track/${orderId}` : '/secretary/monitoring';
      if (role === 'Client') return '/client/proof';
      return '/driver';
    case 'stop_failed':
      if (role === 'Owner') return '/owner/orders';
      if (role === 'Secretary') return orderId ? `/secretary/track/${orderId}` : '/secretary/monitoring';
      if (role === 'Client') return orderId ? `/client/track/${orderId}` : '/client/track';
      return '/driver';
    case 'broadcast':
      return center;
    default:
      // Future/unknown types: order-linked items still deep-link to the
      // best per-role detail view instead of stranding the user.
      if (orderId) {
        if (role === 'Owner') return '/owner/orders';
        if (role === 'Secretary') return `/secretary/track/${orderId}`;
        if (role === 'Client') return `/client/track/${orderId}`;
        return '/driver';
      }
      return center;
  }
}
