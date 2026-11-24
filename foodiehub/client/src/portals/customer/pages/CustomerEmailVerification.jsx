import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api } from '../../../services/api';

export default function CustomerEmailVerification() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(location.state?.deliveryError || '');
  const [notice, setNotice] = useState('');
  const [retryAfter, setRetryAfter] = useState(Number(location.state?.retryAfterSeconds) || 0);

  useEffect(() => {
    if (!retryAfter) return undefined;
    const timer = window.setTimeout(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  async function submit(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      await api.post('/auth/customer/verify-email', { email: email.trim().toLowerCase(), otp });
      setNotice('Your email is verified. Sign in to continue.');
      window.setTimeout(() => navigate('/customer/login', { replace: true, state: location.state?.returnTo ? { returnTo: location.state.returnTo } : undefined }), 700);
    } catch (requestError) {
      const status = requestError.response?.status;
      const code = requestError.response?.data?.code;
      if (code === 'OTP_EXPIRED') setError('Your verification code has expired. Please request a new code.');
      else if (code === 'OTP_ATTEMPTS_EXCEEDED' || status === 429) setError('Too many verification attempts. Please request a new code later.');
      else if (code === 'OTP_INVALID') setError('The verification code is incorrect.');
      else setError('We could not verify that code. Please try again.');
    }
    finally { setBusy(false); }
  }

  async function resend() {
    setError(''); setNotice(''); setResending(true);
    try {
      const response = await api.post('/auth/customer/resend-email-otp', { email: email.trim().toLowerCase() });
      setNotice('A verification code has been sent to your email.');
      setRetryAfter(Number(response.data?.retryAfterSeconds) || 45);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 429) setError('Too many verification requests. Please wait before requesting another code.');
      else if (status === 503) setError('We couldn\'t send your verification email right now. Please try again later.');
      else if (status === 404) setError('No customer account awaiting email verification was found for this email. Check the address or register.');
      else if (status === 409) setError('This email is already verified or the account cannot be verified. Please sign in or contact support.');
      else setError('We could not send a new code. Please check the email address and try again.');
      if (requestError.response?.data?.retryAfterSeconds) setRetryAfter(requestError.response.data.retryAfterSeconds);
    } finally { setResending(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] p-5"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-orange-100 bg-white p-8 shadow-xl">
    <Link to="/" className="text-xl font-extrabold">Foodie<span className="text-orange-500">Hub</span></Link>
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><MailCheck size={28}/></div>
    <div><h1 className="text-3xl font-bold text-slate-900">Check your email</h1><p className="mt-2 text-sm leading-6 text-slate-600">Enter the six-digit verification code we sent to your email. The code expires in five minutes.</p></div>
    <label className="block text-sm font-semibold text-slate-700">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3"/></label>
    <label className="block text-sm font-semibold text-slate-700">Verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-center text-2xl font-bold tracking-[0.45em]" aria-label="Six-digit verification code"/></label>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <button disabled={busy || otp.length !== 6} className="w-full rounded-xl bg-orange-500 p-3 font-bold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify email'}</button>
    <button type="button" disabled={resending || retryAfter > 0} onClick={resend} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{resending ? 'Sending…' : retryAfter ? `Resend code in ${retryAfter}s` : 'Resend verification code'}</button>
    <Link to="/customer/register" className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-orange-600"><ArrowLeft size={15}/> Back to registration</Link>
  </form></main>;
}
