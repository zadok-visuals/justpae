
export const cleanupAuthState = () => {
  // Remove all Supabase auth related items from localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-') || key.startsWith('userPin_')) {
      localStorage.removeItem(key);
    }
  });
  
  // Also remove from sessionStorage if present
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      sessionStorage.removeItem(key);
    }
  });
};
