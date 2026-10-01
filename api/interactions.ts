import { verifyKey } from 'discord-interactions';
import { logger } from '../src/utils/logger';
import { handleHttpReactionRoleInteraction } from '../src/utils/reactionRoleHttpHandler';
import { handleHttpSuggestionInteraction, handleHttpSuggestionCommand } from '../src/utils/suggestionHttpHandler';
import { handleHttpTicketInteraction } from '../src/utils/ticketHttpHandler';
import { handleHttpConfigCommand, handleHttpConfigInteraction } from '../src/utils/configHttpHandler';
import { HttpInteractionContext, parseCommandOptions, parseModalComponents, ResponseTypes } from '../src/utils/httpInteractionContext';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = JSON.stringify(req.body);

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  const isValidRequest = verifyKey(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY!
  );

  if (!isValidRequest) {
    return res.status(401).json({ error: 'Bad request signature' });
  }

  const interaction = req.body;

  try {
    if (interaction.type === 1) { // PING
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

