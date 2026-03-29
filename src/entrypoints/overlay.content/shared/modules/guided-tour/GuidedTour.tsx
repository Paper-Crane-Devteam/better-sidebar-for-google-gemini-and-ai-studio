import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TourStep } from './tour-steps';
import { useI18n } from '@/shared/hooks/useI18n';

interface GuidedTourProps {
  steps: TourStep[];
  currentStep: number;
  isActive: boolean;
  onNext: (totalSteps: number) => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PORTAL_ID = 'better-sidebar-guided-tour-portal';
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RADIUS = 12;
// The glow ring sits at SPOTLIGHT_PADDING + 2 outward, with a 2px border
// SVG cutout must cover the entire glow ring area to avoid gray gaps
const GLOW_RING_EXTEND = SPOTLIGHT_PADDING + 4; // padding + offset(2) + border(2)
const GLOW_RING_RADIUS = SPOTLIGHT_RADIUS + 4;
const TOOLTIP_ESTIMATED_HEIGHT = 220;
const TOOLTIP_MARGIN = 16;

function getShadowRoot() {
  const wrapper = document.getElementById(
    'better-sidebar-for-google-ai-studio-sidebar-wrapper',
  );
  return wrapper?.shadowRoot ?? null;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({
  steps: allSteps,
  currentStep,
  isActive,
  onNext,
  onPrev,
  onSkip,
}) => {
  const { t } = useI18n();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const portalRef = useRef<HTMLDivElement | null>(null);

  // Filter out optional steps whose target elements don't exist in the DOM
  const steps = useMemo(() => {
    const shadowRoot = getShadowRoot();
    if (!shadowRoot) return allSteps.filter((s) => !s.optional);

    return allSteps.filter((step) => {
      if (!step.optional) return true;
      return !!shadowRoot.querySelector(`[data-tour-id="${step.targetId}"]`);
    });
  }, [allSteps, isActive]);

  const step = steps[currentStep];

  // Create/cleanup portal container on document.body (host page, outside Shadow DOM)
  useEffect(() => {
    if (!isActive) {
      const existing = document.getElementById(PORTAL_ID);
      if (existing) document.body.removeChild(existing);
      portalRef.current = null;
      return;
    }

    let container = document.getElementById(PORTAL_ID) as HTMLDivElement;
    if (!container) {
      container = document.createElement('div');
      container.id = PORTAL_ID;
      document.body.appendChild(container);
    }
    portalRef.current = container;

    return () => {
      const el = document.getElementById(PORTAL_ID);
      if (el) document.body.removeChild(el);
      portalRef.current = null;
    };
  }, [isActive]);

  const updateTargetPosition = useCallback(() => {
    if (!step || !isActive) return;

    const shadowRoot = getShadowRoot();
    if (!shadowRoot) return;

    const targetEl = shadowRoot.querySelector(
      `[data-tour-id="${step.targetId}"]`,
    ) as HTMLElement;

    if (!targetEl) {
      console.warn(`Tour target not found: ${step.targetId}`);
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [step, isActive]);

  // Update position on step change
  useEffect(() => {
    if (!isActive) {
      setShowContent(false);
      return;
    }

    setIsAnimating(true);
    setShowContent(false);

    const timer = setTimeout(() => {
      updateTargetPosition();
      setIsAnimating(false);
      setShowContent(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [currentStep, isActive, updateTargetPosition]);

  // Handle window resize / scroll
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => updateTargetPosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isActive, updateTargetPosition]);

  if (!isActive || !step || !portalRef.current) return null;

  const StepIcon = step.icon;

  // Calculate tooltip position with viewport overflow protection
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { display: 'none' };

    const tooltipOffset = 16;
    const viewportHeight = window.innerHeight;

    if (step.placement === 'right') {
      // Ideal: vertically center tooltip against target
      let top = targetRect.top + targetRect.height / 2;
      const idealTop = top - TOOLTIP_ESTIMATED_HEIGHT / 2;
      const idealBottom = top + TOOLTIP_ESTIMATED_HEIGHT / 2;

      // Clamp: if tooltip would overflow bottom
      if (idealBottom > viewportHeight - TOOLTIP_MARGIN) {
        top = viewportHeight - TOOLTIP_MARGIN - TOOLTIP_ESTIMATED_HEIGHT / 2;
      }
      // Clamp: if tooltip would overflow top
      if (idealTop < TOOLTIP_MARGIN) {
        top = TOOLTIP_MARGIN + TOOLTIP_ESTIMATED_HEIGHT / 2;
      }

      return {
        position: 'fixed',
        top,
        left: targetRect.left + targetRect.width + tooltipOffset,
        transform: 'translateY(-50%)',
        zIndex: 2147483647,
      };
    }

    if (step.placement === 'bottom') {
      return {
        position: 'fixed',
        top: targetRect.top + targetRect.height + tooltipOffset,
        left: targetRect.left + targetRect.width / 2,
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
      };
    }

    // top
    return {
      position: 'fixed',
      top: targetRect.top - tooltipOffset,
      left: targetRect.left + targetRect.width / 2,
      transform: 'translate(-50%, -100%)',
      zIndex: 2147483647,
    };
  };

  // Calculate arrow position — needs to point at the actual target center, not clamped tooltip center
  const getArrowStyle = (): React.CSSProperties | null => {
    if (!targetRect || step.placement !== 'right') return null;

    const tooltipStyle = getTooltipStyle();
    const tooltipTop = tooltipStyle.top as number;
    // Target center in viewport
    const targetCenterY = targetRect.top + targetRect.height / 2;
    // Arrow offset relative to tooltip center
    const offsetFromCenter = targetCenterY - tooltipTop;

    return {
      position: 'absolute',
      left: -6,
      top: `calc(50% + ${offsetFromCenter}px)`,
      transform: 'translateY(-50%) rotate(45deg)',
      width: 12,
      height: 12,
      background: '#1e1b4b',
      borderLeft: '1px solid rgba(99, 102, 241, 0.2)',
      borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
    };
  };

  const overlay = (
    <>
      {/* Full-screen overlay with SVG spotlight */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483646,
          pointerEvents: 'auto',
        }}
        onClick={onSkip}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            transition: 'opacity 0.3s ease',
            opacity: isAnimating ? 0.5 : 1,
          }}
        >
          <defs>
            <mask id="guided-tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - GLOW_RING_EXTEND}
                  y={targetRect.top - GLOW_RING_EXTEND}
                  width={targetRect.width + GLOW_RING_EXTEND * 2}
                  height={targetRect.height + GLOW_RING_EXTEND * 2}
                  rx={GLOW_RING_RADIUS}
                  ry={GLOW_RING_RADIUS}
                  fill="black"
                  style={{
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.55)"
            mask="url(#guided-tour-spotlight-mask)"
          />
        </svg>
      </div>

      {/* Spotlight glow ring */}
      {targetRect && (
        <div
          style={{
            position: 'fixed',
            boxSizing: 'border-box',
            top: targetRect.top - SPOTLIGHT_PADDING - 2,
            left: targetRect.left - SPOTLIGHT_PADDING - 2,
            width: targetRect.width + (SPOTLIGHT_PADDING + 2) * 2,
            height: targetRect.height + (SPOTLIGHT_PADDING + 2) * 2,
            borderRadius: SPOTLIGHT_RADIUS + 2,
            border: '2px solid rgba(99, 102, 241, 0.5)',
            boxShadow:
              '0 0 20px rgba(99, 102, 241, 0.3), inset 0 0 20px rgba(99, 102, 241, 0.1)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
            zIndex: 2147483647,
            animation: 'guided-tour-pulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Tooltip card */}
      {targetRect && showContent && (
        <div style={getTooltipStyle()} onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              position: 'relative',
              background: '#1e1b4b',
              borderRadius: 16,
              padding: 20,
              minWidth: 260,
              maxWidth: 320,
              boxShadow:
                '0 25px 60px rgba(0, 0, 0, 0.4), 0 0 40px rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              animation:
                'guided-tour-fadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Close button */}
            <button
              onClick={onSkip}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={16} />
            </button>

            {/* Step icon + title */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background:
                    'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: '#a5b4fc', display: 'flex' }}>
                  <StepIcon className="w-[18px] h-[18px]" />
                </span>
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#ffffff',
                  lineHeight: 1.3,
                }}
              >
                {t(step.titleKey)}
              </h3>
            </div>

            {/* Description */}
            <p
              style={{
                margin: '0 0 16px 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: t(step.descriptionKey) }}
            />

            {/* Progress bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 16,
              }}
            >
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    height: 3,
                    flex: 1,
                    borderRadius: 2,
                    background:
                      idx <= currentStep
                        ? 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                        : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.4s ease',
                  }}
                />
              ))}
            </div>

            {/* Step counter + Navigation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.4)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {currentStep + 1} / {steps.length}
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                {currentStep > 0 && (
                  <button
                    onClick={onPrev}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      transition: 'all 0.2s',
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        'rgba(255,255,255,0.3)';
                      e.currentTarget.style.background =
                        'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        'rgba(255,255,255,0.15)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <ChevronLeft size={14} />
                    {t('guidedTour.prev')}
                  </button>
                )}
                <button
                  onClick={() => onNext(steps.length)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow =
                      '0 6px 16px rgba(99, 102, 241, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow =
                      '0 4px 12px rgba(99, 102, 241, 0.4)';
                  }}
                >
                  {currentStep === steps.length - 1
                    ? t('guidedTour.finish')
                    : t('guidedTour.next')}
                  {currentStep < steps.length - 1 && <ChevronRight size={14} />}
                </button>
              </div>
            </div>

            {/* Arrow pointing to target */}
            {(() => {
              const arrowStyle = getArrowStyle();
              return arrowStyle ? <div style={arrowStyle} /> : null;
            })()}
          </div>
        </div>
      )}

      {/* Global CSS Animations — injected into host page */}
      <style>{`
        @keyframes guided-tour-pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.3), inset 0 0 20px rgba(99, 102, 241, 0.1);
          }
          50% {
            box-shadow: 0 0 30px rgba(99, 102, 241, 0.5), inset 0 0 30px rgba(99, 102, 241, 0.15);
          }
        }
        @keyframes guided-tour-fadeSlideIn {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );

  return ReactDOM.createPortal(overlay, portalRef.current);
};
