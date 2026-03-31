import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useUrl } from '@/shared/hooks/useUrl';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { waitForElement, applyShadowStyles } from '@/shared/lib/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import mainStyles from '@/index.scss?inline';

const MODEL_MAPPING: Record<string, string> = {
  fast: 'Fast', 
  thinking: 'Thinking',
  pro: 'Pro',
};

const DefaultModelUI = ({ container }: { container: Element }) => {
  const { t } = useI18n();
  const defaultModel = useSettingsStore(state => state.enhancedFeatures.gemini.defaultModel);
  const setGeminiFeature = useSettingsStore(state => state.setGeminiFeature);
  
  // Stop propagation so clicking the dropdown doesn't close the Gemini menu
  const stopPropagation = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    // Some Radix UI components use pointer events and mousedowns, we try to stop them
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation();
    }
  };
  
  return ReactDOM.createPortal(
    <div 
      className="flex items-center gap-2" 
      onClick={stopPropagation} 
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
    >
      <span className="text-xs text-muted-foreground whitespace-nowrap">{t('geminiUI.defaultModel')}</span>
      <Select value={defaultModel} onValueChange={(val: any) => setGeminiFeature('defaultModel', val)}>
        <SelectTrigger className="h-7 text-xs w-[110px] bg-background border-border">
          <SelectValue placeholder={t('geminiUI.defaultModelSelect')} />
        </SelectTrigger>
        <SelectContent container={container as HTMLElement}>
          <SelectItem value="default" className="text-xs">{t('geminiUI.defaultModelNone')}</SelectItem>
          <SelectItem value="fast" className="text-xs">Fast</SelectItem>
          <SelectItem value="thinking" className="text-xs">Thinking</SelectItem>
          <SelectItem value="pro" className="text-xs">Pro</SelectItem>
        </SelectContent>
      </Select>
    </div>,
    container
  );
};

export const DefaultModelFeature = () => {
  const { url } = useUrl();
  const defaultModel = useSettingsStore(state => state.enhancedFeatures.gemini.defaultModel);
  
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const hasAutoSwitchedRef = useRef(false);

  // 1. Auto Selection — only for new conversations (URL has no conversation ID)
  useEffect(() => {
    if (defaultModel === 'default') return;

    // /app/{id} is always an existing conversation
    // /gem/{gemId}/{conversationId} is an existing gem conversation, but /gem/{gemId} alone is a new chat
    const isExistingConversation =
      /\/app\/[a-zA-Z0-9_-]+/.test(window.location.pathname) ||
      /\/gem\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/.test(window.location.pathname);
    if (isExistingConversation) return;
    
    const checkAndSwitchModel = async () => {
      // Wait for the switcher to appear (it can be delayed on initial load)
      let switcher = await Promise.race([
        waitForElement('input-area-v2 bard-mode-switcher button'),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
      ]) as HTMLElement | null;
      
      if (!switcher) return;

      // Let standard routing and event listeners fully initialize
      await new Promise(r => setTimeout(r, 600));
      
      // We re-query it just in case the DOM node was replaced by React/Angular during the 600ms wait
      switcher = document.querySelector('input-area-v2 bard-mode-switcher button') as HTMLElement | null;
      if (!switcher) return;
      
      if (hasAutoSwitchedRef.current) return;
      hasAutoSwitchedRef.current = true;
      
      const existingOverlay = await Promise.race([
        waitForElement('.cdk-overlay-container'),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 500))
      ]) as HTMLElement | null;
      if (existingOverlay) {
        existingOverlay.style.opacity = '0';
        existingOverlay.style.pointerEvents = 'none';
      }
      
      // Inject temporary styles to suppress active/focus state of the button
      const styleId = 'better-sidebar-suppress-switcher';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
          input-area-v2 bard-mode-switcher button:active,
          input-area-v2 bard-mode-switcher button:focus,
          input-area-v2 bard-mode-switcher button:hover,
          input-area-v2 bard-mode-switcher button.pressed {
             background: transparent !important;
             box-shadow: none !important;
          }
          input-area-v2 bard-mode-switcher button {
             transition: none !important;
          }
          .mat-mdc-menu-ripple {
             display: none !important;
          }
        `;
        document.head.appendChild(styleEl);
      }
      
      switcher.click();
      
      const menu = await Promise.race([
        waitForElement('.cdk-overlay-container .menu-inner-container'),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000))
      ]);
      if (!menu) return;
      
      // Allow a brief moment for items to render
      await new Promise(r => setTimeout(r, 100));
      
      const targetSubstr = MODEL_MAPPING[defaultModel];
      const options = document.querySelectorAll(
        '.cdk-overlay-container [role="menuitemradio"],.cdk-overlay-container [role="menuitem"]',
      );
      
      options.forEach((opt: Element) => {
        const titleEl = opt.querySelector('.mode-title');
        if (titleEl && titleEl.textContent && titleEl.textContent.toLowerCase().includes(targetSubstr.toLowerCase())) {
         (opt as HTMLElement).click();
        }
      });

      const backdrop = document.querySelector('body') as HTMLElement;
      backdrop.click();
      switcher.blur();
      const resetOverlay = document.querySelector('.cdk-overlay-container') as HTMLElement;
      if (resetOverlay) {
        await new Promise(r => setTimeout(r, 1000));
        resetOverlay.style.opacity = '';
        resetOverlay.style.pointerEvents = '';
      }
      
      // Remove temporary styles
      const styleEl = document.getElementById('better-sidebar-suppress-switcher');
      if (styleEl) styleEl.remove();
    };
    
    hasAutoSwitchedRef.current = false;
    checkAndSwitchModel();
    
  }, [url, defaultModel]);

  // 2. UI Injection Observer
  useEffect(() => {
    let observer: MutationObserver;
    
    const checkForMenu = () => {
      const menuInner = document.querySelector('.cdk-overlay-container .menu-inner-container') as HTMLElement;
      
      if (menuInner) {
        let existingContainer = menuInner.querySelector('#better-sidebar-default-model-container');
        
        if (existingContainer) {
          // If the container is still present but empty, React might have unmounted it when the overlay was temporarily hidden.
          // By resetting portalTarget here, we force React to render back into the old node.
          const shadow = existingContainer.shadowRoot;
          if (shadow) {
            const b = shadow.querySelector('.shadow-body');
            if (b) {
               setPortalTarget(b);
               return;
            }
          }
        } else {
          const rootNode = document.createElement('div');
          rootNode.id = 'better-sidebar-default-model-container';
          rootNode.style.position = 'absolute';
          rootNode.style.top = '3.5px';
          rootNode.style.right = '19px';
          rootNode.style.zIndex = '9999'; // ensure above other items in the menu
          
          menuInner.style.position = 'relative';
          menuInner.appendChild(rootNode);
          
          const shadow = rootNode.attachShadow({ mode: 'open' });
          applyShadowStyles(shadow, mainStyles);
          
          const shadowBody = document.createElement('div');
          shadowBody.classList.add('shadow-body', 'theme-gemini');
          if (document.body.classList.contains('dark-theme') || document.body.getAttribute('data-theme') === 'dark') {
            shadowBody.classList.add('dark');
          }
          
          // Stop propagation for all clicks inside this shadow body, to prevent the CDK overlay from closing
          const stopProp = (e: Event) => e.stopPropagation();
          shadowBody.addEventListener('click', stopProp);
          shadowBody.addEventListener('mousedown', stopProp);
          shadowBody.addEventListener('pointerdown', stopProp);
          shadowBody.addEventListener('touchstart', stopProp);
          
          shadow.appendChild(shadowBody);
          setPortalTarget(shadowBody);
        }
      } else {
        setPortalTarget(null);
      }
    };
    
    checkForMenu();
    
    observer = new MutationObserver(() => {
      checkForMenu();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      observer.disconnect();
    };
  }, []);
  
  if (!portalTarget) return null;
  return <DefaultModelUI container={portalTarget} />;
};
