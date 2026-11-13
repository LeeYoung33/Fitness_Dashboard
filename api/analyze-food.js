const Anthropic = require('@anthropic-ai/sdk');
const { verifyToken } = require('./_auth');

const MODEL = 'claude-opus-5-5';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Vercel rejects request bodies over 4.5 MB; the page downsizes photos well below this.
const MAX_BASE64_CHARS = 4 * 1024 * 1024;

const SYSTEM_PROMPT = `You estimate the nutrition of meals from photos for a personal calorie tracker. The user will review and correct your answer before anything is saved, so give your single best estimate for each item rather than a range.

List each distinct food or drink in the photo as its own item (for example grilled chicken, rice, and broccoli are three items, not one "chicken dinner"). For each item give a short plain name, the portion you see in everyday units with an approximate weight or volume (for example "1 cup, about 160 g"), and the calories, protein, carbs, and fat for that portion. Judge portion size from visual cues such as the plate, cutlery, hands, or packaging. Account for cooking oil, sauces, and dressings you can see or that the dish normally contains. If a package or nutrition label is readable, use its numbers.

If the photo contains no food or drink, return an empty items list and say so in notes. Use notes for anything the user should double check, such as a hidden ingredient you had to guess or a portion that is hard to judge. Leave notes empty when there is nothing to flag.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string' },
          calories: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' }
        },
        required: ['name', 'portion', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
        additionalProperties: false
      }
    },
    notes: { type: 'string' }
  },
  required: ['items', 'notes'],
  additionalProperties: false
};

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Each call costs money, so unlike the static pages this endpoint checks
  // the signed session token from /api/login.
  if (!verifyToken(bearerToken(req))) {
    res.status(401).json({ error: 'Your session has expired. Log out and log back in, then try again.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Photo analysis is not configured yet. Set ANTHROPIC_API_KEY in Vercel.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { image, mediaType } = body || {};
  if (typeof image !== 'string' || !image || !ALLOWED_TYPES.includes(mediaType)) {
    res.status(400).json({ error: 'Send a JPEG, PNG, or WebP photo.' });
    return;
  }
  if (image.length > MAX_BASE64_CHARS) {
    res.status(413).json({ error: 'That photo is too large.' });
    return;
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Someone is waiting with a plate in front of them; low effort keeps this quick.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA }
      },
      // If the model declines a photo, retry on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'What is in this photo, and what are the calories and macros?' }
        ]
      }]
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: 'The ANTHROPIC_API_KEY set in Vercel was rejected.' });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Too many requests right now. Try again in a minute.' });
    } else if (err instanceof Anthropic.BadRequestError) {
      console.error('analyze-food bad request', err.message);
      res.status(400).json({ error: 'That photo could not be read. Try another one.' });
    } else if (err instanceof Anthropic.APIError) {
      console.error('analyze-food API error', err.status, err.message);
      res.status(502).json({ error: 'The analysis service had a problem. Try again.' });
    } else {
      console.error('analyze-food failed', err);
      res.status(502).json({ error: 'Could not reach the analysis service. Try again.' });
    }
    return;
  }

  if (response.stop_reason === 'refusal') {
    res.status(422).json({ error: 'That photo could not be analyzed. Try another one, or enter the food by hand.' });
    return;
  }

  const textBlock = response.content.find(b => b.type === 'text');
  let result;
  try {
    result = JSON.parse(textBlock.text);
  } catch (e) {
    console.error('analyze-food unparseable output', response.stop_reason);
    res.status(502).json({ error: 'The analysis came back incomplete. Try again.' });
    return;
  }

  const num = v => Math.max(0, Math.round(Number(v) || 0));
  res.status(200).json({
    items: (result.items || []).map(it => ({
      name: String(it.name || '').trim(),
      portion: String(it.portion || '').trim(),
      calories: num(it.calories),
      protein: num(it.protein_g),
      carbs: num(it.carbs_g),
      fat: num(it.fat_g)
    })).filter(it => it.name),
    notes: String(result.notes || '').trim()
  });
};
