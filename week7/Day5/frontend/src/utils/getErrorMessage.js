export function getErrorMessage(error) {
  const serverMessage = error.response?.data?.message;
  if (serverMessage) return serverMessage;
  if (error.request) return "Cannot reach the server. Please check your connection and try again.";
  return "Something went wrong. Please try again.";
}
