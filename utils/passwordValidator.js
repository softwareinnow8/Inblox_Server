const validatePassword = (password) => {
  const minLength = 9;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-\\[\]\/~`+=;]/.test(password);
  const hasNoSpaces = !/\s/.test(password);

  if (password.length < minLength) {
    return "Password must be at least 9 characters long";
  }
  if (!hasLetter) {
    return "Password must contain at least one letter";
  }
  if (!hasNumber) {
    return "Password must contain at least one number";
  }
  if (!hasSpecialChar) {
    return "Password must contain at least one special character";
  }
  if (!hasNoSpaces) {
    return "Password must not contain spaces";
  }

  return null; // Valid password
};

export default validatePassword;
