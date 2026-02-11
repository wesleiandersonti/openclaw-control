const OpenAI = require('openai');
const { HttpError } = require('../../core/errors/httpError');

class OpenAIProvider {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async chatCompletion(params) {
    const { model, messages, temperature = 0.7, maxTokens } = params;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices?.[0];
      if (!choice || !choice.message) {
        throw new HttpError(500, 'no response from OpenAI');
      }

      const content = choice.message.content || '';
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;

      return {
        content,
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      if (error.status === 401) {
        throw new HttpError(401, 'invalid OpenAI API key');
      }
      if (error.status === 429) {
        throw new HttpError(429, 'rate limit exceeded');
      }
      if (error.status >= 500) {
        throw new HttpError(502, 'OpenAI service error');
      }

      throw new HttpError(500, error.message || 'OpenAI request failed');
    }
  }
}

module.exports = { OpenAIProvider };
