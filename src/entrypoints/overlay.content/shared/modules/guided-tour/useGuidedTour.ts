import { useState, useEffect, useCallback } from 'react';

/** Set once the tour is finished or skipped. Other first-run prompts wait on it. */
export const GUIDED_TOUR_STORAGE_KEY = 'guided_tour_completed';
const STORAGE_KEY = GUIDED_TOUR_STORAGE_KEY;

export const useGuidedTour = () => {
  /** Whether to show the "want a tour?" prompt dialog */
  const [showPrompt, setShowPrompt] = useState(false);
  /** Whether the actual tour is active */
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkTourStatus = async () => {
      try {
        const result = await browser.storage.local.get(STORAGE_KEY);
        const completed = result[STORAGE_KEY];
        // debug
        // setShowPrompt(true);
        if (!completed) {
          // Show the prompt dialog after a short delay
          setTimeout(() => {
            setShowPrompt(true);
          }, 2000);
        }
        setIsReady(true);
      } catch (error) {
        console.error('Failed to check guided tour status:', error);
        setIsReady(true);
      }
    };

    checkTourStatus();
  }, []);

  const markCompleted = useCallback(async () => {
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: true });
    } catch (error) {
      console.error('Failed to save guided tour status:', error);
    }
  }, []);

  /** User clicks "Start Tour" on the prompt */
  const acceptTour = useCallback(() => {
    setShowPrompt(false);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  /** User clicks "Skip" on the prompt */
  const dismissPrompt = useCallback(async () => {
    setShowPrompt(false);
    await markCompleted();
  }, [markCompleted]);

  const completeTour = useCallback(async () => {
    setIsActive(false);
    setCurrentStep(0);
    await markCompleted();
  }, [markCompleted]);

  const skipTour = useCallback(async () => {
    await completeTour();
  }, [completeTour]);

  const nextStep = useCallback(
    (totalSteps: number) => {
      if (currentStep < totalSteps - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        completeTour();
      }
    },
    [currentStep, completeTour],
  );

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  /** Manually re-start the tour (e.g. from settings) */
  const startTour = useCallback(() => {
    setShowPrompt(false);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  return {
    showPrompt,
    isActive,
    isReady,
    currentStep,
    acceptTour,
    dismissPrompt,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    startTour,
  };
};
