import { verifyKey } from 'discord-interactions';
import { logger } from '../src/utils/logger';
import { handleHttpReactionRoleInteraction } from '../src/utils/reactionRoleHttpHandler';
import { handleHttpSuggestionInteraction, handleHttpSuggestionCommand } from '../src/utils/suggestionHttpHandler';
import { handleHttpTicketInteraction } from '../src/utils/ticketHttpHandler';
import { handleHttpConfigCommand, handleHttpConfigInteraction } from '../src/utils/configHttpHandler';
import { HttpInteractionContext, parseCommandOptions, parseModalComponents, ResponseTypes } from '../src/utils/httpInteractionContext';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  console.log('[DIAGNOSTIC] interactions endpoint reached');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  // Read raw body using async iterators which are safe against stream buffering
  let rawBody = '';
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    rawBody = Buffer.concat(chunks).toString('utf8');
    console.log('[DIAGNOSTIC] Method:', req.method);
    console.log('[DIAGNOSTIC] x-signature-ed25519 exists:', !!signature);
    console.log('[DIAGNOSTIC] x-signature-timestamp exists:', !!timestamp);
    console.log('[DIAGNOSTIC] Raw body length:', rawBody.length);
    const pubKey = process.env.DISCORD_PUBLIC_KEY;
    console.log('[DIAGNOSTIC] DISCORD_PUBLIC_KEY exists:', !!pubKey);
    if (pubKey) {
      console.log('[DIAGNOSTIC] DISCORD_PUBLIC_KEY length:', pubKey.length);
      console.log('[DIAGNOSTIC] DISCORD_PUBLIC_KEY starts with:', pubKey.substring(0, 4) + '...');
    }
  } catch (err) {
    console.error('[DIAGNOSTIC] Failed to read raw body:', err);
    return res.status(500).json({ error: 'Internal Server Error reading body' });
  }

  const isValidRequest = await verifyKey(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY!
  );
  console.log('[DIAGNOSTIC] verifyKey result:', isValidRequest);

  if (!isValidRequest) {
    return res.status(401).json({ error: 'Bad request signature' });
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  try {
    console.log('[DIAGNOSTIC] Parsed interaction type:', interaction.type);
    if (interaction.type === 1) { // PING
      console.log('[DIAGNOSTIC] Returning HTTP 200 { type: 1 } for PING');
      return res.status(200).json({ type: ResponseTypes.PONG });
    }

    const respond = (data: any, type: number = ResponseTypes.CHANNEL_MESSAGE_WITH_SOURCE) => {
      res.status(200).json({ type, data });
    };

    const ctx: HttpInteractionContext = {
      id: interaction.id,
      token: interaction.token,
      applicationId: interaction.application_id,
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      userId: interaction.member?.user?.id || interaction.user?.id,
      memberPermissions: interaction.member?.permissions,
    };

    if (interaction.type === 2) { // APPLICATION_COMMAND
      ctx.commandName = interaction.data.name;
      ctx.options = parseCommandOptions(interaction.data.options);
      
      if (ctx.commandName === 'suggestion') {
        const handled = await handleHttpSuggestionCommand(ctx, respond);
        if (handled) return;
      }

      if (ctx.commandName === 'config') {
        const handled = await handleHttpConfigCommand(ctx, respond);
        if (handled) return;
      }
      
      // Feature adaptation boundary: Route to shared service layer
      // e.g. return respond(await ticketService.handleCreate(ctx));
      return respond({ content: `Vercel HTTP: Executing command ${ctx.commandName}`, flags: 64 });
    }

    if (interaction.type === 3) { // MESSAGE_COMPONENT
      ctx.customId = interaction.data.custom_id;
      ctx.componentValues = interaction.data.values;
      
      // Attempt Reaction Role route first
      if (ctx.customId?.startsWith('rr:')) {
        const handled = await handleHttpReactionRoleInteraction(ctx, respond);
        if (handled) return;
      }
      
      // Attempt Suggestion route
      if (ctx.customId?.startsWith('suggestion:')) {
        const handled = await handleHttpSuggestionInteraction(ctx, respond);
        if (handled) return;
      }

      // Attempt Ticket route
      if (ctx.customId?.startsWith('ticket_')) {
        const handled = await handleHttpTicketInteraction(ctx, respond);
        if (handled) return;
      }

      // Attempt Config route
      if (ctx.customId?.startsWith('config_')) {
        const handled = await handleHttpConfigInteraction(ctx, respond);
        if (handled) return;
      }
      
      return respond({ content: `Vercel HTTP: Handled component ${ctx.customId}`, flags: 64 });
    }

    if (interaction.type === 5) { // MODAL_SUBMIT
      ctx.customId = interaction.data.custom_id;
      ctx.modalFields = parseModalComponents(interaction.data.components);
      
      if (ctx.customId?.startsWith('suggestion:')) {
        const handled = await handleHttpSuggestionInteraction(ctx, respond);
        if (handled) return;
      }
      
      if (ctx.customId?.startsWith('ticket_')) {
        const handled = await handleHttpTicketInteraction(ctx, respond);
        if (handled) return;
      }

      if (ctx.customId?.startsWith('config_')) {
        const handled = await handleHttpConfigInteraction(ctx, respond);
        if (handled) return;
      }
      
      return respond({ content: `Vercel HTTP: Handled modal ${ctx.customId}`, flags: 64 });
    }

    return respond({ content: 'Unknown interaction type received.', flags: 64 });
  } catch (error) {
    logger.error('Error handling interaction', error);
    if (!res.headersSent) {
      return res.status(500).json({
        type: ResponseTypes.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'An unexpected error occurred while processing this interaction.', flags: 64 }
      });
    }
  }
}

