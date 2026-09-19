// "View as student" mode for teachers/admins.
//
// A teacher/admin normally lands on /teacher and is bounced off the student
// routes. When they deliberately switch to the student view, we persist that
// choice in localStorage so a reload (or a dev-server HMR restart — see
// WORKSPACE B1) doesn't yank them back mid-preview. It resets on explicit
// sign-out and is a no-op for real students.
const KEY = "kp_view_as";

export function isViewingAsStudent(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(KEY) === "student";
  } catch {
    return false;
  }
}

export function setViewAsStudent(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "student");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage disabled — mode just won't persist */
  }
}
