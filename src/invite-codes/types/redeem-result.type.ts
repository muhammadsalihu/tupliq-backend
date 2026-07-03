// Mirrors the mobile app's services/inviteCodes.ts RedeemResult exactly, so
// the client's error copy ("That code doesn't look right.", "already been
// used.", "for a different hackathon.") maps straight across.
export type RedeemResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_used' | 'wrong_hackathon' };
