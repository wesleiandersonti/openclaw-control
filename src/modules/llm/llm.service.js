const { getProvider } = require('../../connectors/provider.factory');
const { getDefaultKeyWithSecret } = require('../keys/keys.service');
const { recordUsage } = require('../usage/usage.service');
const { calculateCost } = require('./pricing');
const { HttpError } = require('../../core/errors/httpError');

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, 'messages must be a non-empty array');
  }

  for (const msg of messages) {
    if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
      throw new HttpError(400, 'each message must have a valid role: system, user, or assistant');
    }
    if (typeof msg.content !== 'string') {
      throw new HttpError(400, 'each message must have a content string');
    }
  }
}

async function chatCompletion(params, actor) {
  const provider = normalizeProvider(params.provider || 'openai');
  const model = params.model;
  const messages = params.messages;
  const sessionId = params.sessionId || null;

  if (!model) {
    throw new HttpError(400, 'model is required');
  }

  validateMessages(messages);

  const keyData = getDefaultKeyWithSecret(provider);

  const connector = getProvider(provider, keyData.apiKey);

  const result = await connector.chatCompletion({
    model,
    messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });

  const costUsd = calculateCost(provider, model, result.inputTokens, result.outputTokens);

  const usage = recordUsage({
    provider,
    model,
    sessionId,
    apiKeyId: keyData.id,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd,
  }, actor);

  return {
    content: result.content,
    provider,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      costUsd,
    },
    sessionId,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  chatCompletion,
};
