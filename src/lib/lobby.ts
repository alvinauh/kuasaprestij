/** The /join waiting room a player is in. Kept in sessionStorage so a refresh,
 *  or arriving from the home "Live now" list, lands straight in the lobby. */
export interface LobbyInfo {
  userId: string;
  classroomId: string;
  className: string;
  name: string;
}

const LOBBY_KEY = "kp_join_lobby";

export function loadLobby(): LobbyInfo | null {
  try {
    const raw = sessionStorage.getItem(LOBBY_KEY);
    return raw ? (JSON.parse(raw) as LobbyInfo) : null;
  } catch {
    return null;
  }
}

export function saveLobby(info: LobbyInfo | null) {
  try {
    if (info) sessionStorage.setItem(LOBBY_KEY, JSON.stringify(info));
    else sessionStorage.removeItem(LOBBY_KEY);
  } catch { /* storage blocked */ }
}
