const PRICING = {
  openai: {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'gpt-3.5-turbo-0125': { input: 0.0005, output: 0.0015 },
    'gpt-3.5-turbo-1106': { input: 0.001, output: 0.002 },
  },
  anthropic: {
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  },
  google: {
    'gemini-pro': { input: 0.0005, output: 0.0015 },
    'gemini-ultra': { input: 0.005, output: 0.015 },
  },
};

function calculateCost(provider, model, inputTokens, outputTokens) {
  const providerPricing = PRICING[provider];
  if (!providerPricing) {
    return 0;
  }

  const modelPricing = providerPricing[model];
  if (!modelPricing) {
    const defaultModel = Object.keys(providerPricing)[0];
    if (defaultModel) {
      return (
        (inputTokens / 1000) * providerPricing[defaultModel].input +
        (outputTokens / 1000) * providerPricing[defaultModel].output
      );
    }
    return 0;
  }

  return (
    (inputTokens / 1000) * modelPricing.input +
    (outputTokens / 1000) * modelPricing.output
  );
}

function getPricingInfo(provider, model) {
  const providerPricing = PRICING[provider];
  if (!providerPricing) {
    return null;
  }

  return providerPricing[model] || null;
}

module.exports = {
  calculateCost,
  getPricingInfo,
};
