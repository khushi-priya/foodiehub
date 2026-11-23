import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { downloadSupportAttachment, fileSize } from './supportUtils';

export default function SupportAttachmentList({ api, endpoint, attachments = [] }) {
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');
  if (!attachments.length) return null;
  const download = async (attachment) => {
    setDownloading(attachment.id); setError('');
    try { await downloadSupportAttachment(api, endpoint, attachment); }
    catch { setError('The attachment could not be downloaded.'); }
    finally { setDownloading(''); }
  };
  return <div className="mt-3 space-y-1.5">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="min-w-0 truncate text-xs font-medium text-slate-700">{attachment.fileName}<span className="ml-2 text-slate-400">{fileSize(attachment.sizeBytes)}</span></span><button type="button" onClick={() => download(attachment)} disabled={!!downloading} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-600 disabled:opacity-50">{downloading === attachment.id ? <LoaderCircle className="animate-spin" size={14}/> : <Download size={14}/>}Download</button></div>)}{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>;
}
