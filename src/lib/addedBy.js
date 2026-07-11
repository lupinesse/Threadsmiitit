/**
 * @fileoverview Shared helper for attributing a newly-added meetup to its
 * creator. Used by both the manual add form (ScreenLisaa) and the chat
 * assistant (ChatAssistant/chatActions) so the addedBy shape can't drift
 * between the two entry points.
 */

/**
 * Builds the addedBy attribution object EventStore expects, or undefined if
 * no user is signed in.
 * @param {object|null} user - Currently logged-in user, or null if signed out.
 * @returns {object|undefined}
 */
export function buildAddedBy(user) {
  if (!user) return undefined;
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    profileUrl: user.profileUrl,
  };
}
