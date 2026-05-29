import { useEffect } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';

export const useTheme = () => {
    const { theme, setTheme, customTheme } = useSettingsStore();

    // Apply theme side effects — skip when a custom theme is active
    // because the custom theme's preferredMode controls light/dark via the platform adapter.
    useEffect(() => {
        // When a custom theme is active, the platform adapter (initGeminiThemeSync)
        // handles forcing the page to the theme's preferredMode. Don't override it here.
        if (customTheme) return;

        const applyTheme = (t: typeof theme) => {
            const isSystemDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDark = t === 'dark' || (t === 'system' && isSystemDark);

            if (isDark) {
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.add('light-theme');
                document.body.classList.remove('dark-theme');
            }
        };

        applyTheme(theme);

        // Listen for system changes if mode is system
        if (theme === 'system') {
            const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme, customTheme]);

    return { theme, setTheme };
};
