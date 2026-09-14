import { useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, FolderOpen, Search, Bookmark, Play, Sparkles } from 'lucide-react';
import { PLATFORM_CONFIG } from '@/shared/types/platform';
import './welcome.css';

// Same tutorial as better-sidebar-landing/docs/*/index.mdx.
const TUTORIAL_ID = 'XEPqPO7Az5Y';
const TUTORIAL_URL = `https://www.youtube.com/watch?v=${TUTORIAL_ID}`;
type Props = { t: (key: string) => string };

export default function Welcome({ t }: Props) {
  const [playing, setPlaying] = useState(false);
  const platforms = [PLATFORM_CONFIG.gemini, PLATFORM_CONFIG.aistudio].filter(p => p.supported);
  const features = [
    { icon: FolderOpen, key: 'organize' },
    { icon: Search, key: 'find' },
    { icon: Bookmark, key: 'reuse' },
  ];
  return <div className="welcome-page">
    <div className="welcome-shell">
      <header className="welcome-nav">
        <a href="#" className="welcome-brand"><img src="/icons/icon128.png" alt="" />Better Sidebar</a>
        <span className="welcome-ready"><Check size={14} aria-hidden="true" />{t('onboarding.ready')}</span>
      </header>
      <main>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-intro">
            <p className="welcome-eyebrow"><Sparkles size={15} aria-hidden="true" />{t('onboarding.welcome')}</p>
            <h1 id="welcome-title">{t('onboarding.headline')}<br /><span>{t('onboarding.headlineAccent')}</span></h1>
            <p className="welcome-lede">{t('onboarding.intro')}</p>
            <div className="welcome-actions">
              <a className="welcome-primary" href="#start">{t('onboarding.getStarted')}<ArrowDown size={17} aria-hidden="true" /></a>
              <a className="welcome-text-link" href="#tutorial"><Play size={15} aria-hidden="true" />{t('onboarding.watch')}</a>
            </div>
          </div>
          <div className="welcome-showcase">
            <div className="welcome-window-bar"><span aria-hidden="true">● ● ●</span><span>BETTER SIDEBAR / GEMINI</span></div>
            <img className="welcome-product" src="/onboarding/overview.webp" alt={t('onboarding.previewAlt')} width="1600" height="911" />
            <div className="welcome-caption"><span className="welcome-dot" />{t('onboarding.previewCaption')}<span aria-hidden="true">↗</span></div>
          </div>
        </section>
        <section className="welcome-features" aria-label={t('onboarding.basics')}>
          {features.map(({ icon: Icon, key }, i) => <article className={`welcome-feature welcome-feature-${key}`} key={key}>
            <div className="welcome-feature-top"><Icon size={22} aria-hidden="true" /><span>0{i + 1}</span></div>
            <h2>{t(`onboarding.${key}Title`)}</h2><p>{t(`onboarding.${key}Body`)}</p>
          </article>)}
        </section>
        <section id="start" className="welcome-start" aria-labelledby="start-title">
          <div><p className="welcome-eyebrow">01 / {t('onboarding.startLabel')}</p><h2 id="start-title">{t('onboarding.choose')}</h2><p className="welcome-subtitle">{t('onboarding.loginRequired')}</p></div>
          <div className="welcome-platforms">{platforms.map(platform => <a key={platform.id} href={platform.urlPattern} target="_blank" rel="noreferrer" className="welcome-platform">
            <img src={platform.icon} alt="" /><span><strong>{platform.name}</strong><small>{platform.hostname}</small></span><ArrowUpRight size={20} aria-hidden="true" />
          </a>)}</div>
          <p className="welcome-next"><Check size={17} aria-hidden="true" />{t('onboarding.firstStep')}</p>
        </section>
        <section id="tutorial" className="welcome-tutorial" aria-labelledby="tutorial-title">
          <div className="welcome-tutorial-copy"><p className="welcome-eyebrow">02 / {t('onboarding.watch')}</p><h2 id="tutorial-title">{t('onboarding.tutorialTitle')}</h2><p>{t('onboarding.tutorialBody')}</p><a href={TUTORIAL_URL} target="_blank" rel="noreferrer" className="welcome-text-link">{t('onboarding.openYoutube')}<ArrowUpRight size={16} aria-hidden="true" /></a><small>{t('onboarding.videoNote')}</small><div><a href="https://papercranedev.com/better-sidebar/guide/getting-started" target="_blank" rel="noopener noreferrer" className="welcome-text-link">{t('about.userGuide')}<ArrowUpRight size={16} aria-hidden="true" /></a></div></div>
          <div className="welcome-video">{playing ? <iframe src={`https://www.youtube-nocookie.com/embed/${TUTORIAL_ID}?autoplay=1&rel=0`} title={t('onboarding.tutorialTitle')} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <button className="welcome-video-poster" onClick={() => setPlaying(true)} aria-label={t('onboarding.watch')}><img src="/onboarding/overview.webp" alt="" loading="lazy" /><span className="welcome-play"><Play size={26} fill="currentColor" aria-hidden="true" /></span><span className="welcome-video-label">{t('onboarding.watch')} · YouTube</span></button>}</div>
        </section>
        <details className="welcome-help"><summary>{t('onboarding.help')}</summary><p>{t('onboarding.uiUpdateNote')}</p><p>{t('onboarding.feedbackNote')}</p></details>
      </main>
      <footer className="welcome-footer"><span>Better Sidebar · Paper Crane Dev</span><span>{t('onboarding.footerNote')}</span></footer>
    </div>
  </div>;
}
