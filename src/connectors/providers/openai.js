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

  async chatStream(params) {
    const { model, messages, temperature = 0.7, maxTokens, onDelta } = params;

    if (typeof onDelta !== 'function') {
      throw new HttpError(400, 'onDelta callback is required for streaming');
    }

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let usageEstimated = false;

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onDelta(delta);
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      }

      if (inputTokens === 0 && outputTokens === 0) {
        inputTokens = this.estimateTokens(messages);
        outputTokens = this.estimateTokens(fullContent);
        usageEstimated = true;
      }

      return {
        content: fullContent,
        inputTokens,
        outputTokens,
        usageEstimated,
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

      throw new HttpError(500, error.message || 'OpenAI streaming request failed');
    }
  }

  estimateTokens(text) {
    if (typeof text === 'string') {
      return Math.ceil(text.length / 4);
    }

    if (Array.isArray(text)) {
      const json = JSON.stringify(text);
      return Math.ceil(json.length / 4);
    }

    return 0;
  }
}

module.exports = { OpenAIProvider };
