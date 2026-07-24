import 'dotenv/config';

interface CallModelOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages?: any[];  // pre-formatted messages array, bypasses automatic construction
}

export async function callModel(
  instructions: string,
  input: unknown,
  options: CallModelOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set in .env');

  const messages = options.messages ?? (Array.isArray(input)
    ? [{ role: 'system', content: instructions }, ...input]
    : [
        { role: 'system', content: instructions },
        { role: 'user', content: input as string },
      ]);

  const isMultimodal = messages.some(
    (m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'),
  );

  const body: Record<string, unknown> = {
    model: options.model ?? 'openai/gpt-4o',
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens ?? 2000,
  };

  // JSON mode is incompatible with multimodal (text+image) requests
  if (!isMultimodal) {
    body.response_format = { type: 'json_object' };
  }

  console.log(`[llm] → ${options.model ?? 'openai/gpt-4o'} | ${isMultimodal ? 'multimodal' : 'text'} | ${messages.length} msgs`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'RND4 Verification Pipeline',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[llm] ✗ API error (${response.status}): ${error.slice(0, 500)}`);
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  console.log(`[llm] ✓ OK | ${content?.length ?? 0} chars received`);
  return content;
}
