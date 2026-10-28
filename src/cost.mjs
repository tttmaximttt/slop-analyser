import { readFileSync } from 'node:fs';

export function loadPricing(path = new URL('../pricing.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Transcripts may carry dated ids (claude-sonnet-4-5-20250929); match the longest known prefix.
function ratesFor(model, pricing) {
  if (!model) return null;
  let best = null;
  for (const id of Object.keys(pricing.models)) {
    if (model.startsWith(id) && (!best || id.length > best.length)) best = id;
  }
  return best ? pricing.models[best] : null;
}

// Returns USD, or null when the model has no rates (the caller reports it as unpriced).
export function messageCost(model, usage, pricing) {
  if (model === '<synthetic>') return 0;
  const rates = ratesFor(model, pricing);
  if (!rates || !usage) return null;
  const { cacheWriteMultiplier: mult } = pricing;
  const split = usage.cache_creation;
  const write5m = split ? split.ephemeral_5m_input_tokens ?? 0 : usage.cache_creation_input_tokens ?? 0;
  const write1h = split ? split.ephemeral_1h_input_tokens ?? 0 : 0;
  const perMillion =
    (usage.input_tokens ?? 0) * rates.input +
    write5m * rates.input * mult['5m'] +
    write1h * rates.input * mult['1h'] +
    (usage.cache_read_input_tokens ?? 0) * rates.cacheRead +
    (usage.output_tokens ?? 0) * rates.output;
  const speed = usage.speed === 'fast' ? rates.fastMultiplier ?? 1 : 1;
  return (perMillion * speed) / 1e6;
}
