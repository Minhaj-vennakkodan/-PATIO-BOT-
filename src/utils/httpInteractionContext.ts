import { logger } from './logger';

export interface HttpInteractionContext {
  id: string;
  token: string;
  applicationId: string;
  guildId?: string;
  channelId?: string;
  userId: string;
  memberPermissions?: string;
  commandName?: string;
  options?: Record<string, any>;
  customId?: string;
  componentValues?: string[];
  modalFields?: Record<string, string>;
}

export function parseModalComponents(components: any[]): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!components) return fields;
  for (const row of components) {
    for (const component of row.components || []) {
      fields[component.custom_id] = component.value;
    }
  }
  return fields;
}

export function parseCommandOptions(options: any[]): Record<string, any> {
  const parsed: Record<string, any> = {};
  if (!options) return parsed;
  for (const opt of options) {
    if (opt.options) {
      parsed[opt.name] = parseCommandOptions(opt.options);
    } else {
      parsed[opt.name] = opt.value;
    }
  }
  return parsed;
}

export const ResponseTypes = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
};
