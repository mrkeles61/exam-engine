import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useLang();
  const tt = t as (key: string, vars?: Record<string, string | number>) => string;
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)' }}
    >
      <div className="text-center animate-fade-up">
        <div className="text-8xl font-black text-white/10 font-jakarta select-none mb-4">
          404
        </div>
        <div className="w-16 h-16 bg-iku-red/20 rounded-2xl flex items-center
                        justify-center mx-auto mb-6 text-3xl">
          🧭
        </div>
        <h1 className="text-2xl font-bold text-white font-jakarta">{tt('nf.title')}</h1>
        <p className="text-iku-silver text-sm mt-2 mb-8">
          {tt('nf.message')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary px-8 py-3"
        >
          {tt('nf.backHome')}
        </button>
      </div>
    </div>
  );
}
