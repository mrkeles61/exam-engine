import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { TokenResponse } from '../types';
import { useLang } from '../i18n';

export default function Login() {
  const navigate = useNavigate();
  const { t } = useLang();
  const tt = t as (key: string, vars?: Record<string, string | number>) => string;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<TokenResponse>('/auth/login', { email, password });
      localStorage.setItem('access_token', res.data.access_token);
      localStorage.setItem('refresh_token', res.data.refresh_token);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        tt('login.loginFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('admin@university.edu');
    setPassword('admin123');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow flex flex-col md:flex-row min-h-screen">
        {/* Left Side: Form (60%) */}
        <section className="w-full md:w-[60%] bg-surface-container-lowest flex flex-col px-8 md:px-20 py-10 relative">
          {/* Brand Header */}
          <div className="flex items-center gap-3 mb-auto">
            <img src="/iku-logo.svg" alt="İKÜ" className="w-10 h-10" />
            <span className="text-xl font-extrabold tracking-tighter text-iku-black">Exam Engine</span>
          </div>

          {/* Login Form Container */}
          <div className="max-w-md w-full mx-auto py-12">
            <div className="mb-10">
              <h1 className="text-2xl font-semibold text-iku-black mb-2">{tt('login.welcome')}</h1>
              <p className="text-sm text-on-surface-variant">{tt('login.signInSubtitle')}</p>
            </div>

            <div className="space-y-6">
              {/* Google Auth */}
              <button className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors duration-200">
                <span className="material-symbols-outlined text-xl">account_circle</span>
                <span className="text-sm font-medium text-on-surface">{tt('login.continueWithGoogle')}</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-outline-variant/30" />
                <span className="flex-shrink mx-4 text-xs text-outline font-medium uppercase tracking-widest">{tt('login.or')}</span>
                <div className="flex-grow border-t border-outline-variant/30" />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-error-container rounded-xl text-sm text-on-error-container">
                  <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant">{tt('login.email')}</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    className="input"
                    placeholder="name@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant">{tt('login.password')}</label>
                    <a className="text-xs font-semibold text-iku-red hover:opacity-80" href="#">{tt('login.forgotPassword')}</a>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      className="input pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-iku-red transition-colors"
                    >
                      <span className="material-symbols-outlined text-xl">
                        {showPwd ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-iku-red text-white rounded-lg font-semibold text-sm
                             hover:bg-iku-red-dark active:scale-[0.98] transition-all duration-150
                             shadow-lg shadow-iku-red/10 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {tt('login.signingIn')}
                    </span>
                  ) : (
                    tt('login.signIn')
                  )}
                </button>
              </form>

              {/* Demo hint */}
              <div className="pt-4 border-t border-outline-variant/20">
                <p className="text-center text-xs text-on-surface-variant mb-2">{tt('login.demoAccount')}</p>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="w-full text-xs text-center text-iku-red hover:text-iku-red-dark
                             font-mono bg-surface-container-low hover:bg-surface-container rounded-lg py-2 transition-colors"
                >
                  admin@university.edu &middot; admin123
                </button>
              </div>
            </div>
          </div>
          <div className="mt-auto" />
        </section>

        {/* Right Side: Hero (40%) */}
        <section className="hidden md:flex w-[40%] bg-gradient-to-br from-iku-black to-iku-charcoal relative overflow-hidden items-center justify-center p-12">
          <div className="absolute top-0 right-0 w-96 h-96 bg-iku-red/20 rounded-full blur-[100px] -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-iku-red/10 rounded-full blur-[80px] -ml-40 -mb-40" />

          <div className="relative z-10 w-full max-w-lg text-center">
            <img src="/iku-logo.svg" alt="İKÜ" className="w-24 h-24 mx-auto mb-8" />
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">{tt('login.heroTitle')}</h2>
            <p className="text-white/70 text-sm leading-relaxed mb-8">
              {tt('login.heroSubtitle')}
            </p>

            {/* Glass insight card */}
            <div className="glass-panel p-6 rounded-xl max-w-[280px] mx-auto shadow-2xl text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-iku-red/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-iku-red text-lg">neurology</span>
                </div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">{tt('login.aiInsight')}</span>
              </div>
              <p className="text-white/85 text-sm leading-relaxed">
                {tt('login.insightBody')}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
