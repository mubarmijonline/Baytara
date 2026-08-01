import { createContext, useContext, useEffect, useState } from 'react';
import { webapi } from './api.js';

export const PREVIEW_MESSAGE_TYPE = 'baytara:site-settings-preview';

const FALLBACK_SETTINGS = {
  header: {
    welcome: 'مرحباً بك في منصة التعلّم البيطري الأولى عربياً',
    app_label: 'تحميل التطبيق',
    help_label: 'المساعدة',
  },
  hero: {
    eyebrow: 'منصة التعلّم البيطري الأولى عربياً',
    title: 'تعلّم من نخبة الأطباء البيطريين في العالم العربي',
    subtitle: 'محتوى بيطري عربي أصيل من خبراء حقيقيين.',
    primary_cta: 'ابدأ التعلّم مجاناً',
    secondary_cta: 'شاهد كيف تعمل',
    featured_label: 'دورة مميّزة',
    featured_title: 'جراحة الحيوانات الصغيرة',
  },
  home: { testimonials_title: 'ماذا يقول متعلّمونا' },
  stats: [],
  testimonials: [],
  about: { title: 'من نحن', body: '' },
  business: { title: 'استثمر في نمو فريقك الطبي', body: '', stats: [], features: [], logos: [] },
  contact: { title: 'تواصل معنا', subtitle: '', email: '', phone: '', address: '', hours: '' },
  socials: {},
  footer: { tagline: '', copyright: '© 2026 بيطرة. جميع الحقوق محفوظة.' },
};

const SiteSettingsContext = createContext(FALLBACK_SETTINGS);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsSecret(value) {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, item]) => key.startsWith('secret_') || containsSecret(item));
}

function merge(base, value) {
  if (!isPlainObject(base) || !isPlainObject(value)) return value;
  const next = { ...base };
  Object.entries(value).forEach(([key, item]) => {
    next[key] = key in base ? merge(base[key], item) : item;
  });
  return next;
}

export function SiteSettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);

  useEffect(() => {
    let active = true;
    webapi.settings()
      .then((response) => {
        const saved = response?.settings;
        if (active && isPlainObject(saved) && !containsSecret(saved)) {
          setSettings(merge(FALLBACK_SETTINGS, saved));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') !== '1') return undefined;
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== PREVIEW_MESSAGE_TYPE) return;
      if (!isPlainObject(event.data.settings) || containsSecret(event.data.settings)) return;
      setSettings(merge(FALLBACK_SETTINGS, event.data.settings));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
