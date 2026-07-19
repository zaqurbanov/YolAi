export interface TourStep {
  id: string;
  /** Route to navigate to for this step. */
  page: string;
  /** CSS selector for the spotlighted element. */
  target: string;
  title: string;
  description: string;
}

// Single source of truth for the guided onboarding tour (components/onboarding/TourProvider.tsx
// + TourOverlay.tsx). Selectors here must match the data-tour attributes actually rendered on
// the target elements (SidebarNav.tsx, CoinBadge.tsx, NavBar.tsx, ChatClient.tsx, DailyQuizCard.tsx).
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav-chat',
    page: '/',
    target: '[data-tour="nav-/chat"]',
    title: 'Sual-cavab bölməsi',
    description: 'Bura klikləyib Yol Hərəkəti Qaydaları üzrə AI köməkçidən sualını hər an soruşa bilərsən.',
  },
  {
    id: 'nav-oyrenme',
    page: '/',
    target: '[data-tour="nav-/oyrenme"]',
    title: 'Sürücülük vəsiqəsini al',
    description: 'Qaydaları dərsliklər və testlər vasitəsilə addım-addım öyrənmək istəyirsənsə, buradan başla.',
  },
  {
    id: 'chat-input',
    page: '/chat',
    target: '[data-tour="chat-input"]',
    title: 'Sualını bura yaz',
    description: 'Yol Hərəkəti Qaydaları ilə bağlı sualını bura yazıb göndər — cavab, aid olduğu maddəyə istinadla veriləcək.',
  },
  {
    id: 'coin-badge',
    page: '/chat',
    target: '[data-tour="coin-badge"]',
    title: 'Coin balansın',
    description: 'Hər sual bir qədər coin xərcləyir. Balansına buradan baxa, gündəlik limitini izləyə bilərsən.',
  },
  {
    id: 'coin-qazan-link',
    page: '/chat',
    target: '[data-tour="coin-qazan-link"]',
    title: 'Coin necə qazanılır?',
    description: 'Coin bitəndə narahat olma — buradan gündəlik tapşırıqlar və digər yollarla pulsuz coin qazana bilərsən.',
  },
  {
    id: 'daily-quiz-card',
    page: '/coin-qazan',
    target: '[data-tour="daily-quiz-card"]',
    title: 'Gündəlik sual',
    description: 'Hər gün bir sualı cavablandırıb pulsuz coin qazana bilərsən — seriyanı qırma!',
  },
];
