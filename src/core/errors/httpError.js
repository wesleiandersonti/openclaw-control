class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

function isHttpError(error) {
  return error instanceof HttpError;
}

module.exports = {
  HttpError,
  isHttpError
};
