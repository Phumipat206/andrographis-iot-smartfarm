import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Facebook, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1200&q=80')`,
        }}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 text-center">
        <p className="text-white/80 text-xl font-light italic mb-2">{t.welcome.welcomeTo}</p>
        <h1 className="text-white text-5xl lg:text-6xl font-bold mb-2">{t.welcome.title}</h1>
        <p className="text-secondary-green text-sm lg:text-base italic mb-12">
          {t.welcome.subtitle}
        </p>

        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-green-500 to-green-600 text-white text-lg font-semibold shadow-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 hover:shadow-xl active:scale-95"
          >
            {t.welcome.login}
          </button>
          <button
            onClick={() => navigate('/register')}
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-green-500/80 to-green-600/80 text-white text-lg font-semibold shadow-lg hover:from-green-600/90 hover:to-green-700/90 transition-all duration-300 hover:shadow-xl active:scale-95 backdrop-blur-sm"
          >
            {t.welcome.register}
          </button>
        </div>

        <p className="text-white/60 text-xs mt-6 max-w-[280px] leading-relaxed">
          {t.welcome.notice}
        </p>
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-6 px-6 text-white/70 text-sm space-y-1">
        <div className="flex items-center gap-2">
          <Facebook className="w-4 h-4" />
          <span>: Andrographis Smart farm</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          <span>: 093-5899990</span>
        </div>
      </div>
    </div>
  );
}
