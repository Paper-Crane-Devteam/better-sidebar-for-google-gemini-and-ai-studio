import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { X, Settings, Heart, Info, LayoutTemplate, Database, SlidersHorizontal, Palette, Sparkles, Keyboard } from 'lucide-react';
import { GeneralSettings } from './modules/GeneralSettings';
import { ThemeSettings } from './modules/ThemeSettings';
import { ExplorerSettings } from './modules/ExplorerSettings';
import { DataSettings } from './modules/DataSettings';
import { AboutSettings } from './modules/AboutSettings';
import { SponsorSettings } from './modules/SponsorSettings';
import { SupportPackSettings } from './modules/SupportPackSettings';
import { PlatformSettings } from './modules/PlatformSettings';
import { HotkeySettings } from './modules/HotkeySettings';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { useBadgeStore } from '@/shared/lib/badge-store';
import { BadgeDot } from '@/shared/components/ui/badge-dot';

interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Section = 'general' | 'theme' | 'explorer' | 'data' | 'hotkeys' | 'platform' | 'supportpack' | 'sponsor' | 'about';

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
    const showBadge = useBadgeStore((s) => s.isVisible(badgeKey));
    const dismiss = useBadgeStore((s) => s.dismiss);

    const handleClick = () => {
        setActiveSection(id);
        if (showBadge) dismiss(badgeKey);
    };

    return (
        <Button
            variant={activeSection === id ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={handleClick}
        >
            <Icon className="mr-2 h-4 w-4" />
            <span className="relative">
                {label}
                {showBadge && <BadgeDot className="absolute -top-1 -right-2.5" />}
            </span>
        </Button>
    );
};

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
    const { t } = useI18n();
    const [activeSection, setActiveSection] = useState<Section>('general');

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
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in-0" style={{ backgroundColor: 'var(--overlay-bg)', backdropFilter: 'var(--overlay-blur)', WebkitBackdropFilter: 'var(--overlay-blur)' }}>
            <div className="relative w-[800px] h-[600px] max-h-[90vh] border rounded-lg shadow-lg flex overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4" style={{ backgroundColor: 'var(--panel-bg)', backdropFilter: 'var(--panel-blur)', WebkitBackdropFilter: 'var(--panel-blur)' }}>
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
                <div className="w-64 bg-muted/30 border-r p-4 flex flex-col gap-2 overflow-y-auto">
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
                    
                    <div className="h-px bg-border my-2 mx-2" />
                    
                    <NavButton id="supportpack" label={t('supportPack.title')} icon={Sparkles} activeSection={activeSection} setActiveSection={setActiveSection} />
                    <NavButton id="sponsor" label={t('settings.sponsor')} icon={Heart} activeSection={activeSection} setActiveSection={setActiveSection} />
                    
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
