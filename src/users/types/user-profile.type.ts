// Shape returned to the client — mirrors the mobile app's UserProfile
// (context/AuthContext.tsx) so swapping Firebase for this API is a drop-in.
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  onboardingComplete: boolean;
  selectedInterests: string[];
  joinedHackathonIds: string[];
  completedLessonKeys: string[];
  agentsExplored: string[];
  notificationsOn: boolean;
  darkModeOn: boolean;
  role: string | null;
  aiPreference: string;
}
