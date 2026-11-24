import { io } from 'socket.io-client';
import { api } from './api';

export function connectFloorSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  const events = [
    'floor:occupancy-updated',
    'floor:waiter-assigned',
    'floor:table-transferred',
    'floor:tables-merged',
    'floor:tables-split',
    'floor:reservation-updated',
    'floor:order-updated',
  ];
  for (const event of events) socket.on(event, onEvent);
  return () => {
    for (const event of events) socket.off(event, onEvent);
    socket.disconnect();
  };
}

export function connectCustomerReservationSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('customer:reservation-updated', onEvent);
  return () => {
    socket.off('customer:reservation-updated', onEvent);
    socket.disconnect();
  };
}

export function connectCustomerSupportSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('customer:support-updated', onEvent);
  return () => {
    socket.off('customer:support-updated', onEvent);
    socket.disconnect();
  };
}

export function connectCustomerNotificationSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('customer:notification', onEvent);
  return () => {
    socket.off('customer:notification', onEvent);
    socket.disconnect();
  };
}

export function connectCustomerDeliverySocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  const events = ['delivery:customer-updated', 'delivery:location-updated', 'delivery:location-cleared'];
  for (const event of events) socket.on(event, onEvent);
  return () => {
    for (const event of events) socket.off(event, onEvent);
    socket.disconnect();
  };
}

export function connectAdminNotificationSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('admin:notification', onEvent);
  return () => {
    socket.off('admin:notification', onEvent);
    socket.disconnect();
  };
}

export function connectRestaurantSupportSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('restaurant:support-updated', onEvent);
  return () => {
    socket.off('restaurant:support-updated', onEvent);
    socket.disconnect();
  };
}

export function connectRestaurantNotificationSocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('restaurant:notification', onEvent);
  return () => {
    socket.off('restaurant:notification', onEvent);
    socket.disconnect();
  };
}

export function connectDeliverySocket(onEvent) {
  const apiOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  const socket = io(apiOrigin, { withCredentials: true, transports: ['websocket', 'polling'] });
  const events = ['delivery:assignment-updated', 'delivery:no-eligible-staff', 'delivery:location-updated', 'delivery:location-cleared', 'delivery:cash-handover-updated'];
  for (const event of events) socket.on(event, (payload) => onEvent(event, payload));
  return () => {
    for (const event of events) socket.off(event);
    socket.disconnect();
  };
}
