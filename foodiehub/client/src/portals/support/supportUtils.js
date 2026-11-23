export const SUPPORT_CATEGORIES = [
  'Account & Login', 'Restaurant Profile', 'Branch Management', 'Employee & Permissions',
  'Menu & Food Items', 'Orders', 'Kitchen & Tables', 'QR Code Issues', 'Payments & Refunds',
  'Subscription & Billing', 'Technical Issues', 'Other',
];

export const SUPPORT_STATUSES = [
  ['open', 'Open'], ['in_progress', 'In Progress'], ['waiting_for_restaurant', 'Waiting for Restaurant'], ['resolved', 'Resolved'], ['closed', 'Closed'],
];

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const statusLabel = (status) => SUPPORT_STATUSES.find(([value]) => value === status)?.[1] || status;
export const formatDate = (value) => value ? new Date(value).toLocaleString() : '—';
export const fileSize = (size) => size < 1024 ? `${size} B` : `${(size / 1024).toFixed(0)} KB`;

export async function encodeAttachments(files) {
  return Promise.all([...files].map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, contentType: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  })));
}

export async function downloadSupportAttachment(api, endpoint, attachment) {
  const response = await api.get(`${endpoint}/${attachment.id}`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateFiles(files) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
  const selected = [...files];
  if (selected.length > 3) return 'Attach no more than 3 files.';
  if (selected.some((file) => !allowed.has(file.type))) return 'Use PNG, JPG, WebP, PDF or plain text files.';
  if (selected.some((file) => file.size > 700 * 1024)) return 'Each file must be smaller than 700 KB.';
  if (selected.reduce((sum, file) => sum + file.size, 0) > 1024 * 1024) return 'Attachments must total no more than 1 MB.';
  return '';
}
