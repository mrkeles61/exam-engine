import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)' }}
    >
      <div className="text-center animate-fade-up">
        <div className="text-8xl font-black text-white/10 font-jakarta select-none mb-4">
          404
        </div>
        <div className="w-16 h-16 bg-primary-600/20 rounded-2xl flex items-center
                        justify-center mx-auto mb-6 text-3xl">
          🧭
        </div>
        <h1 className="text-2xl font-bold text-white font-jakarta">Sayfa Bulunamadı</h1>
        <p className="text-indigo-300 text-sm mt-2 mb-8">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary px-8 py-3"
        >
          Ana Sayfaya Dön
        </button>
      </div>
    </div>
  );
}
