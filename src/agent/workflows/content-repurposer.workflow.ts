import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const contentRepurposerSchema = z.object({
  // Empty string = platform not requested by the user.
  linkedin_post: z.string(),
  x_post: z.string(),
  short_post: z.string(),
  hooks: z.array(z.string()).min(1).max(6),
  ctas: z.array(z.string()).min(1).max(5),
});

export const contentRepurposerWorkflow: WorkflowDefinition = {
  key: 'content_repurposer',
  name: 'Content Repurposer',
  tagline: 'One piece of content — native posts for every platform.',
  icon: 'share-social-outline',
  premium: false,
  fields: [
    { name: 'original_content', label: 'Original content', type: 'textarea', required: true, placeholder: 'Paste a blog post, article, video script or idea…' },
    { name: 'platforms', label: 'Target platforms (optional)', type: 'select', required: false, options: ['LinkedIn + X + Instagram', 'LinkedIn + X', 'LinkedIn only', 'X only', 'Instagram only'] },
    { name: 'tone', label: 'Tone (optional)', type: 'select', required: false, options: ['Professional', 'Conversational', 'Bold', 'Story-driven', 'Educational'] },
  ],
  schema: contentRepurposerSchema,
  buildPrompts(input) {
    return {
      system: `${BASE_SYSTEM}\n\nYou are a social media strategist. Each post must feel NATIVE to its platform: LinkedIn = professional insight with line breaks and no hashtags spam; X = under 280 characters, punchy; Instagram-style short post = scannable with emoji-light formatting.`,
      user: `Repurpose this content.\n\n${renderUserInput(input)}\n\nRules:\n- "Platforms" lists the ONLY platforms to generate. For every platform NOT listed, return an empty string "".\n- If no platforms are given, generate all three.\n- If a "Tone" is given, match it across hooks, CTAs and posts.\n- Each requested post must feel NATIVE to its platform.\n\nReturn JSON with exactly this shape:\n{\n  "linkedin_post": "LinkedIn post text with platform-native formatting, or \\"\\"",\n  "x_post": "X/Twitter post text, max 280 characters, or \\"\\"",\n  "short_post": "short Instagram/Facebook-style post text, or \\"\\"",\n  "hooks": ["hook line 1", "hook line 2", "hook line 3"],\n  "ctas": ["call to action 1", "call to action 2"]\n}`,
    };
  },
};
