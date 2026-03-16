import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { TokenResponse } from '../types';

export default function Login() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<TokenResponse>('/auth/login', { email, password });
      localStorage.setItem('access_token',  res.data.access_token);
      localStorage.setItem('refresh_token', res.data.refresh_token);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Giriş başarısız. Bilgilerinizi kontrol edin.';
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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E1B4B 100%)' }}
    >
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo + brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600
                          rounded-2xl mb-4 shadow-lg ring-4 ring-white/10">
            <span className="text-white text-xl font-bold font-jakarta">EE</span>
          </div>
          <h1 className="text-3xl font-bold text-white font-jakarta tracking-tight">
            Exam Engine
          </h1>
          <p className="text-indigo-300 text-sm mt-1.5">Sınav Değerlendirme Sistemi</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-modal p-8">
          <h2 className="text-lg font-bold text-gray-900 font-jakarta mb-6">
            Hesabınıza giriş yapın
          </h2>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200
                            rounded-xl text-sm text-red-700">
              <span className="text-base mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="label">E-posta adresi</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="input"
                placeholder="siz@universite.edu.tr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="label">Şifre</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                             hover:text-gray-600 transition-colors text-xs font-medium"
                >
                  {showPwd ? 'Gizle' : 'Göster'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base mt-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Giriş yapılıyor…
                </>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>
        </div>

        {/* Demo hint */}
        <div className="mt-4 px-4 py-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
          <p className="text-xs text-indigo-200 text-center mb-2">Demo hesabı ile giriş yapın:</p>
          <button
            type="button"
            onClick={fillDemo}
            className="w-full text-xs text-center text-white/80 hover:text-white
                       font-mono bg-white/5 hover:bg-white/10 rounded-lg py-1.5 transition-colors"
          >
            admin@university.edu · admin123
          </button>
        </div>
      </div>
    </div>
  );
}
