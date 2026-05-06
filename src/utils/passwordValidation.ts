
export const validatePassword = (password: string) => {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const isLongEnough = password.length >= 8;

  if (!isLongEnough) {
    return { isValid: false, message: "Password must be at least 8 characters long." };
  }
  if (!hasUpperCase) {
    return { isValid: false, message: "Password must contain at least one uppercase letter." };
  }
  if (!hasLowerCase) {
    return { isValid: false, message: "Password must contain at least one lowercase letter." };
  }
  if (!hasNumbers) {
    return { isValid: false, message: "Password must contain at least one number." };
  }
  return { isValid: true, message: "Password is valid." };
};
