import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import '@/locale/i18n';
import { initPegasusTransport } from '@webext-pegasus/transport/popup';
import { getPegasusStoreReady, usePegasusStore } from '@/shared/lib/pegasus-store';
import Welcome from './Welcome';
import { useI18n } from '@/shared/hooks/useI18n';

const Onboarding = () => {
  const theme = usePegasusStore((state) => state.theme);
  const { t } = useI18n();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return <Welcome t={t} />;
};

initPegasusTransport();
getPegasusStoreReady().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Onboarding />
    </React.StrictMode>,
  );
});
