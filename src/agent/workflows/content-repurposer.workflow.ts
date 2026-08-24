import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const contentRepurposerSchema = z.object({
  linkedin_post: z.string().min(1),
  x_post: z.string().min(1),
  short_post: z.string().min(1),
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
      user: `Repurpose this content.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  linkedin_post: 'LinkedIn post, platform-native formatting',
  x_post: 'X/Twitter post, max 280 characters',
  short_post: 'short Instagram/Facebook-style post',
  hooks: 'array of 3-6 alternative opening hook lines',
  ctas: 'array of 2-4 call-to-action options',
})}
}`,
    };
  },
};
