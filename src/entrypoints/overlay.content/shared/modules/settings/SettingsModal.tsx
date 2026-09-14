import React, { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { X, Settings, Share2, Info, LayoutTemplate, Database, SlidersHorizontal, Palette, Keyboard, Plug, Bot } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { GeneralSettings } from './modules/GeneralSettings';
import { ThemeSettings } from './modules/ThemeSettings';
import { ExplorerSettings } from './modules/ExplorerSettings';
import { DataSettings } from './modules/DataSettings';
import { AboutSettings } from './modules/AboutSettings';
import { SponsorSettings } from './modules/SponsorSettings';
import { SupportPackSettings } from './modules/SupportPackSettings';
import { PlatformSettings } from './modules/PlatformSettings';
import { HotkeySettings } from './modules/HotkeySettings';
import { IntegrationsSettings } from './modules/IntegrationsSettings';
import { AgentSettings } from './modules/AgentSettings';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { useAppStore } from '@/shared/lib/store';
import type { SettingsSection } from '@/shared/lib/store/types';
import { useBadge } from '@/shared/lib/badge-store';
import { BadgeLabel } from '@/shared/components/ui/badge-dot';
import { Z_INDEX } from '@/shared/lib/z-index';

/** Wrapper to use a fluent-color iconify icon as a NavButton icon component */
const PacksIcon = ({ className }: { className?: string }) => (
  <span className={className}>
    <UIcon icon="fluent-color:trophy-24" width="1em" height="1em" />
  </span>
);

interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Section = SettingsSection;

/**
 * NavButton automatically shows a red dot if `settings.{id}` is an active badge.
 * Clicking it dismisses the badge. No manual showBadge prop needed.
 */
const NavButton = ({ 
    id, 
    label, 
    icon: Icon, 
    activeSection, 
    setActiveSection,
}: { 
    id: Section; 
    label: string; 
    icon: any;
    activeSection: Section;
    setActiveSection: (s: Section) => void;
}) => {
    const badgeKey = `settings.${id}`;
    const badge = useBadge(badgeKey);

    const handleClick = () => {
        setActiveSection(id);
        badge.dismiss();
    };

    return (
        <Button
            variant={activeSection === id ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={handleClick}
        >
            <Icon className="mr-2 h-4 w-4" />
            <BadgeLabel badgeKey={badgeKey}>{label}</BadgeLabel>
        </Button>
    );
};

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
    const { t } = useI18n();
    const [activeSection, setActiveSection] = useState<Section>('general');
    const requestedSection = useAppStore((s) => s.ui.overlay.settingsSection);

    // Callers can deep-link into a section via setSettingsOpen(true, 'agent').
    useEffect(() => {
        if (open && requestedSection) setActiveSection(requestedSection);
    }, [open, requestedSection]);

    if (!open) return null;

    const platform = detectPlatform();
    const hasPlatformSettings = platform === Platform.GEMINI || platform === Platform.AI_STUDIO;

    const renderContent = () => {
        switch (activeSection) {
            case 'general':
                return <GeneralSettings />;
            case 'theme':
                return <ThemeSettings />;
            case 'explorer':
                return <ExplorerSettings />;
            case 'platform':
                return <PlatformSettings />;
            case 'data':
                return <DataSettings />;
            case 'hotkeys':
                return <HotkeySettings />;
            case 'integrations':
                return <IntegrationsSettings />;
            case 'agent':
                return <AgentSettings />;
            case 'supportpack':
                return <SupportPackSettings />;
            case 'sponsor':
                return <SponsorSettings />;
            case 'about':
                return <AboutSettings />;
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center animate-in fade-in-0" style={{ zIndex: Z_INDEX.MODAL, backgroundColor: 'var(--overlay-bg)', backdropFilter: 'var(--overlay-blur)', WebkitBackdropFilter: 'var(--overlay-blur)' }}>
            <div className="relative w-[800px] h-[600px] max-h-[90vh] rounded-lg flex overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4" style={{ backgroundColor: 'var(--panel-bg)', boxShadow: 'var(--shadow-panel)', backdropFilter: 'var(--panel-blur)', WebkitBackdropFilter: 'var(--panel-blur)' }}>
                {/* Close Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-2 z-10"
                    onClick={() => onOpenChange(false)}
                >
                    <X className="h-4 w-4" />
                </Button>

                {/* Sidebar */}
                <div className="w-64 bg-muted/30 p-4 flex flex-col gap-1 overflow-y-auto">
                    <div className="px-2 py-2 mb-2">
                        <h2 className="font-semibold text-lg tracking-tight">{t('common.preferences')}</h2>
                    </div>
                    
                    <NavButton id="general" label={t('settings.general')} icon={Settings} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="theme" label={t('themeSettings.title')} icon={Palette} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="explorer" label={t('settings.library')} icon={LayoutTemplate} activeSection={activeSection} setActiveSection={setActiveSection} />
                    {hasPlatformSettings && (
                        <NavButton id="platform" label={t('settings.uiControls')} icon={SlidersHorizontal} activeSection={activeSection} setActiveSection={setActiveSection} />
                    )}
                    <NavButton id="data" label={t('settings.dataStorage')} icon={Database} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="hotkeys" label={t('hotkeys.title')} icon={Keyboard} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="integrations" label={t('integrations.title')} icon={Plug} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="agent" label="Agent" icon={Bot} activeSection={activeSection} setActiveSection={setActiveSection} />
                    
                    <div className="h-px bg-border/50 my-2 mx-2" />
                    
                    <NavButton id="supportpack" label={t('packs.title')} icon={PacksIcon} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="sponsor" label={t('settings.sponsor')} icon={Share2} activeSection={activeSection} setActiveSection={setActiveSection} />
                    
                    <div className="flex-1" />
                    <NavButton id="about" label={t('settings.about')} icon={Info} activeSection={activeSection} setActiveSection={setActiveSection} />
                </div>

                {/* Content */}
                <div className="flex-1 p-8 overflow-y-auto">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};
