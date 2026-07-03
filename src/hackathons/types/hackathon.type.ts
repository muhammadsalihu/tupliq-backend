// Mirrors the mobile app's Hackathon interface (constants/hackathons.ts).
// Per-user state (joined / completed lessons) is NOT included here — same
// as the Firestore version, the client cross-references this against its
// own profile.joinedHackathonIds / completedLessonKeys.
export interface HackathonDto {
  id: string;
  title: string;
  tag: 'Live' | 'Upcoming';
  desc: string;
  meta: string;
  lessons: { id: string; title: string }[];
  videos: { id: string; title: string; duration: string }[];
  partners: { id: string; name: string }[];
}
