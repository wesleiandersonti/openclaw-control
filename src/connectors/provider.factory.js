const { OpenAIProvider } = require('./providers/openai');
const { HttpError } = require('../core/errors/httpError');

const PROVIDERS = {
  openai: OpenAIProvider,
};

function getProvider(providerName, apiKey) {
  const normalizedName = String(providerName || '').trim().toLowerCase();

  const ProviderClass = PROVIDERS[normalizedName];
  if (!ProviderClass) {
    throw new HttpError(400, `unsupported provider: ${providerName}`);
  }

  return new ProviderClass(apiKey);
}

function listSupportedProviders() {
  return Object.keys(PROVIDERS);
}

module.exports = {
  getProvider,
  listSupportedProviders,
};
