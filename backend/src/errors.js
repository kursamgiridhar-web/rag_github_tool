// Errors that are safe to show to the user (message + HTTP status)
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
