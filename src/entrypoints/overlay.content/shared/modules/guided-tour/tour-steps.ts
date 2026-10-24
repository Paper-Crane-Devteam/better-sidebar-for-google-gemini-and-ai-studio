import {
  Files,
  Search,
  Sparkles,
  TextQuote,
  Bot,
  ScrollText,
  NotebookText,
  Tag,
  Star,
  Settings,
  MessageSquare,
  Library,
  Gem,
  LogOut,
} from 'lucide-react';

export interface TourStep {
  /** data-tour-id on the target element */
  targetId: string;
  /** i18n key for step title */
  titleKey: string;
  /** i18n key for step description */
  descriptionKey: string;
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Position of tooltip relative to target */
  placement: 'right' | 'bottom' | 'top';
  /** If true, this step is only shown when the target element exists in DOM */
  optional?: boolean;
}

export const GEMINI_TOUR_STEPS: TourStep[] = [
  {
    targetId: 'tour-files',
    titleKey: 'guidedTour.steps.files.title',
    descriptionKey: 'guidedTour.steps.files.description',
    icon: Files,
    placement: 'right',
  },
  {
    targetId: 'tour-search',
    titleKey: 'guidedTour.steps.search.title',
    descriptionKey: 'guidedTour.steps.search.description',
    icon: Search,
    placement: 'right',
  },
  {
    targetId: 'tour-prompts',
    titleKey: 'guidedTour.steps.prompts.title',
    descriptionKey: 'guidedTour.steps.prompts.description',
    icon: TextQuote,
    placement: 'right',
  },
  {
    targetId: 'tour-agent',
    titleKey: 'guidedTour.steps.agent.title',
    descriptionKey: 'guidedTour.steps.agent.description',
    icon: Bot,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-tags',
    titleKey: 'guidedTour.steps.tags.title',
    descriptionKey: 'guidedTour.steps.tags.description',
    icon: Tag,
    placement: 'right',
  },
  {
    targetId: 'tour-favorites',
    titleKey: 'guidedTour.steps.favorites.title',
    descriptionKey: 'guidedTour.steps.favorites.description',
    icon: Star,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-snippets',
    titleKey: 'guidedTour.steps.snippets.title',
    descriptionKey: 'guidedTour.steps.snippets.description',
    icon: ScrollText,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-gems',
    titleKey: 'guidedTour.steps.gems.title',
    descriptionKey: 'guidedTour.steps.gems.description',
    icon: Gem,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-notebooks',
    titleKey: 'guidedTour.steps.notebooks.title',
    descriptionKey: 'guidedTour.steps.notebooks.description',
    icon: NotebookText,
    placement: 'right',
    optional: true,
  },
  {
    // Spark is behind a Gemini A/B flag, so the icon may not be rendered.
    targetId: 'tour-spark',
    titleKey: 'guidedTour.steps.spark.title',
    descriptionKey: 'guidedTour.steps.spark.description',
    icon: Sparkles,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-mystuff',
    titleKey: 'guidedTour.steps.myStuff.title',
    descriptionKey: 'guidedTour.steps.myStuff.description',
    icon: Library,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-original-ui',
    titleKey: 'guidedTour.steps.originalUI.title',
    descriptionKey: 'guidedTour.steps.originalUI.description',
    icon: LogOut,
    placement: 'right',
    optional: true,
  },
  {
    targetId: 'tour-feedback',
    titleKey: 'guidedTour.steps.feedback.title',
    descriptionKey: 'guidedTour.steps.feedback.description',
    icon: MessageSquare,
    placement: 'right',
  },
  {
    targetId: 'tour-settings',
    titleKey: 'guidedTour.steps.settings.title',
    descriptionKey: 'guidedTour.steps.settings.description',
    icon: Settings,
    placement: 'right',
  },
];
